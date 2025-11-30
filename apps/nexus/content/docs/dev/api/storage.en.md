# Storage API

## Limits
- 10 MB quota per plugin; writes past the limit are rejected.
- Data lives under `config/plugins/<id>.json` with automatic cleanup.

## Read & Write
```ts
const storage = ctx.storage
await storage.setItem('settings', { theme: 'dark' })
const value = await storage.getItem('settings')
await storage.removeItem('legacy')
```

## Sync Signals
- Updates broadcast to all windows and plugin instances.
```ts
storage.onChange(payload => {
  console.log('storage update', payload)
})
```

## Secret Fields
- `storage.setSecret(key, value)` stores encrypted values.
- Secrets are decrypted on-demand and only kept in memory briefly.

## Debug
- Use `plugin:storage:get-item` via IPC to inspect state.
- `pnpm core:dev` prints storage diffs in DevTools.
