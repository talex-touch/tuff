# Translation Plugin - Index Structure

Modular Prelude script structure for the touch-translation plugin.

## Structure

```
index/
├── main.ts              # Entry point, plugin lifecycle
├── types.ts             # Shared type definitions
├── utils.ts             # Utility functions
├── item-builder.ts      # TuffItem builders
└── providers/           # Translation providers
    ├── index.ts
    ├── tuffintelligence.ts
    └── google.ts
```

## Key Changes

- **Intelligence SDK**: Uses `intelligence.invoke()` instead of direct channel calls
- **Modular Providers**: Each provider is a separate module
- **Shared Utilities**: Common functions extracted to utils.ts
- **Type Safety**: TypeScript with minimal comments
- **Zero Config**: Auto-compiled by unplugin-export-plugin

## Adding New Providers

1. Create provider class in `providers/`
2. Implement `TranslationProvider` interface
3. Export from `providers/index.ts`
4. Register in `main.ts` providers Map
