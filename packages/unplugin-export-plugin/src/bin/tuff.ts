#!/usr/bin/env node
/* eslint-disable no-console */
import type { Locale } from '../cli/i18n'
import type { SelectOption } from '../cli/prompts'
import { createRequire } from 'node:module'
import process from 'node:process'
import { runCreate } from '../cli/commands'
import {
  initI18n,
  setLocale,
  t,
} from '../cli/i18n'
import {
  askLanguageSwitch,
  askSelect,
  colors,
  printHeader,
  printInfo,
  styled,
} from '../cli/prompts'
import { build } from '../core/exporter'
import { login, logout, printPublishHelp, runPublish } from '../core/publish'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

// Initialize i18n with system locale
initI18n()

function printHelp() {
  console.log('Usage: tuff <command> [options]')
  console.log('')
  console.log('Commands:')
  console.log('  create      Create a new Tuff plugin from template')
  console.log('  builder     Build and package the current project into .tpex')
  console.log('  publish     Publish a release to Tuff Nexus')
  console.log('  login       Authenticate with Tuff Nexus')
  console.log('  logout      Clear authentication')
  console.log('  help        Show this help message')
  console.log('  about       Display tool information')
  console.log('')
  console.log('Options:')
  console.log('  --lang=en|zh   Set CLI language (default: system language)')
  console.log('')
  console.log('Run `tuff <command> --help` for command-specific help.')
  console.log('')
  console.log('Interactive mode:')
  console.log('  Run `tuff` without arguments to enter interactive mode.')
}

function printAbout() {
  console.log('Talex Touch · Tuff DevKit')
  console.log(`Version: ${pkg.version}`)
  console.log('')
  console.log('Tools:')
  console.log('  - create:  Create new plugins from templates')
  console.log('  - builder: Package plugins into .tpex format')
  console.log('  - publish: Publish app releases to Nexus server')
}

async function runBuilder() {
  console.log('Running: tuff builder')
  await build()
}

/**
 * Interactive menu mode
 */
async function runInteractiveMode(): Promise<void> {
  printHeader(
    t('welcome.title'),
    `${t('welcome.subtitle')} · ${t('welcome.version', { version: pkg.version })}`,
  )

  const menuOptions: SelectOption<string>[] = [
    { label: t('menu.create'), value: 'create' },
    { label: t('menu.build'), value: 'build' },
    { label: t('menu.publish'), value: 'publish' },
    { label: t('menu.login'), value: 'login' },
    { label: t('menu.logout'), value: 'logout' },
    { label: t('menu.settings'), value: 'settings' },
    { label: t('menu.help'), value: 'help' },
    { label: t('menu.exit'), value: 'exit' },
  ]

  const action = await askSelect(t('welcome.selectAction'), menuOptions)

  switch (action) {
    case 'create':
      await runCreate()
      break
    case 'build':
      await runBuilder()
      break
    case 'publish':
      await runPublish()
      break
    case 'login':
      await login()
      break
    case 'logout':
      await logout()
      break
    case 'settings':
      await runSettings()
      break
    case 'help':
      printHelp()
      break
    case 'exit':
      console.log(styled('👋 Bye!', colors.cyan))
      break
  }
}

/**
 * Settings menu
 */
async function runSettings(): Promise<void> {
  printHeader(t('settings.title'))

  const settingsOptions: SelectOption<string>[] = [
    { label: t('settings.language'), value: 'language' },
    { label: t('common.back'), value: 'back' },
  ]

  const setting = await askSelect(t('welcome.selectAction'), settingsOptions)

  if (setting === 'language') {
    const newLocale = await askLanguageSwitch()
    printInfo(t('settings.languageChanged', { lang: t(`settings.languages.${newLocale}`) }))
    // Re-run interactive mode with new locale
    await runInteractiveMode()
  }
  else {
    await runInteractiveMode()
  }
}

/**
 * Parse --lang flag from args
 */
function parseLangFlag(): Locale | null {
  for (const arg of process.argv) {
    if (arg.startsWith('--lang=')) {
      const lang = arg.slice(7).toLowerCase()
      if (lang === 'en' || lang === 'zh') {
        return lang
      }
    }
  }
  return null
}

async function main() {
  // Check for language flag
  const langFlag = parseLangFlag()
  if (langFlag) {
    setLocale(langFlag)
  }

  const command = (process.argv[2] || '').toLowerCase()
  const hasHelpFlag = process.argv.includes('--help') || process.argv.includes('-h')

  // Filter out --lang flag from command detection
  const isLangOnly = command.startsWith('--lang=')

  try {
    if (command === 'create') {
      // Parse create options from args
      const nameArg = process.argv[3]
      await runCreate({
        name: nameArg && !nameArg.startsWith('-') ? nameArg : undefined,
      })
    }
    else if (command === 'builder' || command === 'build') {
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
    else if (command === 'help') {
      printHelp()
    }
    else if (command === '' || isLangOnly) {
      // Interactive mode when no command
      await runInteractiveMode()
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
