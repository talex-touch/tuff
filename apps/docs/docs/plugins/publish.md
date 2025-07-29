# Publishing Plugins (Plugins)

Once you've developed a plugin for the `Polyglot Toolbox`, you can publish it to the Plugin Market so that other users can discover and install it. This guide explains the process of preparing, packaging, and publishing your plugin.

## Preparing Your Plugin for Publication

Before publishing your plugin, ensure it meets the following requirements:

### 1. Complete Plugin Manifest

Your plugin must have a complete and valid `manifest.json` file:

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A brief description of what your plugin does",
  "author": {
    "name": "Your Name",
    "email": "your.email@example.com"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/yourusername/my-plugin.git"
  },
  "keywords": ["utility", "productivity", "example"],
  "engines": {
    "polyglot-toolbox": ">=1.2.0"
  },
  "main": "index.js",
  "permissions": [
    "file-system.read",
    "network.access"
  ],
  "screenshots": [
    {
      "src": "screenshots/main.png",
      "alt": "Main plugin interface"
    },
    {
      "src": "screenshots/settings.png",
      "alt": "Plugin settings"
    }
  ]
}
```

### 2. Plugin Icon

Provide a high-quality icon for your plugin. The icon should be:
- A square image (recommended size: 128x128 pixels)
- In PNG format
- Named `icon.png` and placed in the plugin's root directory

### 3. Documentation

Include comprehensive documentation for your plugin:
- A `README.md` file explaining what the plugin does and how to use it
- A `CHANGELOG.md` file documenting changes in each version
- Screenshots demonstrating the plugin's functionality

### 4. Testing

Thoroughly test your plugin:
- Test on different operating systems (Windows, macOS, Linux)
- Verify that all features work as expected
- Check for any errors or warnings in the console
- Ensure the plugin doesn't conflict with other plugins

## Packaging Your Plugin

Before publishing, you need to package your plugin into a distributable format.

### Plugin Structure

Ensure your plugin has the following structure:

```
my-plugin/
  manifest.json
  index.js
  icon.png
  README.md
  CHANGELOG.md
  LICENSE
  screenshots/
    main.png
    settings.png
  locales/
    en.json
    es.json
  assets/
    styles.css
    script.js
```

### Creating a Plugin Package

To create a plugin package:

1. Ensure all files are in the correct structure
2. Remove any development files or dependencies
3. Create a ZIP archive of the plugin directory

```bash
# Navigate to your plugin directory
cd my-plugin

# Create a ZIP archive
zip -r my-plugin-1.0.0.zip .
```

The resulting ZIP file is your plugin package that can be submitted to the Plugin Market.

## Publishing to the Plugin Market

### Creating a Developer Account

To publish plugins, you need a developer account on the Plugin Market:

1. Visit the [Plugin Market Developer Portal](https://plugins.polyglot-toolbox.com/developer)
2. Sign up for a developer account using your email
3. Verify your email address
4. Complete your developer profile

### Submitting Your Plugin

Once you have a developer account, you can submit your plugin:

1. Log in to the Developer Portal
2. Click "Submit New Plugin"
3. Fill in the plugin details:
   - Plugin name
   - Description
   - Category
   - Tags
4. Upload your plugin package (ZIP file)
5. Upload screenshots and other media
6. Review and submit your plugin for approval

### Plugin Review Process

All submitted plugins go through a review process to ensure quality and security:

1. **Automated Checks**: The system performs automated checks for:
   - Valid manifest file
   - Proper file structure
   - Malware scanning
   - Code quality analysis

2. **Manual Review**: A team member reviews the plugin for:
   - Functionality
   - User experience
   - Documentation quality
   - Compliance with guidelines

3. **Approval**: Once approved, your plugin will be published to the Plugin Market

The review process typically takes 1-3 business days.

## Updating Your Plugin

### Versioning

Follow semantic versioning for your plugin updates:
- **Major version** (1.0.0 → 2.0.0): Breaking changes
- **Minor version** (1.0.0 → 1.1.0): New features
- **Patch version** (1.0.0 → 1.0.1): Bug fixes

Update the version number in your `manifest.json` file for each release.

### Publishing Updates

To publish an update:

1. Make your changes and test thoroughly
2. Update the version number in `manifest.json`
3. Update your `CHANGELOG.md` with the changes
4. Create a new ZIP package
5. Log in to the Developer Portal
6. Navigate to your plugin's page
7. Click "Upload New Version"
8. Upload the new package
9. Submit for review

### Communicating Changes

Keep users informed about updates:
- Maintain a detailed `CHANGELOG.md`
- Use the Plugin Market's announcement feature for major updates
- Respond to user feedback and reviews

## Plugin Marketplace Guidelines

To ensure a positive experience for all users, plugins must adhere to the following guidelines:

### Technical Guidelines

1. **Security**:
   - Don't include malicious code
   - Handle user data responsibly
   - Use permissions appropriately

2. **Performance**:
   - Optimize for fast loading
   - Minimize resource usage
   - Don't block the main thread

3. **Compatibility**:
   - Support the declared engine versions
   - Work across supported platforms
   - Don't conflict with core application features

### Content Guidelines

1. **Quality**:
   - Provide clear documentation
   - Include proper error handling
   - Offer a good user experience

2. **Legal**:
   - Respect intellectual property rights
   - Comply with applicable laws
   - Include proper licensing information

3. **Ethics**:
   - Don't collect user data without consent
   - Be transparent about plugin functionality
   - Don't engage in deceptive practices

### User Experience Guidelines

1. **Usability**:
   - Provide intuitive interfaces
   - Include helpful error messages
   - Follow platform UI conventions

2. **Accessibility**:
   - Support keyboard navigation
   - Provide sufficient color contrast
   - Use semantic HTML where applicable

3. **Localization**:
   - Support multiple languages when possible
   - Use the i18n system correctly
   - Provide translations for UI text

## Best Practices for Plugin Publishing

### 1. Thorough Testing

Test your plugin extensively before publishing:

```javascript
// Example test structure
describe('My Plugin', () => {
  test('should initialize correctly', async () => {
    const plugin = new MyPlugin();
    await plugin.init();
    expect(plugin.initialized).toBe(true);
  });
  
  test('should handle errors gracefully', async () => {
    const plugin = new MyPlugin();
    await expect(plugin.loadInvalidData()).rejects.toThrow();
  });
});
```

### 2. Clear Documentation

Provide comprehensive documentation:

```markdown
# My Plugin

