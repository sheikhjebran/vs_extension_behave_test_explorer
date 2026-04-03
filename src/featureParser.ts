import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface Tag {
    name: string;
    line: number;
}

export interface Scenario {
    name: string;
    line: number;
    tags: Tag[];
    type: 'Scenario' | 'Scenario Outline';
    examples?: Example[];
}

export interface Example {
    name: string;
    line: number;
    tags: Tag[];
}

export interface Feature {
    name: string;
    uri: vscode.Uri;
    line: number;
    tags: Tag[];
    scenarios: Scenario[];
    background?: {
        name: string;
        line: number;
    };
}

export class FeatureParser {
    private static readonly FEATURE_REGEX = /^\s*Feature:\s*(.+)$/;
    private static readonly SCENARIO_REGEX = /^\s*(Scenario|Scenario Outline):\s*(.+)$/;
    private static readonly BACKGROUND_REGEX = /^\s*Background:\s*(.*)$/;
    // Updated regex to capture complete tags including colons and numbers (e.g., @tc:1223)
    private static readonly TAG_REGEX = /@[^\s]+/g;
    private static readonly EXAMPLES_REGEX = /^\s*Examples:\s*(.*)$/;

    /**
     * Parse a single feature file and extract all features and scenarios
     */
    public static async parseFeatureFile(uri: vscode.Uri): Promise<Feature | null> {
        try {
            const content = await fs.readFile(uri.fsPath, 'utf-8');
            return this.parseContent(content, uri);
        } catch (error) {
            console.error(`Error parsing feature file ${uri.fsPath}:`, error);
            vscode.window.showErrorMessage(`Error parsing feature file: ${uri.fsPath}`);
            return null;
        }
    }

    /**
     * Parse feature file content
     */
    public static parseContent(content: string, uri: vscode.Uri): Feature | null {
        const lines = content.split('\n');
        let feature: Feature | null = null;
        let currentTags: Tag[] = [];
        let currentScenario: Scenario | null = null;
        let inExamples = false;
        let currentExampleTags: Tag[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1; // 1-based line numbers

            // Check for tags
            const tagMatches = line.match(this.TAG_REGEX);
            if (tagMatches && !this.isComment(line)) {
                const tags = tagMatches.map(tag => ({
                    name: tag,
                    line: lineNumber
                }));

                if (inExamples) {
                    currentExampleTags.push(...tags);
                } else {
                    currentTags.push(...tags);
                }
                continue;
            }

            // Check for Feature
            const featureMatch = line.match(this.FEATURE_REGEX);
            if (featureMatch) {
                feature = {
                    name: featureMatch[1].trim(),
                    uri: uri,
                    line: lineNumber,
                    tags: [...currentTags],
                    scenarios: []
                };
                currentTags = [];
                continue;
            }

            // Check for Background
            const backgroundMatch = line.match(this.BACKGROUND_REGEX);
            if (backgroundMatch && feature) {
                feature.background = {
                    name: backgroundMatch[1].trim() || 'Background',
                    line: lineNumber
                };
                currentTags = [];
                continue;
            }

            // Check for Scenario or Scenario Outline
            const scenarioMatch = line.match(this.SCENARIO_REGEX);
            if (scenarioMatch && feature) {
                // Save previous scenario if exists
                if (currentScenario) {
                    feature.scenarios.push(currentScenario);
                }

                currentScenario = {
                    name: scenarioMatch[2].trim(),
                    line: lineNumber,
                    tags: [...currentTags],
                    type: scenarioMatch[1] as 'Scenario' | 'Scenario Outline'
                };

                // Inherit feature tags
                currentScenario.tags = [
                    ...feature.tags.filter(ft =>
                        !currentScenario!.tags.some(st => st.name === ft.name)
                    ),
                    ...currentScenario.tags
                ];

                currentTags = [];
                inExamples = false;
                continue;
            }

            // Check for Examples (in Scenario Outline)
            const examplesMatch = line.match(this.EXAMPLES_REGEX);
            if (examplesMatch && currentScenario && currentScenario.type === 'Scenario Outline') {
                if (!currentScenario.examples) {
                    currentScenario.examples = [];
                }
                currentScenario.examples.push({
                    name: examplesMatch[1].trim() || 'Examples',
                    line: lineNumber,
                    tags: [...currentExampleTags]
                });
                currentExampleTags = [];
                inExamples = true;
                continue;
            }

            // Reset tags if we hit a non-empty, non-tag line that isn't a keyword
            if (line.trim() && !this.isKeywordLine(line) && !this.isComment(line)) {
                if (!inExamples) {
                    // Don't reset if it's a step or table row
                    if (!this.isStepOrTable(line)) {
                        currentTags = [];
                    }
                }
            }
        }

        // Don't forget the last scenario
        if (currentScenario && feature) {
            feature.scenarios.push(currentScenario);
        }

        return feature;
    }

