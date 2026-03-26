import * as vscode from 'vscode';
import { Feature, Scenario, FeatureParser } from './featureParser';
import { TestRunner } from './testRunner';
import { ConfigManager } from './configManager';

interface TestItemData {
    type: 'feature' | 'scenario';
    feature: Feature;
    scenario?: Scenario;
}

export class BehaveTestController {
    private controller: vscode.TestController;
    private testRunner: TestRunner;
    private configManager: ConfigManager;
    private testItemMap: WeakMap<vscode.TestItem, TestItemData> = new WeakMap();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private features: Feature[] = [];

    constructor(context: vscode.ExtensionContext) {
        this.controller = vscode.tests.createTestController(
            'behaveTestController',
            'Behave Tests'
        );

        this.configManager = new ConfigManager();
        this.testRunner = new TestRunner(this.configManager);

        // Register run profiles
        this.controller.createRunProfile(
            'Run Tests',
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runTests(request, token),
            true
        );

        this.controller.createRunProfile(
            'Debug Tests',
            vscode.TestRunProfileKind.Debug,
            (request, token) => this.debugTests(request, token),
            false
        );

        // Set up resolve handler for lazy loading
        this.controller.resolveHandler = async (item) => {
            if (!item) {
                await this.discoverTests();
            }
        };

        // Set up refresh handler
        this.controller.refreshHandler = async (token) => {
            await this.discoverTests();
        };

        // Watch for feature file changes
        this.setupFileWatcher();

        // Initial discovery
        this.discoverTests();

        context.subscriptions.push(this.controller);
    }

    private setupFileWatcher(): void {
        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        const featuresPath = config.get<string>('featuresPath', 'features');
        
        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            `**/${featuresPath}/**/*.feature`
        );

