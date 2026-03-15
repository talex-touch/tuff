#!/usr/bin/env node
process.env.TUFF_CLI_ENTRY = '@talex-touch/tuff-cli'
await import('@talex-touch/unplugin-export-plugin/dist/bin/tuff.js')
