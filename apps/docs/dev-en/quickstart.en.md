# Quickstart

## 1. Scaffold
```bash
npx degit talex-touch/tuff-plugin-template my-plugin
cd my-plugin
pnpm install
```
The template ships with the manifest, `init/index.ts`, `preload/index.ts`, and sample Vue components powered by `@talex-touch/utils`.

## 2. Manifest
`manifest.json`
```json
{
  "id": "com.example.my-plugin",
  "name": "Sample Plugin",
  "version": "0.1.0",
  "dev": { "enable": true },
  "entry": "init/index.ts",
  "permissions": ["clipboard", "network"],
  "acceptedInputTypes": ["text"]
}
```

## 3. Init Script
`init/index.ts`
```ts
import type { PluginContext } from '@talex-touch/utils'

export default async function init(ctx: PluginContext) {
  const { logger, channel } = ctx
  logger.info('Plugin ready')

  channel.reg('my-plugin:ping', async payload => {
    logger.debug('payload', payload)
    return { pong: true }
  })
}
```

## 4. Debug
- `pnpm core:dev` keeps the plugin hot-reloaded.
- Logs show up in DevTools and `logs/plugins/<id>.log`.
- Call `ctx.devtools.open()` to pop DevTools for the plugin window.

## 5. Build
```bash
pnpm build
```
The `dist/` folder contains compiled scripts, assets, and the update manifest.
