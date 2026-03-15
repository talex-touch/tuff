#!/usr/bin/env node

if (process.env.TUFF_CLI_ENTRY !== '@talex-touch/tuff-cli') {
  console.warn(
    '[DEPRECATED] `@talex-touch/unplugin-export-plugin` CLI entry is deprecated. Please use `@talex-touch/tuff-cli`.',
  )
}

process.env.TUFF_CLI_ENTRY = process.env.TUFF_CLI_ENTRY || '@talex-touch/unplugin-export-plugin'

void (async () => {
  const forwardEntrypoint = '@talex-touch/tuff-cli/dist/bin/tuff.js'
  await import(forwardEntrypoint)
})()