    /**
     * Check if line is a comment
     */
    private static isComment(line: string): boolean {
        return line.trim().startsWith('#');
    }

    /**
     * Check if line is a Gherkin keyword line
     */
    private static isKeywordLine(line: string): boolean {
        const keywords = ['Feature:', 'Scenario:', 'Scenario Outline:', 'Background:',
            'Given', 'When', 'Then', 'And', 'But', 'Examples:', '*'];
        const trimmed = line.trim();
        return keywords.some(kw => trimmed.startsWith(kw));
    }

    /**
     * Check if line is a step or data table row
     */
    private static isStepOrTable(line: string): boolean {
        const trimmed = line.trim();
        const stepKeywords = ['Given', 'When', 'Then', 'And', 'But', '*'];
        return stepKeywords.some(kw => trimmed.startsWith(kw)) ||
            trimmed.startsWith('|') ||
            trimmed.startsWith('"""') ||
            trimmed.startsWith("'''");
    }

    /**
     * Find all feature files in workspace
     */
    public static async findFeatureFiles(workspaceFolder: vscode.Uri, featuresPath?: string): Promise<vscode.Uri[]> {
        const pattern = featuresPath
            ? new vscode.RelativePattern(workspaceFolder, `${featuresPath}/**/*.feature`)
            : new vscode.RelativePattern(workspaceFolder, '**/*.feature');

        return vscode.workspace.findFiles(pattern, '**/node_modules/**');
    }

    /**
     * Parse all feature files in workspace
     */
    public static async parseAllFeatures(workspaceFolder: vscode.Uri, featuresPath?: string): Promise<Feature[]> {
        const featureFiles = await this.findFeatureFiles(workspaceFolder, featuresPath);
        const features: Feature[] = [];

        for (const uri of featureFiles) {
            const feature = await this.parseFeatureFile(uri);
            if (feature) {
                features.push(feature);
            }
        }

        return features;
    }

    /**
     * Get all unique tags from features
     */
    public static getAllTags(features: Feature[]): string[] {
        const tags = new Set<string>();

        for (const feature of features) {
            feature.tags.forEach(t => tags.add(t.name));
            for (const scenario of feature.scenarios) {
                scenario.tags.forEach(t => tags.add(t.name));
                scenario.examples?.forEach(ex => ex.tags.forEach(t => tags.add(t.name)));
            }
        }

        return Array.from(tags).sort();
    }

    /**
     * Find scenarios by tag
     */
    public static findScenariosByTag(features: Feature[], tag: string): Array<{ feature: Feature, scenario: Scenario }> {
        const results: Array<{ feature: Feature, scenario: Scenario }> = [];

        for (const feature of features) {
            for (const scenario of feature.scenarios) {
                if (scenario.tags.some(t => t.name === tag)) {
                    results.push({ feature, scenario });
                }
            }
        }

        return results;
    }
}
