#!/usr/bin/env node
/* eslint-disable no-console */
import process from 'node:process'
import { createRequire } from 'node:module'
import { build } from '../core/exporter'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

function printHelp() {
  console.log('Usage: tuff <command>')
  console.log('')
  console.log('Commands:')
  console.log('  builder   build and package the current project into .tpex')
  console.log('  help      show this help message')
  console.log('  about     display tool information')
}

function printAbout() {
  console.log('Talex Touch · Tuff Builder')
  console.log(`Version: ${pkg.version}`)
  console.log('Opinionated packager for Talex Touch projects.')
}

async function runBuilder() {
  console.log('Aliasing command: tuff builder')
  await build()
}

async function main() {
  const command = (process.argv[2] || '').toLowerCase()

  try {
    if (command === 'builder')
      await runBuilder()
    else if (command === 'about')
      printAbout()
    else if (command === 'help' || command === '')
      printHelp()
    else
      throw new Error(`Unknown command: ${command}`)
  }
  catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    console.error(message)
    if (command !== 'help' && command !== 'about')
      console.error('Run `tuff help` to see available commands.')
    process.exitCode = 1
  }
}

main()
