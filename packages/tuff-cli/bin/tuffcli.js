#!/usr/bin/env node
import process from 'node:process'

process.env.TUFF_CLI_ENTRY = '@talex-touch/tuff-cli'
process.env.TUFF_CLI_COMMAND = 'tuffcli'

async function main() {
  await import('../dist/bin/tuff.js')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
