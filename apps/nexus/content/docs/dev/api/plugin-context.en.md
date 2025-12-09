# Plugin index.js Context API

The plugin's `index.js` runs in a Node.js sandbox environment as a backend script. The system injects a set of global objects for plugin use.

## Global Context Objects

Plugin index.js can access the following APIs via `globalThis`:

```javascript
const {
  // Core APIs
  logger,           // Logger
  http,             // HTTP requests (axios)
  clipboard,        // Clipboard operations
  storage,          // Plugin-specific storage
  
  // Feature APIs
  feature,          // Feature SDK (push search results)
  search,           // Search manager (deprecated, use feature)
  box,              // CoreBox control
  boxItems,         // BoxItem management
  
  // Plugin Management
  plugin,           // Current plugin info
  plugins,          // Other plugins API
  features,         // Dynamic Feature management
  
  // Communication
  channel,          // IPC channel bridge
  $event,           // Feature event listeners
  
  // UI
  dialog,           // System dialogs
  divisionBox,      // DivisionBox SDK
  
  // Utilities
  TuffItemBuilder,  // Search result builder
  URLSearchParams,  // URL parameter handling
  openUrl,          // Open external links
} = globalThis
```

---

## logger

Plugin logger - logs are saved to the plugin's log directory.

```javascript
logger.info('Info message', { extra: 'data' })
logger.warn('Warning message')
logger.error('Error message', error)
logger.debug('Debug message')
```

---

## http

HTTP request library (axios-based):

```javascript
// GET request
const response = await http.get('https://api.example.com/data', {
  headers: { 'Authorization': 'Bearer token' },
  signal // AbortSignal for cancellation
})

// POST request
const result = await http.post('https://api.example.com/submit', {
  data: 'payload'
}, { signal })
```

---

## clipboard

Clipboard operations:

```javascript
// Write text
clipboard.writeText('Copied content')

// Read text
const text = clipboard.readText()

// Read image
const image = clipboard.readImage()

// Write image
clipboard.writeImage(nativeImage)
```

---

## storage

Plugin-specific storage (10MB limit per plugin):

```javascript
// Read config file
const config = storage.getFile('providers_config')

// Save config file
storage.setFile('providers_config', { key: 'value' })

// Delete config file
storage.deleteFile('old_config')

// List all files
const files = storage.listFiles()  // ['file1', 'file2']

// Watch for config changes
const unsubscribe = storage.onDidChange('providers_config', (newConfig) => {
  console.log('Config updated:', newConfig)
})

// Unsubscribe
unsubscribe()
```

---

## feature

Feature SDK for managing search results:

```javascript
// Push search results
feature.pushItems([
  new TuffItemBuilder('item-1')
    .setTitle('Search Result Title')
    .setSubtitle('Subtitle')
    .setIcon({ type: 'file', value: 'assets/icon.svg' })
    .build()
])

// Clear current plugin's search results
feature.clearItems()

// Get current plugin's search results
const items = feature.getItems()
```

---

## box

CoreBox control SDK:

```javascript
// Hide CoreBox
box.hide()

// Show CoreBox
box.show()

// Set input content
box.setInput('New input content')

// Get input content
const input = box.getInput()
```

---

## boxItems

BoxItem management SDK (new API):

```javascript
// Push single item
boxItems.push(item)

// Push multiple items
boxItems.pushItems([item1, item2])

// Update specific item
boxItems.update('item-id', { title: 'New Title' })

// Remove specific item
boxItems.remove('item-id')

// Clear all items for this plugin
boxItems.clear()

// Get all items for this plugin
const items = boxItems.getItems()
```

---

## plugin

Current plugin info API:

```javascript
// Get complete plugin info
const info = plugin.getInfo()
// { name, version, desc, readme, dev, status, features, issues, ... }

// Get plugin path
const path = plugin.getPath()

// Get data directory
const dataPath = plugin.getDataPath()

// Get config directory
const configPath = plugin.getConfigPath()

// Get logs directory
const logsPath = plugin.getLogsPath()

// Get temp directory
const tempPath = plugin.getTempPath()

// Get current status
const status = plugin.getStatus()

// Get dev configuration
const devInfo = plugin.getDevInfo()

// Get platform support info
const platforms = plugin.getPlatforms()
```

---

## plugins

Other plugins API (read-only access):

```javascript
// Get all plugins list
const allPlugins = await plugins.list()

// Get specific plugin info
const otherPlugin = await plugins.get('other-plugin-name')

// Get plugin status
const status = await plugins.getStatus('other-plugin-name')
```

---

## features

Dynamic Feature management:

