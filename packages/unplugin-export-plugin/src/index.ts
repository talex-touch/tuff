/* eslint-disable no-console */
import type { ViteDevServer } from 'vite'
import type { Options } from './types'
import { Buffer } from 'node:buffer'
import process from 'node:process'
import Debug from 'debug'
import fs from 'fs-extra'
import path from 'pathe'
import { createUnplugin } from 'unplugin'
import {
  DEFAULT_PRELUDE_EXTERNAL,
  LEGACY_INDEX_DIR,
  PRELUDE_OUTPUT_FILE,
  createPreludeAlias,
  resolvePreludeBundleConfig,
  resolvePreludeDir,
  toProjectRelative,
  type PreludeBuildConfig,
} from './core/prelude'

let preludeBuildContext: any = null
let preludeBuildPromise: Promise<string | null> | null = null
let lastPreludeBuildTime = 0
let lastPreludeBuildSize = 0
let lastPreludeEntryPath: string | null = null
let forceRebuildPrelude = false

const VIRTUAL_PREFIX = 'virtual:tuff-raw/'
const VIRTUAL_PREFIX_RESOLVED = `\0${VIRTUAL_PREFIX}`

const debug = Debug('unplugin-tuff:core')

/**
 * Build the Prelude source folder to index.js using esbuild (for dev mode).
 */
async function buildPreludeBundle(
  projectRoot: string,
  config: PreludeBuildConfig,
  manifest: { name?: string, version?: string },
  chalk: any,
): Promise<string | null> {
  try {
    const esbuild = await import('esbuild')
    const startTime = Date.now()

    const needsRebuild = lastPreludeEntryPath !== config.entry || forceRebuildPrelude
    if (needsRebuild && preludeBuildContext) {
      await preludeBuildContext.dispose()
      preludeBuildContext = null
      forceRebuildPrelude = false
    }

    if (!preludeBuildContext) {
      lastPreludeEntryPath = config.entry
      preludeBuildContext = await esbuild.context({
        entryPoints: [config.entry],
        bundle: true,
        format: config.format ?? 'cjs',
        target: config.target ?? 'node24',
        platform: 'node',
        write: false,
        external: config.external ?? DEFAULT_PRELUDE_EXTERNAL,
        minify: false,
        sourcemap: 'inline',
        define: {
          __PLUGIN_NAME__: JSON.stringify(manifest.name ?? 'unknown'),
          __PLUGIN_VERSION__: JSON.stringify(manifest.version ?? '0.0.0'),
        },
        alias: createPreludeAlias(config.entry),
        logLevel: 'warning',
      })
    }

    const result = await preludeBuildContext.rebuild()
    const duration = Date.now() - startTime
    lastPreludeBuildTime = Date.now()

    if (result.errors.length > 0) {
      console.error(chalk.red('[Tuff DevKit] Prelude build failed:'))
      result.errors.forEach((err: any) => console.error(chalk.red(`  - ${err.text}`)))
      return null
    }

    const output = result.outputFiles?.[0]?.text || ''
    lastPreludeBuildSize = Buffer.byteLength(output, 'utf-8')
    console.log(
      chalk.green(
        `[Tuff DevKit] ${toProjectRelative(projectRoot, config.entry)} rebuilt as index.js in ${duration}ms`,
      ),
    )
    return output
  }
  catch (error: any) {
    console.error(chalk.red(`[Tuff DevKit] Failed to build Prelude: ${error.message}`))
    return null
  }
}

/**
 * Debounced Prelude build.
 */
function debouncedPreludeBuild(
  projectRoot: string,
  config: PreludeBuildConfig,
  manifest: { name?: string, version?: string },
  chalk: any,
  delay = 100,
): Promise<string | null> {
  if (preludeBuildPromise) {
    return preludeBuildPromise
  }

  preludeBuildPromise = new Promise((resolve) => {
    setTimeout(async () => {
      const result = await buildPreludeBundle(projectRoot, config, manifest, chalk)
      preludeBuildPromise = null
      resolve(result)
    }, delay)
  })

  return preludeBuildPromise
}

