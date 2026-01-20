#!/usr/bin/env node
/* eslint-disable no-console */
import type { Locale } from '../cli/i18n'
import type { SelectOption } from '../cli/prompts'
import type { BuildConfig, DevConfig } from '../types'
import { createRequire } from 'node:module'
import process from 'node:process'
import type { RollupWatcher } from 'rollup'
import { build as viteBuild, createServer } from 'vite'
import { parseBuildArgs, parseDevArgs } from '../cli/args'
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
import { resolveBuildConfig, resolveDevConfig } from '../core/config'
import { build } from '../core/exporter'
import { login, logout, printPublishHelp, runPublish } from '../core/publish'
import TouchPluginExport from '../vite'

const require = createRequire(import.meta.url)
const pkg = require('../../package.json')

// Initialize i18n with system locale
initI18n()

function printHelp() {
  console.log('Usage: tuff <command> [options]')
  console.log('')
  console.log('Commands:')
  console.log('  create      Create a new Tuff plugin from template')
  console.log('  build       Run Vite build and package .tpex output')
  console.log('  builder     Package existing build output into .tpex')
  console.log('  dev         Start Vite dev server for plugin development')
  console.log('  publish     Publish plugin package to Tuff Nexus')
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
  console.log('  - build:   Run Vite build and package .tpex output')
  console.log('  - builder: Package existing build output into .tpex')
  console.log('  - dev:     Start a Vite dev server for plugin development')
  console.log('  - publish: Publish plugin packages to Nexus server')
}

function printBuildHelp() {
  console.log('Usage: tuff build [options]')
  console.log('')
  console.log('Options:')
  console.log('  --watch         Watch files and rebuild on changes')
  console.log('  --dev           Use development mode (no minify, sourcemap)')
  console.log('  --output <dir>  Output directory (default: dist)')
  console.log('  --help, -h      Show this help message')
  console.log('')
}

function printDevHelp() {
  console.log('Usage: tuff dev [options]')
  console.log('')
  console.log('Options:')
  console.log('  --port <port>   Dev server port')
  console.log('  --host [host]   Dev server host (omit value to listen on all)')
  console.log('  --open          Open browser on start')
  console.log('  --help, -h      Show this help message')
  console.log('')
}

async function runBuilder() {
  console.log('Running: tuff builder')
  await build()
}

async function runBuild() {
  const args = process.argv.slice(3)
  if (args.includes('--help') || args.includes('-h')) {
    printBuildHelp()
    return
  }

  const { watch, dev, outputDir } = parseBuildArgs(args)

  const cliOverrides: BuildConfig = {}
  if (watch !== undefined)
    cliOverrides.watch = watch
  if (outputDir)
    cliOverrides.outDir = outputDir
  if (dev) {
    cliOverrides.minify = false
    cliOverrides.sourcemap = true
  }

  const buildConfig = await resolveBuildConfig(process.cwd(), cliOverrides)
  const resolvedOutput = buildConfig.outDir ?? 'dist'
  const mode = dev ? 'development' : 'production'

  const exporterOptions = {
    outDir: buildConfig.outDir,
    minify: buildConfig.minify,
    sourcemap: buildConfig.sourcemap,
  }

  try {
    const viteResult = await viteBuild({
      root: process.cwd(),
      mode,
      plugins: [TouchPluginExport()],
      build: {
        outDir: resolvedOutput,
        minify: buildConfig.minify,
        sourcemap: buildConfig.sourcemap,
        watch: buildConfig.watch ? {} : undefined,
      },
    })

    if (!buildConfig.watch) {
      await build(exporterOptions)
      return
    }

    if (!viteResult || typeof (viteResult as RollupWatcher).on !== 'function')
      throw new Error('Vite watch mode did not return a watcher')

    const watcher = viteResult as RollupWatcher
    let packaging = false
    let pending = false

    const runPackage = async () => {
      if (packaging) {
        pending = true
        return
      }
      packaging = true
      try {
        await build(exporterOptions)
      }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        console.error(`tuff build failed: ${message}`)
        process.exitCode = 1
      }
      finally {
        packaging = false
        if (pending) {
          pending = false
          await runPackage()
        }
      }
    }

    watcher.on('event', (event) => {
      if (event.code === 'END') {
        void runPackage()
      }
      else if (event.code === 'ERROR') {
        const message = event.error instanceof Error ? event.error.message : String(event.error)
        console.error(`tuff build failed: ${message}`)
        process.exitCode = 1
      }
    })

    const shutdown = async () => {
      await watcher.close()
      process.exit(0)
    }

    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`tuff build failed: ${message}`)
    process.exitCode = 1
  }
}

async function runDev() {
  const args = process.argv.slice(3)
  if (args.includes('--help') || args.includes('-h')) {
    printDevHelp()
    return
  }

  const { host, port, open } = parseDevArgs(args)

  try {
    const cliOverrides: DevConfig = {}
    if (host !== undefined)
      cliOverrides.host = host
    if (port !== undefined)
      cliOverrides.port = port
    if (open !== undefined)
      cliOverrides.open = open

    const devConfig = await resolveDevConfig(process.cwd(), cliOverrides)

    const server = await createServer({
      root: process.cwd(),
      plugins: [TouchPluginExport()],
      server: {
        host: devConfig.host,
        port: devConfig.port,
        open: devConfig.open,
      },
    })

    await server.listen()
    server.printUrls()

    const shutdown = async () => {
      await server.close()
      process.exit(0)
    }

    process.on('SIGINT', () => void shutdown())
    process.on('SIGTERM', () => void shutdown())
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`tuff dev failed: ${message}`)
    process.exitCode = 1
  }
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
    { label: t('menu.dev'), value: 'dev' },
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
      await runBuild()
      break
    case 'dev':
      await runDev()
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
    else if (command === 'build') {
      if (hasHelpFlag)
        printBuildHelp()
      else
        await runBuild()
    }
    else if (command === 'builder') {
      await runBuilder()
    }
    else if (command === 'dev') {
      await runDev()
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