## Features

- Feature 1: Description of what this feature does
- Feature 2: Description of another feature

## Installation

1. Open the Plugin Market in Polyglot Toolbox
2. Search for "My Plugin"
3. Click "Install"

## Usage

### Basic Usage

1. Open the plugin panel
2. Configure settings in the plugin preferences
3. Use the plugin according to its specific functionality

### Advanced Usage

- Tip 1: How to use advanced feature
- Tip 2: How to customize behavior
```

### 3. Responsive Support

Provide support for your users:

```javascript
// Include a support function in your plugin
class MyPlugin {
  openSupport() {
    // Open a support page or contact form
    window.open('https://github.com/yourusername/my-plugin/issues', '_blank');
  }
}
```

### 4. Regular Updates

Keep your plugin up to date:

```json
// CHANGELOG.md
# Changelog

## 1.2.0 (2023-10-15)
### Added
- New feature: Dark mode support
- Localization for Spanish and French

### Fixed
- Bug fix: Resolved issue with file loading
- Performance improvement: Reduced memory usage

## 1.1.0 (2023-09-20)
### Added
- New configuration option for custom themes
- Support for large files

### Changed
- Improved UI for better usability
```

## Example: Publishing a Simple Plugin

Here's a complete example of the process for publishing a simple plugin:

### Plugin Structure

```
hello-world-plugin/
  manifest.json
  index.js
  icon.png
  README.md
  CHANGELOG.md
  LICENSE
  screenshots/
    main.png
```

### Manifest File

```json
{
  "id": "com.example.hello-world",
  "name": "Hello World Plugin",
  "version": "1.0.0",
  "description": "A simple plugin that displays a greeting message",
  "author": {
    "name": "Example Developer",
    "email": "dev@example.com"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/example/hello-world-plugin.git"
  },
  "keywords": ["example", "greeting", "simple"],
  "engines": {
    "polyglot-toolbox": ">=1.2.0"
  },
  "main": "index.js",
  "permissions": []
}
```

### Main Plugin File

```javascript
// index.js
import { toast } from '@polyglot-toolbox/plugin-sdk';

class HelloWorldPlugin {
  constructor() {
    this.init();
  }
  
  init() {
    // Show a greeting message when the plugin is loaded
    toast.info('Hello, World! Thanks for installing this plugin.');
    
    console.log('Hello World Plugin initialized');
  }
}

// Initialize the plugin
new HelloWorldPlugin();
```

### README File

```markdown
# Hello World Plugin

A simple example plugin for the Polyglot Toolbox that displays a greeting message when installed.

## Features

- Displays a friendly "Hello, World!" message on startup
- Demonstrates basic plugin structure and initialization

## Installation

1. Open the Plugin Market in Polyglot Toolbox
2. Search for "Hello World Plugin"
3. Click "Install"
4. Restart the application if prompted

## Usage

The plugin automatically shows a greeting message when the application starts. No additional configuration is required.

## Support

For support, please open an issue on the [GitHub repository](https://github.com/example/hello-world-plugin/issues).
```

### CHANGELOG File

```markdown
# Changelog

## 1.0.0 (2023-10-15)
### Added
- Initial release
- Basic greeting message functionality
```

### Packaging and Submission

1. Create a ZIP archive of the plugin directory:
   ```bash
   zip -r hello-world-plugin-1.0.0.zip hello-world-plugin/
   ```

2. Submit to the Plugin Market:
   - Log in to the Developer Portal
   - Click "Submit New Plugin"
   - Fill in the details
   - Upload the ZIP file
   - Upload a screenshot
   - Submit for review

After following these steps and passing the review process, your plugin will be available in the Plugin Market for users to install and enjoy.

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).