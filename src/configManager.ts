// @ts-ignore: vscode is available in the extension host
import * as vscode from 'vscode';

/**
 * Represents a named argument preset for test runs.
 */
export interface ArgPreset {
    name: string;
    args: string[];
}

/**
 * Manages configuration and argument presets for the extension.
 */
export class ConfigManager {
    private context: vscode.ExtensionContext | undefined;
    private currentPreset: string | undefined;

    /**
     * Initialize with extension context
     */
    /**
     * Initialize the config manager with the extension context.
     */
    public initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        this.currentPreset = context.workspaceState.get('currentPreset');

        // Listen for configuration changes to customArgs
        vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
            if (e.affectsConfiguration('behaveTestExplorer.customArgs')) {
                // If the current preset is no longer valid, reset to first available
                const presets = this.getPresets();
                if (presets.length > 0 && !presets.some(p => p.name === this.currentPreset)) {
                    this.setCurrentPreset(presets[0].name);
                }
            }
        });
    }

    /**
     * Get all argument presets from configuration
     */
    /**
     * Get all argument presets from configuration.
     */
    public getPresets(): ArgPreset[] {
        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        const customArgs = config.get<Record<string, string[]>>('customArgs', {});

        return Object.entries(customArgs).map(([name, args]) => ({
            name,
            args: args as string[]
        }));
    }

    /**
     * Get a specific preset by name
     */
    /**
     * Get a specific preset by name.
     */
    public getPreset(name: string): ArgPreset | undefined {
        const presets = this.getPresets();
        return presets.find(p => p.name === name);
    }

    /**
     * Set the current active preset
     */
    /**
     * Set the current active preset.
     */
    public async setCurrentPreset(name: string | undefined): Promise<void> {
        this.currentPreset = name;
        if (this.context) {
            await this.context.workspaceState.update('currentPreset', name);
        }
    }

    /**
     * Get the current active preset
     */
    /**
     * Get the current active preset.
     */
    public getCurrentPreset(): string | undefined {
        return this.currentPreset;
    }

    /**
     * Get arguments for the current preset or default args
     * If no preset is selected but presets exist, auto-select the first one
     */
    public getCurrentArgs(): string[] {
        // If a preset is selected, use it
        if (this.currentPreset) {
            const preset = this.getPreset(this.currentPreset);
            if (preset) {
                return preset.args;
            }
        }

        // If no preset selected, check if presets exist and auto-select first one
        const presets = this.getPresets();
        if (presets.length > 0) {
            // Auto-select first preset
            this.currentPreset = presets[0].name;
            return presets[0].args;
        }

        // Return default args if no presets configured
        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        return config.get<string[]>('defaultArgs', []);
    }

    /**
     * Prompt user to enter custom arguments
     */
    public async promptForArgs(): Promise<string[] | undefined> {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter custom arguments (space-separated)',
            placeHolder: '--tag=@smoke --env=staging',
            value: this.getCurrentArgs().join(' ')
        });

        if (input === undefined) {
            return undefined;
        }

        // Parse arguments (handle quoted strings)
        return this.parseArgs(input);
    }

    /**
     * Parse argument string into array
     */
    private parseArgs(input: string): string[] {
        const args: string[] = [];
        let current = '';
        let inQuote = false;
        let quoteChar = '';

        for (const char of input) {
            if ((char === '"' || char === "'") && !inQuote) {
                inQuote = true;
                quoteChar = char;
            } else if (char === quoteChar && inQuote) {
                inQuote = false;
                quoteChar = '';
            } else if (char === ' ' && !inQuote) {
                if (current) {
                    args.push(current);
                    current = '';
                }
            } else {
                current += char;
            }
        }

        if (current) {
            args.push(current);
        }

        return args;
    }

    /**
     * Show preset selector
     */
    public async selectPreset(): Promise<string[] | undefined> {
        const presets = this.getPresets();

        if (presets.length === 0) {
            const result = await vscode.window.showWarningMessage(
                'No argument presets configured. Would you like to configure them now?',
                'Configure',
                'Enter Manually'
            );

            if (result === 'Configure') {
                await this.openSettings();
                return undefined;
            } else if (result === 'Enter Manually') {
                return this.promptForArgs();
            }
            return undefined;
        }

        // Determine current active preset (either selected or auto-selected first one)
        const activePreset = this.currentPreset || presets[0].name;

        const items: vscode.QuickPickItem[] = [
            ...presets.map(preset => ({
                label: preset.name,
                description: preset.args.join(' '),
                detail: activePreset === preset.name ? '$(check) Active - will be used for all test runs' : 'Click to activate'
            })),
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            {
                label: '$(add) Create New Preset',
                description: 'Add a new argument preset'
            },
            {
                label: '$(settings-gear) Open Settings',
                description: 'Configure presets in settings'
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Current: ${activePreset} - Select a preset to use for all test runs`,
            title: 'Behave Test Explorer - Select Argument Preset'
        });

        if (!selected) {
            return undefined;
        }

        if (selected.label === '$(add) Create New Preset') {
            await this.createPreset();
            return undefined;
        }

        if (selected.label === '$(settings-gear) Open Settings') {
            await this.openSettings();
            return undefined;
        }

        const preset = presets.find(p => p.name === selected.label);
        if (preset) {
            await this.setCurrentPreset(preset.name);
            vscode.window.showInformationMessage(`Preset "${preset.name}" is now active for all test runs`);
            return preset.args;
        }

        return undefined;
    }

    /**
     * Create a new preset
     */
    public async createPreset(): Promise<void> {
        const name = await vscode.window.showInputBox({
            prompt: 'Enter preset name',
            placeHolder: 'My Preset'
        });

        if (!name) {
            return;
        }

        const argsInput = await vscode.window.showInputBox({
            prompt: 'Enter arguments for this preset',
            placeHolder: '--tag=@smoke --format=pretty'
        });

        if (argsInput === undefined) {
            return;
        }

        const args = this.parseArgs(argsInput);

        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        const customArgs = config.get<Record<string, string[]>>('customArgs', {});

        customArgs[name] = args;

        await config.update('customArgs', customArgs, vscode.ConfigurationTarget.Workspace);

        vscode.window.showInformationMessage(`Preset "${name}" created`);
    }

    /**
     * Configure specific arguments through UI
     */
    public async configureArgs(): Promise<void> {
        const options: vscode.QuickPickItem[] = [
            { label: '$(exclude) Exclude Tag', description: 'Configure --exclude_tag argument' },
            { label: '$(file) Runner Script', description: 'Path to runner script' },
            { label: '$(terminal) Python Path', description: 'Python executable path' },
            { label: '$(folder) Features Path', description: 'Path to features directory' },
            { label: '', kind: vscode.QuickPickItemKind.Separator },
            { label: '$(add) Create Preset', description: 'Create a new argument preset' },
            { label: '$(settings-gear) Open Settings', description: 'Open full settings' }
        ];

        const selected = await vscode.window.showQuickPick(options, {
            placeHolder: 'What would you like to configure?',
            title: 'Configure Behave Test Explorer'
        });

        if (!selected) {
            return;
        }

        const config = vscode.workspace.getConfiguration('behaveTestExplorer');

        switch (selected.label) {
            case '$(exclude) Exclude Tag':
                await this.configureStringOption('excludeTag', 'Exclude Tag', config.get('excludeTag', '@ignore'));
                break;
            case '$(file) Runner Script':
                await this.configureStringOption('runnerScript', 'Runner Script', config.get('runnerScript', 'runner.py'));
                break;
            case '$(terminal) Python Path':
                await this.configureStringOption('pythonPath', 'Python Path', config.get('pythonPath', 'python'));
                break;
            case '$(folder) Features Path':
                await this.configureStringOption('featuresPath', 'Features Path', config.get('featuresPath', 'features'));
                break;
            case '$(add) Create Preset':
                await this.createPreset();
                break;
            case '$(settings-gear) Open Settings':
                await this.openSettings();
                break;
        }
    }

    /**
     * Configure a string option
     */
    private async configureStringOption(key: string, label: string, currentValue: string): Promise<void> {
        const value = await vscode.window.showInputBox({
            prompt: `Enter ${label}`,
            value: currentValue,
            placeHolder: `Enter ${label.toLowerCase()}`
        });

        if (value !== undefined) {
            const config = vscode.workspace.getConfiguration('behaveTestExplorer');
            await config.update(key, value, vscode.ConfigurationTarget.Workspace);
            vscode.window.showInformationMessage(`${label} set to: ${value || '(empty)'}`);
        }
    }

    /**
     * Open extension settings
     */
    public async openSettings(): Promise<void> {
        await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            '@ext:behave-test-explorer.behave-test-explorer'
        );
    }

    /**
     * Get status bar text showing current configuration
     */
    public getStatusText(): string {
        // If preset is explicitly selected, show it
        if (this.currentPreset) {
            return `$(beaker) ${this.currentPreset}`;
        }

        // If presets exist but none selected, show first one (auto-select behavior)
        const presets = this.getPresets();
        if (presets.length > 0) {
            return `$(beaker) ${presets[0].name}`;
        }

        return '$(beaker) Behave';
    }
}
