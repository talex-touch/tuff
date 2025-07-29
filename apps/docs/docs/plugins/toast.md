# Toast Notifications (Plugins)

Toast notifications are lightweight, non-intrusive messages that appear briefly on the screen to inform users about an event or action. The `Polyglot Toolbox` provides a simple API for plugins to display toast notifications.

## Basic Usage

To display a toast notification, use the `toast` object provided by the plugin SDK:

::: code-group

```javascript [Basic Toast Usage]
// In your plugin's main file or preload script
import { toast } from '@polyglot-toolbox/plugin-sdk';

// Show a simple info message
toast.info('Operation completed successfully');

// Show a success message
toast.success('File saved successfully');

// Show a warning message
toast.warning('This action cannot be undone');

// Show an error message
toast.error('Failed to connect to server');
```

:::

## Toast Types

The plugin SDK provides several types of toast notifications, each with its own visual style and purpose:

### Info Toast

Info toasts are used for general information messages.

::: code-group

```javascript [Info Toast]
toast.info('This is an informational message');
```

:::

### Success Toast

Success toasts indicate that an operation has completed successfully.

::: code-group

```javascript [Success Toast]
toast.success('Operation completed successfully');
```

:::

### Warning Toast

Warning toasts alert users to potential issues or important information.

::: code-group

```javascript [Warning Toast]
toast.warning('Please check your input');
```

:::

### Error Toast

Error toasts indicate that something has gone wrong.

::: code-group

```javascript [Error Toast]
toast.error('An error occurred while processing your request');
```

:::

## Customizing Toasts

You can customize various aspects of toast notifications, including duration, position, and actions.

### Duration

By default, toasts disappear after a few seconds. You can specify a custom duration in milliseconds:

::: code-group

```javascript [Custom Duration]
// Show a toast for 5 seconds (5000 milliseconds)
toast.info('This message will stay longer', { duration: 5000 });

// Show a toast that doesn't auto-dismiss
toast.info('This message stays until dismissed', { duration: 0 });
```

:::

### Position

Toasts can appear in different positions on the screen:

::: code-group

```javascript [Positioning Toasts]
// Top center (default)
toast.info('Top center message');

// Top left
toast.info('Top left message', { position: 'top-left' });

// Top right
toast.info('Top right message', { position: 'top-right' });

// Bottom center
toast.info('Bottom center message', { position: 'bottom-center' });

// Bottom left
toast.info('Bottom left message', { position: 'bottom-left' });

// Bottom right
toast.info('Bottom right message', { position: 'bottom-right' });
```

:::

Available positions:
- `top-center` (default)
- `top-left`
- `top-right`
- `bottom-center`
- `bottom-left`
- `bottom-right`

### Actions

You can add action buttons to toasts to allow users to perform additional actions:

::: code-group

```javascript [Toast with Actions]
toast.info('File download complete', {
  actions: [
    {
      text: 'Open File',
      onClick: () => {
        // Open the downloaded file
        openFile('/path/to/downloaded/file.txt');
      }
    },
    {
      text: 'Show in Folder',
      onClick: () => {
        // Show the file in the file explorer
        showInFolder('/path/to/downloaded/file.txt');
      }
    }
  ]
});
```

:::

## Advanced Toast Configuration

The toast API supports several advanced configuration options:

### Progress Indicators

For long-running operations, you can show a progress indicator:

::: code-group

```javascript [Progress Indicators]
const toastId = toast.info('Processing file...', {
  duration: 0, // Don't auto-dismiss
  showProgress: true
});

// Update the progress
toast.update(toastId, {
  message: 'Processing file... 50%',
  progress: 50
});

// Complete the operation
toast.update(toastId, {
  message: 'File processed successfully',
  type: 'success',
  duration: 3000, // Auto-dismiss after 3 seconds
  showProgress: false
});
```

:::

### Custom Styling

You can apply custom styling to toasts:

::: code-group

```javascript [Custom Styling]
toast.info('Custom styled message', {
  style: {
    backgroundColor: '#3498db',
    color: '#ffffff',
    borderRadius: '8px',
    fontSize: '16px'
  }
});
```

:::

### Icons

Add custom icons to toasts:

::: code-group

```javascript [Custom Icons]
toast.info('Message with custom icon', {
  icon: '<svg>...</svg>' // SVG icon string
});

// Or use a predefined icon
toast.info('Message with info icon', {
  icon: 'info'
});
```

:::

## Toast Best Practices

When using toast notifications in your plugin, consider the following best practices:

### 1. Use Appropriate Toast Types

Choose the right type of toast for your message to convey the correct level of importance:

::: code-group

```javascript [Appropriate Toast Types]
// Good - Using appropriate toast types
if (operationSuccessful) {
  toast.success('Operation completed successfully');
} else {
  toast.error('Operation failed. Please try again.');
}

// Avoid - Using info for errors
if (operationFailed) {
  toast.info('Operation failed. Please try again.'); // Misleading
}
```

:::

### 2. Keep Messages Concise

Toast messages should be brief and to the point:

::: code-group

```javascript [Concise Messages]
// Good - Concise message
toast.info('Settings saved');

// Avoid - Too verbose
toast.info('Your settings have been successfully saved to the configuration file');
```

:::

### 3. Provide Actionable Information

When possible, include actions that allow users to respond to the notification:

::: code-group

```javascript [Actionable Information]
// Good - Providing actionable information
toast.error('Failed to save file', {
  actions: [
    {
      text: 'Retry',
      onClick: () => saveFile()
    },
    {
      text: 'Save As...',
      onClick: () => saveFileAs()
    }
  ]
});
```

:::

### 4. Don't Overuse Toasts

Avoid showing too many toasts in a short period, as this can overwhelm users:

::: code-group

```javascript [Avoid Overuse]
// Avoid - Showing multiple toasts rapidly
files.forEach(file => {
  processFile(file);
  toast.info(`Processing ${file.name}`); // This could create many toasts
});

// Better - Show a single toast with progress
const toastId = toast.info('Processing files...', { duration: 0 });
let processed = 0;

files.forEach(file => {
  processFile(file);
  processed++;
  toast.update(toastId, {
    message: `Processing files... ${processed}/${files.length}`
  });
});

toast.update(toastId, {
  message: 'All files processed successfully',
  type: 'success',
  duration: 3000
});
```

:::

## Example: File Processing Plugin with Toasts

Here's a complete example of a plugin that uses toast notifications to inform users about file processing:

::: code-group

```javascript [File Processing Plugin Example]
// plugin.js
import { toast } from '@polyglot-toolbox/plugin-sdk';

class FileProcessingPlugin {
  constructor() {
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    document.getElementById('process-files-btn').addEventListener('click', () => {
      this.processFiles();
    });
  }
  
  async processFiles() {
    const files = this.getSelectedFiles();
    
    if (files.length === 0) {
      toast.warning('Please select files to process');
      return;
    }
    
    // Show initial toast with progress
    const toastId = toast.info(`Processing ${files.length} files...`, {
      duration: 0,
      showProgress: true
    });
    
    let processed = 0;
    let errors = 0;
    
    try {
      for (const file of files) {
        try {
          await this.processFile(file);
          processed++;
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          errors++;
        }
        
        // Update progress
        const progress = Math.round((processed + errors) / files.length * 100);
        toast.update(toastId, {
          message: `Processing files... ${processed + errors}/${files.length}`,
          progress: progress
        });
      }
      
      // Show completion message
      if (errors === 0) {
        toast.update(toastId, {
          message: `Successfully processed ${processed} files`,
          type: 'success',
          duration: 3000,
          showProgress: false
        });
      } else {
        toast.update(toastId, {
          message: `Processed ${processed} files with ${errors} errors`,
          type: 'warning',
          duration: 5000,
          showProgress: false
        });
      }
    } catch (error) {
      console.error('Error processing files:', error);
      toast.update(toastId, {
        message: 'An error occurred while processing files',
        type: 'error',
        duration: 5000,
        showProgress: false
      });
    }
  }
  
  getSelectedFiles() {
    // Implementation to get selected files
    return [
      { name: 'file1.txt' },
      { name: 'file2.txt' },
      { name: 'file3.txt' }
    ];
  }
  
  processFile(file) {
    // Implementation to process a file
    return new Promise((resolve, reject) => {
      // Simulate file processing
      setTimeout(() => {
        if (Math.random() > 0.1) { // 90% success rate
          resolve();
        } else {
          reject(new Error('Processing failed'));
        }
      }, 500);
    });
  }
}

// Initialize the plugin
new FileProcessingPlugin();
```

:::

This plugin demonstrates proper use of toast notifications by:
1. Showing appropriate toast types for different situations
2. Using progress indicators for long-running operations
3. Updating toasts with progress information
4. Providing clear completion messages
5. Handling errors gracefully with error toasts

For more information about the plugin SDK and available APIs, see the [Plugin SDK documentation](/docs/plugins/introduction).