        this.fileWatcher.onDidCreate(() => this.discoverTests());
        this.fileWatcher.onDidChange((uri) => this.updateFeatureFile(uri));
        this.fileWatcher.onDidDelete(() => this.discoverTests());
    }

    /**
     * Discover all tests in the workspace
     */
    public async discoverTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // Clear existing items
        this.controller.items.replace([]);

        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        const featuresPath = config.get<string>('featuresPath', 'features');

        this.features = [];

        for (const folder of workspaceFolders) {
            const features = await FeatureParser.parseAllFeatures(folder.uri, featuresPath);
            this.features.push(...features);

            for (const feature of features) {
                this.addFeatureToController(feature);
            }
        }
    }

    /**
     * Update a single feature file
     */
    private async updateFeatureFile(uri: vscode.Uri): Promise<void> {
        const feature = FeatureParser.parseFeatureFile(uri);
        if (!feature) {
            return;
        }

        // Find and update existing feature item
        const existingId = this.getFeatureId(feature);
        const existingItem = this.controller.items.get(existingId);

        if (existingItem) {
            // Remove old item
            this.controller.items.delete(existingId);
        }

        // Update internal features list
        this.features = this.features.filter(f => f.uri.fsPath !== uri.fsPath);
        this.features.push(feature);

        // Add updated feature
        this.addFeatureToController(feature);
    }

    /**
     * Add a feature and its scenarios to the test controller
     */
    private addFeatureToController(feature: Feature): void {
        const featureId = this.getFeatureId(feature);
        const featureItem = this.controller.createTestItem(
            featureId,
            feature.name,
            feature.uri
        );
        
        featureItem.range = new vscode.Range(
            new vscode.Position(feature.line - 1, 0),
            new vscode.Position(feature.line - 1, 0)
        );

        // Add tags as description
        if (feature.tags.length > 0) {
            featureItem.description = feature.tags.map(t => t.name).join(' ');
        }

        // Store metadata
        this.testItemMap.set(featureItem, {
            type: 'feature',
            feature: feature
        });

        // Add scenarios
        for (const scenario of feature.scenarios) {
            const scenarioItem = this.createScenarioItem(feature, scenario);
            featureItem.children.add(scenarioItem);
        }

        this.controller.items.add(featureItem);
    }

    /**
     * Create a test item for a scenario
     */
    private createScenarioItem(feature: Feature, scenario: Scenario): vscode.TestItem {
        const scenarioId = this.getScenarioId(feature, scenario);
        const scenarioItem = this.controller.createTestItem(
            scenarioId,
            scenario.name,
            feature.uri
        );

        scenarioItem.range = new vscode.Range(
            new vscode.Position(scenario.line - 1, 0),
            new vscode.Position(scenario.line - 1, 0)
        );

        // Add tags as description
        const scenarioOnlyTags = scenario.tags.filter(
            st => !feature.tags.some(ft => ft.name === st.name)
        );
        if (scenarioOnlyTags.length > 0) {
            scenarioItem.description = scenarioOnlyTags.map(t => t.name).join(' ');
        }

        // Add tag decorator
        if (scenario.type === 'Scenario Outline') {
            scenarioItem.label = `📋 ${scenario.name}`;
        }

        // Store metadata
        this.testItemMap.set(scenarioItem, {
            type: 'scenario',
            feature: feature,
            scenario: scenario
        });

        return scenarioItem;
    }

    /**
     * Generate unique ID for a feature
     */
    private getFeatureId(feature: Feature): string {
        return `feature:${feature.uri.fsPath}`;
    }

    /**
     * Generate unique ID for a scenario
     */
    private getScenarioId(feature: Feature, scenario: Scenario): string {
        return `scenario:${feature.uri.fsPath}:${scenario.line}`;
    }

    /**
     * Run tests
     */
    private async runTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ): Promise<void> {
        const run = this.controller.createTestRun(request);
        const queue: vscode.TestItem[] = [];

        // Collect all tests to run
        if (request.include) {
            request.include.forEach(item => queue.push(item));
        } else {
            this.controller.items.forEach(item => queue.push(item));
        }

        // Exclude tests if specified
        const excludeSet = new Set(request.exclude?.map(item => item.id) || []);

        for (const item of queue) {
            if (token.isCancellationRequested) {
                run.skipped(item);
                continue;
            }

            if (excludeSet.has(item.id)) {
                run.skipped(item);
                continue;
            }

            await this.runTestItem(item, run, token);
        }

        run.end();
    }

    /**
     * Debug tests
     */
    private async debugTests(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken
    ): Promise<void> {
        const run = this.controller.createTestRun(request);
        const queue: vscode.TestItem[] = [];

        if (request.include) {
            request.include.forEach(item => queue.push(item));
        } else {
            this.controller.items.forEach(item => queue.push(item));
        }

        for (const item of queue) {
            if (token.isCancellationRequested) {
                run.skipped(item);
                continue;
            }

            await this.debugTestItem(item, run, token);
        }

        run.end();
    }

    /**
     * Run a single test item
     */
    private async runTestItem(
        item: vscode.TestItem,
        run: vscode.TestRun,
        token: vscode.CancellationToken
    ): Promise<void> {
        const data = this.testItemMap.get(item);
        if (!data) {
            run.skipped(item);
            return;
        }

        run.started(item);
        const startTime = Date.now();

        try {
            let result: { success: boolean; output: string; error?: string };

            if (data.type === 'feature') {
                // Run all scenarios in the feature
                result = await this.testRunner.runFeature(data.feature, token);
                
                // Mark all child scenarios based on parent result
                item.children.forEach(child => {
                    if (result.success) {
                        run.passed(child, Date.now() - startTime);
                    } else {
                        run.failed(child, new vscode.TestMessage(result.error || 'Test failed'), Date.now() - startTime);
                    }
                });
            } else if (data.scenario) {
                // Run single scenario
                result = await this.testRunner.runScenario(data.feature, data.scenario, token);
            } else {
                run.skipped(item);
                return;
            }

            const duration = Date.now() - startTime;

            if (result.success) {
                run.passed(item, duration);
            } else {
                const message = new vscode.TestMessage(result.error || 'Test failed');
                if (data.scenario) {
                    message.location = new vscode.Location(
                        data.feature.uri,
                        new vscode.Position(data.scenario.line - 1, 0)
                    );
                }
                run.failed(item, message, duration);
            }

            // Append output
            run.appendOutput(result.output.replace(/\n/g, '\r\n'));

        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            run.failed(item, new vscode.TestMessage(message), Date.now() - startTime);
        }
    }

    /**
     * Debug a single test item
     */
    private async debugTestItem(
        item: vscode.TestItem,
        run: vscode.TestRun,
        token: vscode.CancellationToken
    ): Promise<void> {
        const data = this.testItemMap.get(item);
        if (!data) {
            run.skipped(item);
            return;
        }

        run.started(item);

        try {
            if (data.type === 'feature') {
                await this.testRunner.debugFeature(data.feature);
            } else if (data.scenario) {
                await this.testRunner.debugScenario(data.feature, data.scenario);
            }
            
            run.passed(item);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            run.failed(item, new vscode.TestMessage(message));
        }
    }

    /**
     * Run tests with custom arguments
     */
    public async runWithCustomArgs(item?: vscode.TestItem): Promise<void> {
        const args = await this.configManager.promptForArgs();
        if (!args) {
            return;
        }

        if (item) {
            const data = this.testItemMap.get(item);
            if (data) {
                if (data.type === 'feature') {
                    await this.testRunner.runFeature(data.feature, undefined, args);
                } else if (data.scenario) {
                    await this.testRunner.runScenario(data.feature, data.scenario, undefined, args);
                }
            }
        }
    }

    /**
     * Run scenarios by tag
     */
    public async runByTag(): Promise<void> {
        const tags = FeatureParser.getAllTags(this.features);
        
        const selectedTag = await vscode.window.showQuickPick(tags, {
            placeHolder: 'Select a tag to run',
            title: 'Run Scenarios by Tag'
        });

        if (!selectedTag) {
            return;
        }

        await this.testRunner.runByTag(selectedTag);
    }

    /**
     * Get all features
     */
    public getFeatures(): Feature[] {
        return this.features;
    }

    /**
     * Get test controller
     */
    public getController(): vscode.TestController {
        return this.controller;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.fileWatcher?.dispose();
        this.controller.dispose();
    }
}
