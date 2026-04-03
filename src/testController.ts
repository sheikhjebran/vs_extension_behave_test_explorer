import * as vscode from 'vscode';
import * as path from 'path';
import { Feature, Scenario, FeatureParser } from './featureParser';
import { TestRunner } from './testRunner';
import { ConfigManager } from './configManager';

/**
 * Metadata for each test item in the controller.
 */
interface TestItemData {
    type: 'folder' | 'feature' | 'scenario';
    feature?: Feature;
    scenario?: Scenario;
    folderPath?: string;
}

/**
 * Main controller for Behave test integration with VS Code Test Explorer.
 */
export class BehaveTestController {
    private controller: vscode.TestController;
    private testRunner: TestRunner;
    private configManager: ConfigManager;
    private testItemMap: WeakMap<vscode.TestItem, TestItemData> = new WeakMap();
    private folderItems: Map<string, vscode.TestItem> = new Map();
    private fileWatcher: vscode.FileSystemWatcher | undefined;
    private features: Feature[] = [];
    private workspaceFolder: vscode.WorkspaceFolder | undefined;
    private featuresPath: string = 'features';

    constructor(context: vscode.ExtensionContext, configManager: ConfigManager) {
        this.controller = vscode.tests.createTestController(
            'behaveTestController',
            'Behave Tests'
        );

        this.configManager = configManager;
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

        // Listen for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('behaveTestExplorer.featuresPath')) {
                    const config = vscode.workspace.getConfiguration('behaveTestExplorer');
                    this.featuresPath = config.get<string>('featuresPath', 'features');
                    this.setupFileWatcher();
                    this.discoverTests();
                }
            })
        );

        // Initial discovery
        this.discoverTests();

        context.subscriptions.push(this.controller);
    }

    private setupFileWatcher(): void {
        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        this.featuresPath = config.get<string>('featuresPath', 'features');

        this.fileWatcher = vscode.workspace.createFileSystemWatcher(
            `**/${this.featuresPath}/**/*.feature`
        );

        this.fileWatcher.onDidCreate(() => this.discoverTests());
        this.fileWatcher.onDidChange((uri) => this.updateFeatureFile(uri));
        this.fileWatcher.onDidDelete(() => this.discoverTests());
    }

    /**
     * Discover all tests in the workspace
     */
    /**
     * Discover all tests in the workspace and update the test explorer.
     */
    public async discoverTests(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            return;
        }

        // Clear existing items
        this.controller.items.replace([]);
        this.folderItems.clear();

        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        this.featuresPath = config.get<string>('featuresPath', 'features');

        this.features = [];

        for (const folder of workspaceFolders) {
            this.workspaceFolder = folder;
            const features = await FeatureParser.parseAllFeatures(folder.uri, this.featuresPath);
            this.features.push(...features);

            // Group features by folder structure
            for (const feature of features) {
                this.addFeatureWithHierarchy(feature, folder);
            }
        }
    }

    /**
     * Add a feature with folder hierarchy
     */
    /**
     * Add a feature to the test explorer, creating folder hierarchy as needed.
     */
    private addFeatureWithHierarchy(feature: Feature, workspaceFolder: vscode.WorkspaceFolder): void {
        // Get the relative path from workspace/features folder
        const featuresBasePath = path.join(workspaceFolder.uri.fsPath, this.featuresPath);
        const featureFilePath = feature.uri.fsPath;
        const relativePath = path.relative(featuresBasePath, featureFilePath);

        // Split the path to get folder hierarchy
        const pathParts = relativePath.split(path.sep);
        const fileName = pathParts.pop()!; // Remove the filename

        // Get or create the parent folder item
        let parentItem: vscode.TestItem | undefined;
        let currentPath = '';

        for (const folderName of pathParts) {
            const previousPath = currentPath;
            currentPath = currentPath ? path.join(currentPath, folderName) : folderName;

            if (!this.folderItems.has(currentPath)) {
                // Create folder item
                const folderId = `folder:${currentPath}`;
                const folderItem = this.controller.createTestItem(
                    folderId,
                    `📁 ${folderName}`,
                    vscode.Uri.file(path.join(featuresBasePath, currentPath))
                );

                // Store folder metadata
                this.testItemMap.set(folderItem, {
                    type: 'folder',
                    folderPath: currentPath
                });

                this.folderItems.set(currentPath, folderItem);

                // Add to parent or root
                if (parentItem) {
                    parentItem.children.add(folderItem);
                } else {
                    this.controller.items.add(folderItem);
                }
            }

            parentItem = this.folderItems.get(currentPath);
        }

        // Create the feature item
        const featureItem = this.createFeatureItem(feature);

        // Add to parent folder or root
        if (parentItem) {
            parentItem.children.add(featureItem);
        } else {
            this.controller.items.add(featureItem);
        }
    }

    /**
     * Create a feature test item
     */
    private createFeatureItem(feature: Feature): vscode.TestItem {
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

        return featureItem;
    }

    /**
     * Update a single feature file
     */
    private async updateFeatureFile(uri: vscode.Uri): Promise<void> {
        // Re-discover all tests to maintain hierarchy
        await this.discoverTests();
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

        // Add tags as description (show all scenario tags)
        const scenarioOnlyTags = scenario.tags.filter(
            st => !feature.tags.some(ft => ft.name === st.name)
        );
        if (scenarioOnlyTags.length > 0) {
            scenarioItem.description = scenarioOnlyTags.map(t => t.name).join(' ');
        }

        // Add icon for Scenario Outline
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

        // For folder items, run all children
        if (data.type === 'folder') {
            for (const [, child] of item.children) {
                await this.runTestItem(child, run, token);
            }
            return;
        }

        run.started(item);
        const startTime = Date.now();

        // Get configured arguments from preset or defaults
        const configuredArgs = this.configManager.getCurrentArgs();

        try {
            let result: { success: boolean; output: string; error?: string };

            if (data.type === 'feature' && data.feature) {
                // Run all scenarios in the feature
                result = await this.testRunner.runFeature(data.feature, token, configuredArgs);

                // Mark all child scenarios based on parent result
                item.children.forEach(child => {
                    if (result.success) {
                        run.passed(child, Date.now() - startTime);
                    } else {
                        run.failed(child, new vscode.TestMessage(result.error || 'Test failed'), Date.now() - startTime);
                    }
                });
            } else if (data.type === 'scenario' && data.scenario && data.feature) {
                // Run single scenario
                result = await this.testRunner.runScenario(data.feature, data.scenario, token, configuredArgs);
            } else {
                run.skipped(item);
                return;
            }

            const duration = Date.now() - startTime;

            if (result.success) {
                run.passed(item, duration);
            } else {
                const message = new vscode.TestMessage(result.error || 'Test failed');
                if (data.scenario && data.feature) {
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

        // For folder items, debug first child (can't debug all at once)
        if (data.type === 'folder') {
            const firstChild = item.children.get(Array.from(item.children)[0]?.[0]);
            if (firstChild) {
                await this.debugTestItem(firstChild, run, token);
            }
            return;
        }

        run.started(item);

        // Get configured arguments from preset or defaults
        const configuredArgs = this.configManager.getCurrentArgs();

        try {
            if (data.type === 'feature' && data.feature) {
                await this.testRunner.debugFeature(data.feature, configuredArgs);
            } else if (data.type === 'scenario' && data.scenario && data.feature) {
                await this.testRunner.debugScenario(data.feature, data.scenario, configuredArgs);
            }

            run.passed(item);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            run.failed(item, new vscode.TestMessage(message));
        }
    }

    /**
     * Run tests with custom arguments (prompts for input)
     */
    public async runWithCustomArgs(item?: vscode.TestItem): Promise<void> {
        const args = await this.configManager.promptForArgs();
        if (!args) {
            return;
        }

        if (item) {
            const data = this.testItemMap.get(item);
            if (data) {
                if (data.type === 'feature' && data.feature) {
                    await this.testRunner.runFeature(data.feature, undefined, args);
                } else if (data.type === 'scenario' && data.scenario && data.feature) {
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

        // Use configured args when running by tag
        const configuredArgs = this.configManager.getCurrentArgs();
        await this.testRunner.runByTag(selectedTag, configuredArgs);
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
