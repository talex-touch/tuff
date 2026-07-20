#!/usr/bin/env node
import process from 'node:process'

async function main() {
  await import('../dist/bin/tuff.js')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
