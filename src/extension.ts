import * as vscode from 'vscode';
import { BehaveTestController } from './testController';
import { ConfigManager } from './configManager';
import { FeatureParser } from './featureParser';

let testController: BehaveTestController | undefined;
let configManager: ConfigManager | undefined;
let statusBarItem: vscode.StatusBarItem | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('Behave Test Explorer is now active!');

    // Initialize config manager
    configManager = new ConfigManager();
    configManager.initialize(context);

    // Initialize test controller
    testController = new BehaveTestController(context);

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );
    statusBarItem.command = 'behaveTestExplorer.selectArgPreset';
    statusBarItem.tooltip = 'Click to select argument preset';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('behaveTestExplorer.refreshTests', () => {
            testController?.discoverTests();
            vscode.window.showInformationMessage('Behave tests refreshed');
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('behaveTestExplorer.runWithArgs', async (item?: vscode.TestItem) => {
            if (testController) {
                await testController.runWithCustomArgs(item);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('behaveTestExplorer.configureArgs', async () => {
            if (configManager) {
                await configManager.configureArgs();
                updateStatusBar();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('behaveTestExplorer.selectArgPreset', async () => {
            if (configManager) {
                await configManager.selectPreset();
                updateStatusBar();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('behaveTestExplorer.runScenarioWithTag', async () => {
            if (testController) {
                await testController.runByTag();
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('behaveTestExplorer.debugTest', async (item?: vscode.TestItem) => {
            if (!item) {
                vscode.window.showWarningMessage('Please select a test to debug');
                return;
            }
            
            // Trigger debug through the test controller
            const controller = testController?.getController();
            if (controller) {
                const debugProfile = controller.resolveHandler;
                // Start debug session through VS Code's test API
                await vscode.commands.executeCommand('testing.debugAtCursor');
            }
        })
    );

    // Register CodeLens provider for feature files
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'feature', scheme: 'file' },
            new BehaveCodeLensProvider()
        )
    );

    // Watch for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('behaveTestExplorer')) {
                updateStatusBar();
                testController?.discoverTests();
            }
        })
    );

    // Register document symbol provider for feature files
    context.subscriptions.push(
        vscode.languages.registerDocumentSymbolProvider(
            { language: 'feature', scheme: 'file' },
            new BehaveDocumentSymbolProvider()
        )
    );
}

function updateStatusBar() {
    if (statusBarItem && configManager) {
        statusBarItem.text = configManager.getStatusText();
    }
}

export function deactivate() {
    testController?.dispose();
}

/**
 * CodeLens provider for feature files
 */
class BehaveCodeLensProvider implements vscode.CodeLensProvider {
    public provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
        const codeLenses: vscode.CodeLens[] = [];
        const feature = FeatureParser.parseContent(document.getText(), document.uri);

        if (!feature) {
            return codeLenses;
        }

        // Add CodeLens for the feature
        const featureRange = new vscode.Range(
            new vscode.Position(feature.line - 1, 0),
            new vscode.Position(feature.line - 1, 0)
        );

        codeLenses.push(
            new vscode.CodeLens(featureRange, {
                title: '▶ Run Feature',
                command: 'testing.runCurrentFile',
                arguments: []
            }),
            new vscode.CodeLens(featureRange, {
                title: '🐛 Debug Feature',
                command: 'testing.debugCurrentFile',
                arguments: []
            })
        );

        // Add CodeLens for each scenario
        for (const scenario of feature.scenarios) {
            const range = new vscode.Range(
                new vscode.Position(scenario.line - 1, 0),
                new vscode.Position(scenario.line - 1, 0)
            );

            const tags = scenario.tags.map(t => t.name).join(' ');

            codeLenses.push(
                new vscode.CodeLens(range, {
                    title: '▶ Run',
                    command: 'testing.runAtCursor',
                    arguments: []
                }),
                new vscode.CodeLens(range, {
                    title: '🐛 Debug',
                    command: 'testing.debugAtCursor',
                    arguments: []
                })
            );

            if (tags) {
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        title: `Tags: ${tags}`,
                        command: '',
                        arguments: []
                    })
                );
            }
        }

        return codeLenses;
    }
}

/**
 * Document symbol provider for feature files
 */
class BehaveDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    public provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        const feature = FeatureParser.parseContent(document.getText(), document.uri);

        if (!feature) {
            return symbols;
        }

        // Create feature symbol
        const featureRange = new vscode.Range(
            new vscode.Position(feature.line - 1, 0),
            new vscode.Position(document.lineCount - 1, 0)
        );

        const featureSymbol = new vscode.DocumentSymbol(
            feature.name,
            feature.tags.map(t => t.name).join(' '),
            vscode.SymbolKind.Class,
            featureRange,
            new vscode.Range(
                new vscode.Position(feature.line - 1, 0),
                new vscode.Position(feature.line - 1, 100)
            )
        );

        // Add scenario symbols as children
        for (let i = 0; i < feature.scenarios.length; i++) {
            const scenario = feature.scenarios[i];
            const nextScenario = feature.scenarios[i + 1];
            
            const startLine = scenario.line - 1;
            const endLine = nextScenario 
                ? nextScenario.line - 2 
                : document.lineCount - 1;

            const scenarioRange = new vscode.Range(
                new vscode.Position(startLine, 0),
                new vscode.Position(endLine, 0)
            );

            const scenarioSymbol = new vscode.DocumentSymbol(
                scenario.name,
                scenario.tags.filter(t => !feature.tags.some(ft => ft.name === t.name))
                    .map(t => t.name).join(' '),
                scenario.type === 'Scenario Outline' 
                    ? vscode.SymbolKind.Interface 
                    : vscode.SymbolKind.Method,
                scenarioRange,
                new vscode.Range(
                    new vscode.Position(startLine, 0),
                    new vscode.Position(startLine, 100)
                )
            );

            featureSymbol.children.push(scenarioSymbol);
        }

        symbols.push(featureSymbol);
        return symbols;
    }
}
