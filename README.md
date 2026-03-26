# Behave Test Explorer

A Visual Studio Code extension that integrates Behave BDD tests with the Test Explorer, allowing you to run and debug scenarios directly from the IDE.

## Features

- **Test Explorer Integration**: View all your `.feature` files and scenarios in VS Code's Test Explorer
- **Run Individual Scenarios**: Click to run a single scenario or all scenarios in a feature
- **Debug Support**: Debug tests with breakpoints using debugpy
- **Custom Arguments**: Configure custom arguments for your test runner
- **Argument Presets**: Save and switch between different argument configurations
- **Tag-based Running**: Run scenarios by selecting tags
- **CodeLens**: Run/Debug buttons directly in your feature files
- **Document Symbols**: Navigate scenarios using the Outline view

## Installation

### From Source

1. Clone this repository
2. Run `npm install` to install dependencies
3. Run `npm run compile` to compile TypeScript
4. Press F5 to run the extension in a new VS Code window

### Building VSIX

```bash
npm install
npm run compile
npm run package
```

## Configuration

Configure the extension in your VS Code settings or workspace settings:

```json
{
    "behaveTestExplorer.runnerScript": "runner.py",
    "behaveTestExplorer.pythonPath": "python",
    "behaveTestExplorer.featuresPath": "features",
    "behaveTestExplorer.excludeTag": "@ignore",
    "behaveTestExplorer.defaultArgs": [],
    "behaveTestExplorer.customArgs": {
        "Smoke Tests": [
            "--tag=@smoke"
        ],
        "Regression": [
            "--tag=@regression",
            "--exclude_tag=@ignore"
        ]
    }
}
```

### Custom Runner Arguments

If your runner script accepts custom arguments (like `--product`, `--board`, etc.), you can configure them:

```json
{
    "behaveTestExplorer.defaultArgs": [
        "--env=staging",
        "--verbose"
    ],
    "behaveTestExplorer.customArgs": {
        "Production": ["--env=prod", "--tag=@smoke"],
        "Development": ["--env=dev", "--tag=@wip"]
    }
}
```

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `behaveTestExplorer.runnerScript` | Path to your runner script (relative to workspace) | `runner.py` |
| `behaveTestExplorer.pythonPath` | Path to Python executable | `python` |
| `behaveTestExplorer.featuresPath` | Path to features directory | `features` |
| `behaveTestExplorer.excludeTag` | Tag to exclude (`--exclude_tag`) | `@ignore` |
| `behaveTestExplorer.defaultArgs` | Array of default arguments to pass to runner | `[]` |
| `behaveTestExplorer.customArgs` | Named argument presets (object with name → args array) | `{}` |

## Usage

### Running Tests

1. Open the Test Explorer view (View → Testing or `Ctrl+Shift+T`)
2. Your feature files and scenarios will appear in the tree
3. Click the play button to run:
   - A single scenario
   - All scenarios in a feature
   - All tests in the workspace

### Using Custom Arguments

1. Click the Behave status bar item (bottom left) to select an argument preset
2. Or use command palette: `Behave Test Explorer: Select Argument Preset`
3. Or right-click a test and select "Run with Custom Arguments"

### Running by Tag

1. Open command palette (`Ctrl+Shift+P`)
2. Run `Behave Test Explorer: Run Scenario by Tag`
3. Select a tag from the list

### Configuring Arguments

1. Open command palette
2. Run `Behave Test Explorer: Configure Arguments`
3. Select what you want to configure

### Creating Presets

Add presets in your settings.json:

```json
{
    "behaveTestExplorer.customArgs": {
        "My Preset Name": [
            "--tag=@myTag",
            "--format=pretty"
        ],
        "CI Pipeline": [
            "--tag=@smoke",
            "--no-capture",
            "--format=json"
        ]
    }
}
```

## Commands

| Command | Description |
|---------|-------------|
| `Behave Test Explorer: Refresh Tests` | Refresh the test tree |
| `Behave Test Explorer: Run with Custom Arguments` | Run selected test with custom args |
| `Behave Test Explorer: Configure Arguments` | Open argument configuration UI |
| `Behave Test Explorer: Select Argument Preset` | Switch between saved presets |
| `Behave Test Explorer: Run Scenario by Tag` | Run all scenarios with a specific tag |

## Runner Script Compatibility

This extension is designed to work with custom runner scripts (like `runner.py`) or directly with Behave. Common arguments:

- `--tag=<value>` - Run scenarios with this tag
- `--exclude_tag=<value>` - Exclude scenarios with this tag  
- `--name=<value>` - Run scenario by name
- `--include=<path>` - Include specific feature file
- Any custom arguments your runner script accepts

You can configure any arguments your runner needs using `defaultArgs` or `customArgs` presets.
- `--include=<path>` - Include specific feature file

If your runner uses different arguments, configure them using `defaultArgs` or create presets.

## Requirements

- VS Code 1.85.0 or higher
- Python 3.x with Behave installed
- A runner script (like `runner.py`)

## Troubleshooting

### Tests not appearing

1. Make sure your `.feature` files are in the configured `featuresPath` directory
2. Run `Behave Test Explorer: Refresh Tests` command
3. Check the output channel "Behave Test Runner" for errors

### Tests failing to run

1. Verify `pythonPath` is correct
2. Verify `runnerScript` path is correct
3. Check the output channel for the exact command being run

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
