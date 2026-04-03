## How to Tag and Publish the VS Code Extension

To publish a new version of your extension to the Visual Studio Code Marketplace, follow these steps:

1. Pull the latest changes:
	```sh
	git pull
	```

2. Update your code and commit any changes.

3. Create a new tag (replace 1.2.3 with your new version):
	```sh
	git tag v1.2.3
	```

4. Push the tag to GitHub:
	```sh
	git push origin v1.2.3
	```

This will trigger the GitHub Actions workflow to automatically bump the version in package.json and publish your extension to the Marketplace.

**Note:** Make sure your VSCE_PAT secret is set in your repository settings for authentication.
