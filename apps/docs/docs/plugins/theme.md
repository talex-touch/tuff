# Plugin Themes (Plugins)

The `Tuff` supports a flexible theming system that allows plugins to define custom themes or modify existing ones. This guide explains how to work with themes in your plugins.

## Understanding Themes

Themes in the `Tuff` are collections of styles that define the visual appearance of the application. They include color schemes, typography, spacing, and component styles.

## Theme Structure

A theme consists of several parts:

### Colors

Color definitions include primary, secondary, and semantic colors:

::: code-group

```json [Theme Colors]
{
  "colors": {
    "primary": "#3498db",
    "secondary": "#2ecc71",
    "background": "#ffffff",
    "surface": "#f8f9fa",
    "text": "#2c3e50",
    "textSecondary": "#7f8c8d",
    "error": "#e74c3c",
    "warning": "#f39c12",
    "success": "#27ae60"
  }
}
```

:::

### Typography

Typography settings define font families, sizes, and weights:

::: code-group

```json [Theme Typography]
{
  "typography": {
    "fontFamily": "'Roboto', 'Helvetica Neue', Arial, sans-serif",
    "fontSize": 16,
    "fontWeight": 400,
    "h1": {
      "fontSize": 32,
      "fontWeight": 700
    },
    "h2": {
      "fontSize": 24,
      "fontWeight": 700
    },
    "body": {
      "fontSize": 16,
      "fontWeight": 400
    }
  }
}
```

:::

### Spacing

Spacing definitions provide consistent margins and padding:

::: code-group

```json [Theme Spacing]
{
  "spacing": {
    "xs": 4,
    "sm": 8,
    "md": 16,
    "lg": 24,
    "xl": 32
  }
}
```

:::

### Components

Component-specific styles:

::: code-group

```json [Theme Components]
{
  "components": {
    "button": {
      "borderRadius": 4,
      "padding": "8px 16px",
      "fontWeight": 500
    },
    "input": {
      "borderRadius": 4,
      "borderWidth": 1,
      "padding": "8px 12px"
    }
  }
}
```

:::

## Creating a Custom Theme

Plugins can define their own themes by creating a theme definition file.

### Theme Definition File

Create a `theme.json` file in your plugin directory:

::: code-group

```json [Theme Definition File]
{
  "name": "Ocean Breeze",
  "description": "A calming blue-themed color scheme",
  "author": "Your Name",
  "version": "1.0.0",
  "colors": {
    "primary": "#007acc",
    "secondary": "#00c853",
    "background": "#f0f8ff",
    "surface": "#ffffff",
    "text": "#001f3f",
    "textSecondary": "#555555",
    "error": "#ff4136",
    "warning": "#ff851b",
    "success": "#2ecc40"
  },
  "typography": {
    "fontFamily": "'Open Sans', sans-serif",
    "fontSize": 16,
    "h1": {
      "fontSize": 36,
      "fontWeight": 700
    },
    "h2": {
      "fontSize": 28,
      "fontWeight": 600
    }
  },
  "spacing": {
    "xs": 4,
    "sm": 8,
    "md": 16,
    "lg": 24,
    "xl": 32
  }
}
```

:::

### Registering a Theme

To register your theme with the application, use the `themes` API:

::: code-group

```javascript [Registering a Theme]
// In your plugin's main file
import { themes } from '@polyglot-toolbox/plugin-sdk';

// Import your theme definition
import themeDefinition from './theme.json';

// Register the theme
themes.register('ocean-breeze', themeDefinition);

console.log('Ocean Breeze theme registered');
```

:::

## Modifying Existing Themes

Plugins can also modify existing themes to customize specific aspects.

### Extending a Theme

You can extend an existing theme by providing only the properties you want to change:

::: code-group

```javascript [Extending a Theme]
import { themes } from '@polyglot-toolbox/plugin-sdk';

// Extend the default theme
const extendedTheme = {
  colors: {
    primary: '#ff6b6b', // Change primary color
    secondary: '#4ecdc4' // Change secondary color
  },
  components: {
    button: {
      borderRadius: 20 // Make buttons more rounded
    }
  }
};

// Apply the extended theme
themes.extend('default', extendedTheme);
```

