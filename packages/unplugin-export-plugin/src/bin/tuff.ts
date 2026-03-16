#!/usr/bin/env node

if (process.env.TUFF_CLI_ENTRY !== '@talex-touch/tuff-cli') {
  console.warn(
    '[DEPRECATED] `@talex-touch/unplugin-export-plugin` CLI entry is deprecated. Please use `@talex-touch/tuff-cli`.',
  )
}

process.env.TUFF_CLI_ENTRY = process.env.TUFF_CLI_ENTRY || '@talex-touch/unplugin-export-plugin'

void (async () => {
  const forwardEntrypoint = '@talex-touch/tuff-cli/dist/bin/tuff.js'
  try {
    await import(forwardEntrypoint)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(
      `[ERROR] Failed to load "${forwardEntrypoint}". Please install "@talex-touch/tuff-cli" and retry.`,
    )
    console.error('[HINT] pnpm add -D @talex-touch/tuff-cli')
    console.error(`[DETAIL] ${message}`)
    process.exit(1)
  }
})()
