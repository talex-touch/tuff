#!/usr/bin/env node
/* eslint-disable no-console */
import process from 'node:process'
import { createRequire } from 'node:module'
import { build } from '../core/exporter'
import { login, logout, printPublishHelp, runPublish } from '../core/publish'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

function printHelp() {
  console.log('Usage: tuff <command> [options]')
  console.log('')
  console.log('Commands:')
  console.log('  builder     Build and package the current project into .tpex')
  console.log('  publish     Publish a release to Tuff Nexus')
  console.log('  login       Authenticate with Tuff Nexus')
  console.log('  logout      Clear authentication')
  console.log('  help        Show this help message')
  console.log('  about       Display tool information')
  console.log('')
  console.log('Run `tuff <command> --help` for command-specific help.')
}

function printAbout() {
  console.log('Talex Touch · Tuff DevKit')
  console.log(`Version: ${pkg.version}`)
  console.log('')
  console.log('Tools:')
  console.log('  - builder: Package plugins into .tpex format')
  console.log('  - publish: Publish app releases to Nexus server')
}

async function runBuilder() {
  console.log('Running: tuff builder')
  await build()
}

async function main() {
  const command = (process.argv[2] || '').toLowerCase()
  const hasHelpFlag = process.argv.includes('--help') || process.argv.includes('-h')

  try {
    if (command === 'builder') {
      await runBuilder()
    }
    else if (command === 'publish') {
      if (hasHelpFlag)
        printPublishHelp()
      else
        await runPublish()
    }
    else if (command === 'login') {
      await login()
    }
    else if (command === 'logout') {
      await logout()
    }
    else if (command === 'about') {
      printAbout()
    }
    else if (command === 'help' || command === '') {
      printHelp()
    }
    else {
      throw new Error(`Unknown command: ${command}`)
    }
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