```javascript
// Add Feature dynamically
features.addFeature({
  id: 'dynamic-feature',
  name: 'Dynamic Feature',
  desc: 'Runtime-added feature',
  icon: { type: 'file', value: 'assets/icon.svg' },
  push: true,
  commands: [{ type: 'over', value: ['dynamic'] }],
  priority: 5
})

// Remove Feature
features.removeFeature('dynamic-feature')

// Get all Features
const allFeatures = features.getFeatures()

// Get specific Feature
const feature = features.getFeature('feature-id')

// Set priority
features.setPriority('feature-id', 10)

// Get priority
const priority = features.getPriority('feature-id')

// Get sorted by priority
const sorted = features.getFeaturesByPriority()
```

---

## channel

IPC channel bridge:

```javascript
// Send message to main process
const result = await channel.sendToMain('event-name', { data: 'payload' })

// Send message to renderer process
await channel.sendToRenderer('event-name', { data: 'payload' })

// Listen to main process messages
const dispose = channel.onMain('event-name', (data) => {
  console.log('Received from main:', data)
})

// Listen to renderer process messages
const dispose = channel.onRenderer('event-name', (data) => {
  console.log('Received from renderer:', data)
})

// Access raw channel object
channel.raw
```

---

## $event

Feature event listeners:

```javascript
// Listen to Feature lifecycle
$event.onFeatureLifeCycle('feature-id', {
  onLaunch: (feature) => { console.log('Launched', feature) },
  onFeatureTriggered: (data, feature) => { console.log('Triggered', data) },
  onInputChanged: (input) => { console.log('Input changed', input) },
  onClose: (feature) => { console.log('Closed', feature) }
})

// Remove listener
$event.offFeatureLifeCycle('feature-id', callback)
```

---

## dialog

System dialogs:

```javascript
// Message dialog
await dialog.showMessageBox({
  type: 'info',
  title: 'Title',
  message: 'Message content',
  buttons: ['OK', 'Cancel']
})

// Open file dialog
const result = await dialog.showOpenDialog({
  properties: ['openFile', 'multiSelections'],
  filters: [{ name: 'Images', extensions: ['jpg', 'png'] }]
})

// Save file dialog
const result = await dialog.showSaveDialog({
  defaultPath: 'file.txt'
})
```

---

## divisionBox

DivisionBox SDK for creating independent windows:

```javascript
// Open DivisionBox
const session = await divisionBox.open({
  url: 'plugin://my-plugin/index.html',
  title: 'Independent Window',
  size: 'medium',  // 'compact' | 'medium' | 'expanded'
  keepAlive: true
})

// Close DivisionBox
await divisionBox.close(session.sessionId)

// Listen to state changes
divisionBox.onStateChange(session.sessionId, (state) => {
  console.log('State changed:', state)
})
```

---

## TuffItemBuilder

Search result builder:

```javascript
const item = new TuffItemBuilder('unique-id')
  .setSource('plugin', 'plugin-features')
  .setTitle('Title')
  .setSubtitle('Subtitle')
  .setIcon({ type: 'file', value: 'assets/icon.svg' })
  .createAndAddAction('action-id', 'copy', 'Copy', 'Content to copy')
  .addTag('Tag', 'blue')
  .setMeta({
    pluginName: 'my-plugin',
    featureId: 'my-feature',
    customData: 'any value'
  })
  .build()
```

---

## openUrl

Open external links:

```javascript
openUrl('https://example.com')
```

---

## Lifecycle Hooks

Plugin index.js must export a lifecycle hooks object:

```javascript
const pluginLifecycle = {
  /**
   * Called when a Feature is triggered
   * @param {string} featureId - Feature ID
   * @param {string|TuffQuery} query - Query content
   * @param {IPluginFeature} feature - Feature definition
   * @param {AbortSignal} signal - For cancellation
   */
  async onFeatureTriggered(featureId, query, feature, signal) {
    // Compatibility: query can be string or TuffQuery object
    const queryText = typeof query === 'string' ? query : query?.text
    
    // Handle Feature logic...
  },

  /**
   * Called when a search result item is clicked
   * @param {TuffItem} item - The clicked item
   */
  async onItemAction(item) {
    if (item.meta?.defaultAction === 'copy') {
      const copyAction = item.actions.find(a => a.type === 'copy')
      if (copyAction?.payload) {
        clipboard.writeText(copyAction.payload)
        box.hide()
      }
    }
  }
}

module.exports = pluginLifecycle
```

---

## Best Practices

1. **Use AbortSignal**: Pass signal parameter in async operations for cancellation support
2. **Error Handling**: Wrap all async operations with try-catch
3. **Logging**: Use logger instead of console for debugging and collection
4. **Storage Limits**: Mind the 10MB storage limit, use tempPath for large files
5. **TuffQuery Compatibility**: Handle query as both string and object formats

---

## Related Documentation

- [Feature SDK](./feature-sdk.en.md) - Feature detailed API
- [DivisionBox API](./division-box.en.md) - Independent window system
- [Flow Transfer API](./flow-transfer.en.md) - Plugin data transfer