:::

### Theme Variants

Create variants of existing themes:

::: code-group

```javascript [Theme Variants]
import { themes } from '@polyglot-toolbox/plugin-sdk';

// Create a dark variant of the default theme
const darkVariant = {
  name: "Default Dark",
  colors: {
    background: "#1a1a1a",
    surface: "#2d2d2d",
    text: "#ffffff",
    textSecondary: "#cccccc"
  }
};

// Register the dark variant
themes.register('default-dark', darkVariant);
```

:::

## Using Themes in Plugins

Access the current theme in your plugin to style components dynamically.

### Getting Theme Values

::: code-group

```javascript [Using Themes in Plugins]
import { themes } from '@polyglot-toolbox/plugin-sdk';

// Get the current theme
const currentTheme = themes.getCurrent();

// Access specific theme values
const primaryColor = currentTheme.colors.primary;
const fontFamily = currentTheme.typography.fontFamily;

console.log('Primary color:', primaryColor);
console.log('Font family:', fontFamily);
```

:::

### Listening to Theme Changes

React to theme changes to update your plugin's UI:

::: code-group

```javascript [Listening to Theme Changes]
import { themes } from '@polyglot-toolbox/plugin-sdk';

// Listen for theme changes
const unsubscribe = themes.onChange((newTheme) => {
  console.log('Theme changed to:', newTheme.name);
  // Update your plugin's UI with the new theme
  this.updateThemedComponents(newTheme);
});

// Don't forget to unsubscribe when your plugin is unloaded
// unsubscribe();
```

:::

## CSS Custom Properties

Themes are also exposed as CSS custom properties (CSS variables) that you can use in your plugin's styles:

::: code-group

```css [CSS Custom Properties]
/* In your plugin's CSS file */
.my-plugin-button {
  background-color: var(--theme-primary);
  color: var(--theme-on-primary);
  border-radius: var(--theme-button-border-radius, 4px);
  font-family: var(--theme-font-family);
}

.my-plugin-card {
  background-color: var(--theme-surface);
  padding: var(--theme-spacing-md);
  border-radius: var(--theme-border-radius);
}
```

:::

## Theme Best Practices

When working with themes in your plugin, consider the following best practices:

### 1. Use Theme Variables

Always use theme variables instead of hardcoded values:

::: code-group

```css [Use Theme Variables]
/* Good */
.button {
  background-color: var(--theme-primary);
  color: var(--theme-on-primary);
}

/* Avoid */
.button {
  background-color: #3498db; /* Hardcoded color */
  color: white; /* Hardcoded color */
}
```

:::

### 2. Provide Fallbacks

Provide fallback values for theme variables that might not be defined:

::: code-group

```css [Provide Fallbacks]
.card {
  border-radius: var(--theme-border-radius, 4px); /* Fallback to 4px */
  box-shadow: var(--theme-shadow, 0 2px 4px rgba(0,0,0,0.1));
}
```

:::

### 3. Respect User Preferences

Consider user preferences like reduced motion or high contrast:

::: code-group

```css [Respect User Preferences]
@media (prefers-reduced-motion: reduce) {
  .animated-element {
    animation: none;
  }
}

@media (prefers-contrast: high) {
  .button {
    border: 2px solid var(--theme-on-background);
  }
}
```

:::

### 4. Test with Different Themes

Test your plugin with different themes to ensure it looks good and remains functional:

::: code-group

```javascript [Test with Different Themes]
// In development, you might want to quickly switch themes
import { themes } from '@polyglot-toolbox/plugin-sdk';

// Function to cycle through themes for testing
function cycleThemes() {
  const availableThemes = themes.list();
  const currentIndex = availableThemes.indexOf(themes.getCurrent().name);
  const nextIndex = (currentIndex + 1) % availableThemes.length;
  themes.set(availableThemes[nextIndex]);
}
```

:::

## Example: Themed Plugin UI