export default createUnplugin<Options | undefined>((options, meta) => {
  const projectRoot = process.cwd()
  let filesToVirtualize: string[] = []
  let preludeConfig: PreludeBuildConfig | null = null
  let manifestCache: Record<string, any> = {}

  let chalkPromise: Promise<any> | undefined
  const getChalk = () => {
    if (!chalkPromise)
      chalkPromise = import('chalk').then(m => m.default)
    return chalkPromise
  }

  const lastUpdateStatus: Record<string, number> = {}

  return {
    name: 'unplugin-tuff-export-plugin',
    enforce: 'pre',

    async buildStart() {
      const chalk = await getChalk()
      console.log(chalk.cyan('[Tuff DevKit]'), 'Plugin instance created.')

      const manifestPath = path.join(projectRoot, 'manifest.json')
      manifestCache = await fs.pathExists(manifestPath)
        ? await fs.readJson(manifestPath)
        : {}

      const potentialFiles = ['manifest.json', 'index.js', 'preload.js']
      filesToVirtualize = []
      for (const file of potentialFiles) {
        try {
          await fs.access(path.join(projectRoot, file))
          filesToVirtualize.push(file)
        }
        catch {
          // File does not exist, do nothing
        }
      }

      preludeConfig = resolvePreludeBundleConfig(
        {
          root: projectRoot,
          sourceDir: options?.sourceDir ?? 'src',
          indexDir: options?.indexDir ?? LEGACY_INDEX_DIR,
          external: options?.external,
          minify: false,
          sourcemap: true,
        },
        manifestCache,
      )

      if (preludeConfig && !filesToVirtualize.includes(PRELUDE_OUTPUT_FILE)) {
        filesToVirtualize.push('index.js')
        console.log(
          chalk.cyan('[Tuff DevKit]'),
          `Detected Prelude source ${chalk.yellow(toProjectRelative(projectRoot, preludeConfig.entry))}, enabling real-time compilation`,
        )
      }

      debug('Virtualizing files:', filesToVirtualize)
    },

    resolveId(id) {
      const normalizedId = id.startsWith('/') ? id.slice(1) : id

      if (filesToVirtualize.includes(normalizedId) || normalizedId.startsWith('widgets/')) {
        const resolvedId = VIRTUAL_PREFIX_RESOLVED + normalizedId
        return resolvedId
      }
      return null
    },

    async load(id) {
      if (id.startsWith(VIRTUAL_PREFIX_RESOLVED)) {
        const originalId = id.slice(VIRTUAL_PREFIX_RESOLVED.length)
        const filePath = path.join(projectRoot, originalId)

        // Special handling for virtual index.js when Prelude source is configured or detected
        if (originalId === PRELUDE_OUTPUT_FILE && preludeConfig) {
          const chalk = await getChalk()
          const bundledCode = await buildPreludeBundle(
            projectRoot,
            preludeConfig,
            manifestCache,
            chalk,
          )
          if (bundledCode) {
            return bundledCode
          }
        }

        try {
          await fs.access(filePath)
          const content = await fs.readFile(filePath, 'utf-8')
          return content
        }
        catch (e) {
          const errorPayload = {
            status: 404,
            message: '[Tuff DevKit] File not found.',
            file: originalId,
            fullPath: filePath,
          }
          return `export default ${JSON.stringify(errorPayload, null, 2)};`
        }
      }
      return null
    },

    vite: {
      configureServer(server: ViteDevServer) {
        const sourceDir = options?.sourceDir ?? 'src'
        const indexDir = options?.indexDir ?? LEGACY_INDEX_DIR
        const preludeDir = resolvePreludeDir(projectRoot, sourceDir)
        const legacyIndexDir = path.join(projectRoot, indexDir)
        const preludeWatchDir = toProjectRelative(projectRoot, preludeDir)
        const filesToWatch = [
          ...filesToVirtualize,
          'widgets',
          'README.md',
          preludeWatchDir,
          indexDir,
        ]
        const watcher = server.watcher

        for (const file of filesToWatch) {
          try {
            watcher.add(path.join(projectRoot, file))
          }
          catch { /* Ignore if path doesn't exist */ }
        }

        const handleFileChange = async (file: string) => {
          const relativePath = path.relative(projectRoot, file)
          const normalizedRelativePath = relativePath.replace(/\\/g, '/')
          debug(`File changed: ${relativePath}, triggering HMR.`)

          const isPreludeFile = preludeConfig && (
            path.resolve(file) === path.resolve(preludeConfig.entry) ||
            normalizedRelativePath.startsWith(`${preludeWatchDir}/`) ||
            normalizedRelativePath.startsWith(`${indexDir}/`)
          )

          if (isPreludeFile && preludeConfig) {
            const chalk = await getChalk()
            console.log(chalk.cyan('[Tuff DevKit]'), `Prelude changed: ${relativePath}`)

            forceRebuildPrelude = true

            await debouncedPreludeBuild(projectRoot, preludeConfig, manifestCache, chalk)

            const virtualIndexId = `${VIRTUAL_PREFIX_RESOLVED}index.js`
            const indexMod = server.moduleGraph.getModuleById(virtualIndexId)
            if (indexMod) {
              server.moduleGraph.invalidateModule(indexMod)
            }

            server.ws.send('tuff:update', {
              path: 'index.js',
              timestamp: Date.now(),
              source: preludeConfig.source === 'src-prelude' || preludeConfig.source === 'manifest-prelude'
                ? 'prelude'
                : 'index-folder',
            })
            return
          }

          const virtualId = VIRTUAL_PREFIX_RESOLVED + relativePath
          const mod = server.moduleGraph.getModuleById(virtualId)
          if (mod)
            server.moduleGraph.invalidateModule(mod)

          server.ws.send('tuff:update', {
            path: relativePath,
            timestamp: Date.now(),
          })
        }

        watcher.on('change', handleFileChange)
        watcher.on('add', handleFileChange)
        watcher.on('unlink', handleFileChange)

        server.middlewares.use('/_tuff_devkit/update', async (req, res) => {
          const coreFiles = ['manifest.json', 'index.js', 'preload.js', 'README.md']
          const filesToCheck = new Set([...coreFiles, ...filesToVirtualize])

          const status: Record<string, {
            exist: boolean
            changed: boolean
            lastModified: number | null
            path: string
            size: number | null
            source?: string
          }> = {}

          for (const file of filesToCheck) {
            if (file === PRELUDE_OUTPUT_FILE && preludeConfig) {
              const lastModified = lastPreludeBuildTime || fs.statSync(preludeConfig.entry).mtime.getTime()
              status[file] = {
                exist: true,
                changed: lastUpdateStatus[file] !== lastModified,
                lastModified,
                path: preludeConfig.entry,
                size: lastPreludeBuildSize || fs.statSync(preludeConfig.entry).size,
                source: preludeConfig.source === 'src-prelude' || preludeConfig.source === 'manifest-prelude'
                  ? 'prelude'
                  : 'index-folder',
              }
              lastUpdateStatus[file] = lastModified
              continue
            }

            const filePath = path.join(projectRoot, file)
            try {
              const stats = await fs.stat(filePath)
              const lastModified = stats.mtime.getTime()
              status[file] = {
                exist: true,
                changed: lastUpdateStatus[file] !== lastModified,
                lastModified,
                path: filePath,
                size: stats.size,
              }
              lastUpdateStatus[file] = lastModified
            }
            catch {
              status[file] = {
                exist: false,
                changed: lastUpdateStatus[file] !== -1, // Changed if it existed before
                lastModified: null,
                path: filePath,
                size: null,
              }
              lastUpdateStatus[file] = -1 // Mark as non-existent
            }
          }

          try {
            const widgetFiles = await fs.readdir(path.join(projectRoot, 'widgets'))
            for (const file of widgetFiles.map(f => `widgets/${f}`)) {
              const filePath = path.join(projectRoot, file)
              try {
                const stats = await fs.stat(filePath)
                const lastModified = stats.mtime.getTime()
                status[file] = {
                  exist: true,
                  changed: lastUpdateStatus[file] !== lastModified,
                  lastModified,
                  path: filePath,
                  size: stats.size,
                }
                lastUpdateStatus[file] = lastModified
              }
              catch {
                // This case is unlikely inside a readdir loop but included for safety
                status[file] = {
                  exist: false,
                  changed: lastUpdateStatus[file] !== -1,
                  lastModified: null,
                  path: filePath,
                  size: null,
                }
                lastUpdateStatus[file] = -1
              }
            }
          }
          catch { /* widgets directory may not exist */ }

          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(status, null, 2))
        })

        debug('Vite server configured with HMR and update API.')
      },
    },
  }
})
