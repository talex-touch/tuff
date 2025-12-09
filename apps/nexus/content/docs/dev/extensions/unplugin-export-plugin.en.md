# Unplugin Export Plugin

`@talex-touch/unplugin-export-plugin` is a build tool plugin for Tuff plugin development, handling automatic resource export, manifest generation, and dev server integration.

## Installation

```bash
pnpm add -D @talex-touch/unplugin-export-plugin
```

## Quick Start

### Vite Configuration

```ts
// vite.config.ts
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [
    vue(),
    UnoCSS(),
    TouchPluginExport()
  ],
  server: {
    port: 6001  // Dev server port
  }
})
```

### Webpack Configuration

```js
// webpack.config.js
const TouchPluginExport = require('@talex-touch/unplugin-export-plugin/webpack')

module.exports = {
  plugins: [
    TouchPluginExport()
  ]
}
```

### Rollup Configuration

```js
// rollup.config.js
import TouchPluginExport from '@talex-touch/unplugin-export-plugin/rollup'

export default {
  plugins: [
    TouchPluginExport()
  ]
}
```

---

## Features

### 1. Automatic Manifest Processing

The plugin automatically reads `manifest.json` from project root and during build:
- Validates required fields
- Injects version information
- Generates production manifest

### 2. Resource Export

Automatically handles:
- **HTML entry files**: Auto-injects necessary scripts and styles
- **Static assets**: Copies `public/` directory to output
- **Icon files**: Processes icons declared in manifest

### 3. Development Mode Support

In development mode:
- Automatic HMR (Hot Module Replacement) configuration
- Generates development manifest
- Seamless integration with Tuff main process

---

## Configuration Options

```ts
TouchPluginExport({
  // manifest.json path (relative to project root)
  manifest: './manifest.json',
  
  // Output directory
  outDir: 'dist',
  
  // Generate source maps
  sourcemap: false,
  
  // Custom asset handling
  assets: {
    // Additional files/directories to copy
    copy: ['./assets/**/*'],
    
    // Excluded files
    exclude: ['**/*.test.ts']
  }
})
```

---

## Project Structure

Recommended plugin project structure:

```
my-plugin/
├── public/
│   └── icon.png           # Plugin icon
├── src/
│   ├── main.ts            # Entry file
│   ├── App.vue            # Main component
│   └── components/        # Components directory
├── index.html             # HTML entry
├── manifest.json          # Plugin manifest
├── vite.config.ts         # Vite config
├── package.json
└── tsconfig.json
```

---

## Manifest Example

```json
{
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.0.0",
  "description": "A sample Tuff plugin",
  "author": "Your Name",
  "icon": "public/icon.png",
  "main": "index.html",
  "features": [
    {
      "id": "search",
      "name": "Search Feature",
      "description": "Quick search",
      "keywords": ["search", "find"],
      "icon": "ri:search-line"
    }
  ],
  "dev": {
    "enable": true,
    "port": 6001
  }
}
```

---

## Development Mode

### Enabling Development Mode

Configure in `manifest.json`:

```json
{
  "dev": {
    "enable": true,
    "port": 6001
  }
}
```

### Hot Reload

In development mode, these changes trigger hot reload:
- Vue component changes
- CSS/SCSS changes
- JavaScript/TypeScript changes

`manifest.json` changes trigger plugin reload.

### Debugging Tips

1. **Open DevTools**: Press `Cmd+Option+I` (Mac) or `Ctrl+Shift+I` (Windows) in plugin window
2. **View logs**: Main process logs output to terminal
3. **Breakpoint debugging**: Use Chrome DevTools to set breakpoints

---

## Building for Production

```bash
pnpm build
```

Build output:

```
dist/
├── assets/
│   ├── index-[hash].js
│   └── index-[hash].css
├── index.html
├── manifest.json
└── icon.png
```

---

## SDK Integration

After building, use the SDK from `@talex-touch/utils`:

```ts
// src/main.ts
import { useBox, useClipboard, usePluginStorage } from '@talex-touch/utils/plugin/sdk'

const box = useBox()
const clipboard = useClipboard()
const storage = usePluginStorage()

// Plugin logic...
```

---

## FAQ

### Q: Plugin won't load after build

1. Check if `manifest.json` `id` field follows format `com.xxx.xxx`
2. Ensure `main` field points to correct entry file
3. Check main process logs for detailed error messages

### Q: Styles not working in dev mode

Ensure CSS preprocessor is configured correctly in `vite.config.ts`:

```ts
export default defineConfig({
  css: {
    preprocessorOptions: {
      scss: {
        // SCSS config
      }
    }
  }
})
```

### Q: Resource path errors

Use relative paths or `@/` alias:

```ts
// vite.config.ts
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
})
```

---

## Example Projects

Check official example plugins:

- [touch-image](https://github.com/AkraTech/talex-touch/tree/main/plugins/touch-image) - Image processing plugin
- [touch-translation](https://github.com/AkraTech/talex-touch/tree/main/plugins/touch-translation) - Translation plugin
- [touch-music](https://github.com/AkraTech/talex-touch/tree/main/plugins/touch-music) - Music player plugin
