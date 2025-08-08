# Plugin Events (Plugins)

The `Tuff` uses an event-driven architecture to facilitate communication between the core application and plugins. This guide explains how plugins can emit and listen to events.

## Event Bus

The application provides an event bus system that allows plugins to communicate with each other and with the core application. The event bus is accessible through the plugin SDK.

## Listening to Events

Plugins can listen to events emitted by the core application or other plugins.

### Basic Event Listening

To listen to an event, use the `on` method provided by the event bus:

::: code-group

```javascript [Basic Event Listening]
// In your plugin's main file or preload script
import { eventBus } from '@polyglot-toolbox/plugin-sdk';

eventBus.on('document-opened', (data) => {
  console.log('A document was opened:', data);
  // Perform actions when a document is opened
});
```

:::

### Event Data

Events can carry data that provides context about the event. The structure of this data depends on the specific event.

Example event data:
::: code-group

```json [Event Data Example]
{
  "documentId": "doc-12345",
  "filePath": "/path/to/document.txt",
  "timestamp": "2023-10-15T14:30:00Z"
}
```

:::

## Emitting Events

Plugins can also emit their own events to communicate with other parts of the application.

### Basic Event Emission

To emit an event, use the `emit` method:

::: code-group

```javascript [Basic Event Emission]
// In your plugin's main file or preload script
import { eventBus } from '@polyglot-toolbox/plugin-sdk';

// Emit an event when a custom action is performed
eventBus.emit('my-plugin-action', {
  action: 'button-clicked',
  timestamp: new Date().toISOString()
});
```

:::

## Common Application Events

The core application emits several built-in events that plugins can listen to:

### Document Events

- `document-opened`: Emitted when a document is opened.
- `document-closed`: Emitted when a document is closed.
- `document-saved`: Emitted when a document is saved.
- `document-modified`: Emitted when a document is modified.

### Window Events

- `window-focused`: Emitted when the application window gains focus.
- `window-blurred`: Emitted when the application window loses focus.
- `window-resized`: Emitted when the window is resized.

### User Events

- `user-logged-in`: Emitted when a user logs in.
- `user-logged-out`: Emitted when a user logs out.

### System Events

- `app-started`: Emitted when the application starts.
- `app-closing`: Emitted when the application is about to close.
- `settings-changed`: Emitted when application settings are modified.

## Event Best Practices

When working with events in your plugin, consider the following best practices:

### 1. Use Descriptive Event Names

Choose clear and descriptive names for your events to make them easy to understand and use.

::: code-group

```javascript [Good Example]
// Good
eventBus.emit('translation-completed', result);
```

```javascript [Avoid Example]
// Avoid
eventBus.emit('done', result);
```

:::

### 2. Provide Useful Event Data

Include relevant data with your events to make them more useful to listeners.

::: code-group

```javascript [Good Example]
// Good
eventBus.emit('file-processed', {
  fileId: 'file-123',
  fileName: 'document.txt',
  processingTime: 1500, // in milliseconds
  success: true
});
```

```javascript [Avoid Example]
// Avoid
eventBus.emit('file-processed', 'file-123');
```

:::

### 3. Handle Event Listener Cleanup

If your plugin creates event listeners, make sure to remove them when they're no longer needed to prevent memory leaks.

::: code-group

```javascript [Handle Event Listener Cleanup]
// Store the listener function
const listener = (data) => {
  // Handle the event
};

// Add the listener
eventBus.on('document-opened', listener);

// Remove the listener when cleaning up
eventBus.off('document-opened', listener);
```

:::

### 4. Avoid Circular Event Dependencies

Be careful not to create circular dependencies where events trigger each other in a loop.

::: code-group

```javascript [Avoid Circular Event Dependencies]
// This could create an infinite loop
eventBus.on('setting-changed', () => {
  // Some logic that changes a setting
  changeSetting(); // This might emit 'setting-changed' again
});
```

:::

## Custom Events in Plugins

When creating custom events for your plugin, follow these conventions:

1. Prefix your event names with your plugin's identifier to avoid conflicts:
   ::: code-group

   ```javascript [Custom Event Example]
   eventBus.emit('my-plugin-name:data-processed', data);
   ```

   :::

2. Document the events your plugin emits so other developers can use them:
   ::: code-group

   ```javascript [JSDoc Example]
   /**
    * Emitted when the plugin finishes processing data
    * @event my-plugin-name:data-processed
    * @type {object}
    * @property {string} id - The ID of the processed item
    * @property {object} result - The processing result
    */
   ```

   :::

## Example: Creating a Simple Event-Based Plugin

Here's a complete example of a plugin that uses events:

::: code-group

```javascript [Simple Event-Based Plugin]
// plugin.js
import { eventBus } from '@polyglot-toolbox/plugin-sdk';

class SimpleEventPlugin {
  constructor() {
    // Listen to document events
    eventBus.on('document-opened', this.handleDocumentOpened.bind(this));
    
    // Emit a custom event when the plugin is initialized
    eventBus.emit('simple-event-plugin:initialized', {
      timestamp: new Date().toISOString()
    });
  }
  
  handleDocumentOpened(data) {
    console.log('Document opened:', data.filePath);
    
    // Perform some action and emit a result
    const result = this.processDocument(data);
    
    eventBus.emit('simple-event-plugin:document-processed', {
      documentId: data.documentId,
      result: result,
      timestamp: new Date().toISOString()
    });
  }
  
  processDocument(data) {
    // Simulate document processing
    return {
      wordCount: Math.floor(Math.random() * 1000),
      processed: true
    };
  }
}

// Initialize the plugin
new SimpleEventPlugin();
```

:::

This plugin listens for document open events, processes the document, and emits its own events to communicate the results.

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).