#!/usr/bin/env node
process.env.TUFF_CLI_ENTRY = '@talex-touch/tuff-cli'
process.env.TUFF_CLI_COMMAND = 'tuffcli'
await import('../dist/bin/tuff.js')
