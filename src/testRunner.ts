import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as path from 'path';
import { Feature, Scenario } from './featureParser';
import { ConfigManager } from './configManager';

export interface RunResult {
    success: boolean;
    output: string;
    error?: string;
}

export class TestRunner {
    private configManager: ConfigManager;
    private outputChannel: vscode.OutputChannel;
    private runningProcesses: Map<string, cp.ChildProcess> = new Map();

    constructor(configManager: ConfigManager) {
        this.configManager = configManager;
        this.outputChannel = vscode.window.createOutputChannel('Behave Test Runner');
    }

    /**
     * Run all scenarios in a feature
     */
    public async runFeature(
        feature: Feature,
        token?: vscode.CancellationToken,
        customArgs?: string[]
    ): Promise<RunResult> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(feature.uri);
        if (!workspaceFolder) {
            return { success: false, output: '', error: 'No workspace folder found' };
        }

        // Build arguments
        const args = await this.buildArgs(feature, undefined, customArgs);

        return this.executeRunner(workspaceFolder.uri.fsPath, args, token);
    }

    /**
     * Run a specific scenario
     */
    public async runScenario(
        feature: Feature,
        scenario: Scenario,
        token?: vscode.CancellationToken,
        customArgs?: string[]
    ): Promise<RunResult> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(feature.uri);
        if (!workspaceFolder) {
            return { success: false, output: '', error: 'No workspace folder found' };
        }

        const args = await this.buildArgs(feature, scenario, customArgs);

        // Use scenario name or tag to target specific scenario
        // If scenario has unique tags, use the first one
        const uniqueTags = scenario.tags.filter(
            t => !feature.tags.some(ft => ft.name === t.name)
        );

        if (uniqueTags.length > 0) {
            // Use the first unique tag
            args.push(`--tag=${uniqueTags[0].name}`);
        } else {
            // Fall back to using --name with scenario name
            args.push(`--name=${this.escapeScenarioName(scenario.name)}`);
        }

        return this.executeRunner(workspaceFolder.uri.fsPath, args, token);
    }

    /**
     * Run scenarios by tag
     */
    public async runByTag(tag: string, customArgs?: string[]): Promise<RunResult> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            return { success: false, output: '', error: 'No workspace folder found' };
        }

        const args = await this.buildArgs(undefined, undefined, customArgs);
        args.push(`--tag=${tag}`);

        return this.executeRunner(workspaceFolder.uri.fsPath, args);
    }

    /**
     * Debug a feature
     */
    public async debugFeature(feature: Feature, customArgs?: string[]): Promise<void> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(feature.uri);
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const args = await this.buildArgs(feature, undefined, customArgs);

        await this.launchDebugSession(workspaceFolder.uri.fsPath, args);
    }

    /**
     * Debug a specific scenario
     */
    public async debugScenario(
        feature: Feature,
        scenario: Scenario,
        customArgs?: string[]
    ): Promise<void> {
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(feature.uri);
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const args = await this.buildArgs(feature, scenario, customArgs);

        const uniqueTags = scenario.tags.filter(
            t => !feature.tags.some(ft => ft.name === t.name)
        );

        if (uniqueTags.length > 0) {
            args.push(`--tag=${uniqueTags[0].name}`);
        } else {
            args.push(`--name=${this.escapeScenarioName(scenario.name)}`);
        }

        await this.launchDebugSession(workspaceFolder.uri.fsPath, args);
    }

    /**
     * Build command arguments from configuration
     */
    private async buildArgs(
        feature?: Feature,
        scenario?: Scenario,
        customArgs?: string[]
    ): Promise<string[]> {
        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        const args: string[] = [];

        // Add custom args first if provided
        if (customArgs && customArgs.length > 0) {
            args.push(...customArgs);
        } else {
            // Add default args from configuration
            const defaultArgs = config.get<string[]>('defaultArgs', []);
            args.push(...defaultArgs);

            const excludeTag = config.get<string>('excludeTag');
            if (excludeTag) {
                args.push(`--exclude_tag=${excludeTag}`);
            }
        }

        return args;
    }

    /**
     * Execute the runner script
     */
    private async executeRunner(
        cwd: string,
        args: string[],
        token?: vscode.CancellationToken
    ): Promise<RunResult> {
        return new Promise((resolve) => {
            const config = vscode.workspace.getConfiguration('behaveTestExplorer');
            const pythonPath = config.get<string>('pythonPath', 'python');
            const runnerScript = config.get<string>('runnerScript', 'runner.py');

            const fullArgs = [runnerScript, ...args];

            this.outputChannel.show(true);
            this.outputChannel.appendLine(`\n${'='.repeat(60)}`);
            this.outputChannel.appendLine(`Running: ${pythonPath} ${fullArgs.join(' ')}`);
            this.outputChannel.appendLine(`Working directory: ${cwd}`);
            this.outputChannel.appendLine(`${'='.repeat(60)}\n`);

            let output = '';
            let errorOutput = '';

            const childProcess = cp.spawn(pythonPath, fullArgs, {
                cwd,
                env: { ...process.env },
                shell: true
            });

            const processId = `${Date.now()}`;
            this.runningProcesses.set(processId, childProcess);

            // Handle cancellation
            if (token) {
                token.onCancellationRequested(() => {
                    childProcess.kill('SIGTERM');
                    this.runningProcesses.delete(processId);
                });
            }

            childProcess.stdout?.on('data', (data: Buffer) => {
                const text = data.toString();
                output += text;
                this.outputChannel.append(text);
            });

            childProcess.stderr?.on('data', (data: Buffer) => {
                const text = data.toString();
                errorOutput += text;
                this.outputChannel.append(text);
            });

            childProcess.on('close', (code: number | null) => {
                this.runningProcesses.delete(processId);

                // Check both exit code AND output for failure indicators
                const combinedOutput = output + errorOutput;
                const hasFailureInOutput = this.detectFailureInOutput(combinedOutput);
                const success = code === 0 && !hasFailureInOutput;

                this.outputChannel.appendLine(`\nProcess exited with code: ${code}`);
                if (hasFailureInOutput && code === 0) {
                    this.outputChannel.appendLine(`Note: Test failures detected in output despite exit code 0`);
                }

                resolve({
                    success,
                    output: combinedOutput,
                    error: success ? undefined : this.extractFailureMessage(combinedOutput) || errorOutput || `Process exited with code ${code}`
                });
            });

            childProcess.on('error', (error: Error) => {
                this.runningProcesses.delete(processId);
                this.outputChannel.appendLine(`\nError: ${error.message}`);

                resolve({
                    success: false,
                    output,
                    error: error.message
                });
            });
        });
    }

    /**
     * Launch a debug session
     */
    private async launchDebugSession(cwd: string, args: string[]): Promise<void> {
        const config = vscode.workspace.getConfiguration('behaveTestExplorer');
        const pythonPath = config.get<string>('pythonPath', 'python');
        const runnerScript = config.get<string>('runnerScript', 'runner.py');

        // Handle absolute vs relative runner script paths
        const program = path.isAbsolute(runnerScript)
            ? runnerScript
            : `\${workspaceFolder}/${runnerScript}`;

        const debugConfig: vscode.DebugConfiguration = {
            name: 'Debug Behave Test',
            type: 'debugpy',
            request: 'launch',
            program: program,
            console: 'integratedTerminal',
            args: args,
            cwd: cwd,
            python: pythonPath
        };

        await vscode.debug.startDebugging(
            vscode.workspace.workspaceFolders?.[0],
            debugConfig
        );
    }

    /**
     * Detect if there are test failures in the output
     */
    private detectFailureInOutput(output: string): boolean {
        const failurePatterns = [
            /Failing scenarios:/i,
            /\d+ features? passed,\s*\d+ failed/i,
            /\d+ scenarios? passed,\s*\d+ failed/i,
            /\d+ steps? passed,\s*\d+ failed/i,
            /FAILED/,
            /AssertionError/i,
            /Assertion failed/i,
            /Error:/i,
            /Traceback \(most recent call last\)/i,
            /failures=\d+[^0]/i,
            /errors=\d+[^0]/i,
        ];

        return failurePatterns.some(pattern => pattern.test(output));
    }

    /**
     * Extract a meaningful failure message from the output
     */
    private extractFailureMessage(output: string): string | undefined {
        // Try to find specific failure information
        const patterns = [
            /Failing scenarios:[\s\S]*?(?=\n\n|\d+ feature)/i,
            /AssertionError:.*$/m,
            /Assertion failed:.*$/m,
            /Error:.*$/m,
        ];

        for (const pattern of patterns) {
            const match = output.match(pattern);
            if (match) {
                return match[0].trim().substring(0, 500); // Limit to 500 chars
            }
        }

        // Look for summary line with failures
        const summaryMatch = output.match(/\d+ scenarios?.*\d+ failed/i);
        if (summaryMatch) {
            return summaryMatch[0];
        }

        return undefined;
    }

    /**
     * Escape scenario name for command line
     */
    private escapeScenarioName(name: string): string {
        // Escape special regex characters and wrap in quotes
        return `"${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`;
    }

    /**
     * Stop all running tests
     */
    public stopAllTests(): void {
        for (const [id, process] of this.runningProcesses) {
            process.kill('SIGTERM');
            this.runningProcesses.delete(id);
        }
    }

    /**
     * Get output channel
     */
    public getOutputChannel(): vscode.OutputChannel {
        return this.outputChannel;
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        this.stopAllTests();
        this.outputChannel.dispose();
    }
}
