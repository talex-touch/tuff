# Customization

The `Polyglot Toolbox` is designed to be highly customizable to meet your specific needs. This guide will walk you through the various ways you can personalize your experience.

## Themes

You can change the appearance of the application by selecting from a variety of built-in themes or creating your own.

### Built-in Themes

1. Light Theme
2. Dark Theme
3. Blue Theme
4. Green Theme

To switch themes:
1. Open the Settings menu.
2. Navigate to the "Appearance" section.
3. Select your preferred theme from the dropdown list.

### Custom Themes

You can also create custom themes by modifying the theme files. Theme files are located in the `themes` directory of your application data folder.

Example theme file structure:
```
themes/
  custom-theme/
    colors.json
    styles.css
```

`colors.json`:
```json
{
  "primary": "#3498db",
  "secondary": "#2ecc71",
  "background": "#ecf0f1",
  "text": "#2c3e50"
}
```

`styles.css`:
```css
body {
  background-color: var(--background);
  color: var(--text);
}

.button {
  background-color: var(--primary);
  border-color: var(--secondary);
}
```

## Layout

You can customize the layout of the main window by rearranging panels and widgets.

### Panel Management

1. Drag and drop panels to reposition them.
2. Right-click on a panel title bar to access options like "Close Panel" or "Float Panel".
3. Use the "View" menu to show or hide specific panels.

### Widget Configuration

Widgets can be added, removed, or configured according to your preferences.

1. Go to the "Widgets" section in Settings.
2. Choose which widgets to display on your dashboard.
3. Configure each widget's settings by clicking on its configuration icon.

Example widget configuration:
```json
{
  "widgetId": "recent-files",
  "position": {
    "x": 10,
    "y": 10,
    "width": 300,
    "height": 200
  },
  "settings": {
    "maxFiles": 10,
    "showPath": true
  }
}
```

## Keyboard Shortcuts

Customize keyboard shortcuts to improve your workflow.

1. Open the "Keyboard Shortcuts" settings.
2. Search for the action you want to modify.
3. Click on the shortcut and press your desired key combination.

Example shortcut configuration:
```json
{
  "action": "open-file",
  "shortcut": "Ctrl+O"
}
```

## Plugins

Install and configure plugins to extend the functionality of the application.

1. Visit the Plugin Market to browse available plugins.
2. Install a plugin by clicking the "Install" button.
3. Configure the plugin settings in the "Plugins" section of Settings.

For more information on plugins, see the [Plugins documentation](/docs/plugins/introduction).