Here's a complete example of a plugin that uses themes effectively:

::: code-group

```javascript [Themed Plugin UI Example]
// plugin.js
import { themes } from '@polyglot-toolbox/plugin-sdk';

class ThemedPlugin {
  constructor() {
    this.init();
  }
  
  init() {
    // Create plugin UI
    this.createUI();
    
    // Apply current theme
    this.applyTheme(themes.getCurrent());
    
    // Listen for theme changes
    this.unsubscribe = themes.onChange((newTheme) => {
      this.applyTheme(newTheme);
    });
  }
  
  createUI() {
    // Create a simple UI with themed elements
    const container = document.createElement('div');
    container.className = 'themed-plugin-container';
    
    const title = document.createElement('h2');
    title.textContent = 'Themed Plugin';
    title.className = 'themed-plugin-title';
    
    const button = document.createElement('button');
    button.textContent = 'Click Me';
    button.className = 'themed-plugin-button';
    
    const card = document.createElement('div');
    card.className = 'themed-plugin-card';
    card.innerHTML = '<p>This is a themed card component.</p>';
    
    container.appendChild(title);
    container.appendChild(button);
    container.appendChild(card);
    
    document.body.appendChild(container);
  }
  
  applyTheme(theme) {
    console.log('Applying theme:', theme.name);
    
    // Update CSS variables for maximum compatibility
    const root = document.documentElement;
    root.style.setProperty('--plugin-primary', theme.colors.primary);
    root.style.setProperty('--plugin-secondary', theme.colors.secondary);
    root.style.setProperty('--plugin-background', theme.colors.background);
    root.style.setProperty('--plugin-text', theme.colors.text);
    
    // You can also directly manipulate elements if needed
    const buttons = document.querySelectorAll('.themed-plugin-button');
    buttons.forEach(btn => {
      btn.style.backgroundColor = theme.colors.primary;
      btn.style.color = theme.colors.background;
      btn.style.borderRadius = theme.components?.button?.borderRadius ?
        `${theme.components.button.borderRadius}px` : '4px';
    });
  }
  
  destroy() {
    // Clean up when plugin is unloaded
    if (this.unsubscribe) {
      this.unsubscribe();
    }
    
    // Remove plugin UI
    const container = document.querySelector('.themed-plugin-container');
    if (container) {
      container.remove();
    }
  }
}

// Initialize the plugin
const plugin = new ThemedPlugin();

// Export destroy function for proper cleanup
export default () => plugin.destroy();
```

:::

Corresponding CSS file:

::: code-group

```css [Themed Plugin CSS Example]
/* plugin.css */
.themed-plugin-container {
  padding: var(--theme-spacing-lg);
  font-family: var(--theme-font-family);
}

.themed-plugin-title {
  color: var(--plugin-text);
  font-size: var(--theme-typography-h2-fontSize);
  font-weight: var(--theme-typography-h2-fontWeight);
  margin-bottom: var(--theme-spacing-md);
}

.themed-plugin-button {
  background-color: var(--plugin-primary);
  color: var(--plugin-background);
  border: none;
  padding: var(--theme-spacing-sm) var(--theme-spacing-md);
  border-radius: var(--theme-button-border-radius, 4px);
  font-family: var(--theme-font-family);
  font-size: var(--theme-typography-body-fontSize);
  cursor: pointer;
  transition: background-color 0.3s ease;
}

.themed-plugin-button:hover {
  opacity: 0.9;
}

.themed-plugin-card {
  background-color: var(--theme-surface);
  color: var(--theme-text);
  padding: var(--theme-spacing-md);
  border-radius: var(--theme-border-radius, 4px);
  box-shadow: var(--theme-shadow, 0 2px 4px rgba(0,0,0,0.1));
  margin-top: var(--theme-spacing-md);
}
```

:::

This plugin demonstrates proper use of the theming system by:
1. Creating a theme-aware UI
2. Listening for theme changes and updating accordingly
3. Using CSS custom properties for styling
4. Providing fallback values for theme properties
5. Cleaning up event listeners when the plugin is unloaded

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).