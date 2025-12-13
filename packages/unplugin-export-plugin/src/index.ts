/* eslint-disable no-console */
import process from 'node:process'
import path from 'pathe'
import fs from 'fs-extra'
import { createUnplugin } from 'unplugin'
import type { ViteDevServer } from 'vite'
import Debug from 'debug'
import type { Options } from './types'
import { build } from './core/exporter'

const INDEX_FOLDER = 'index'
let indexBuildContext: any = null
let indexBuildPromise: Promise<string | null> | null = null
let lastIndexBuildTime = 0

const VIRTUAL_PREFIX = 'virtual:tuff-raw/'
const VIRTUAL_PREFIX_RESOLVED = `\0${VIRTUAL_PREFIX}`

const debug = Debug('unplugin-tuff:core')

/**
 * Build index/ folder to index.js using esbuild (for dev mode)
 */
async function buildIndexFolder(projectRoot: string, chalk: any): Promise<string | null> {
  const indexDir = path.join(projectRoot, INDEX_FOLDER)
  if (!await fs.pathExists(indexDir)) {
    return null
  }

  const entryFiles = ['main.ts', 'main.js', 'index.ts', 'index.js']
  let entryPath: string | null = null
  for (const file of entryFiles) {
    const fullPath = path.join(indexDir, file)
    if (await fs.pathExists(fullPath)) {
      entryPath = fullPath
      break
    }
  }

  if (!entryPath) {
    console.warn(chalk.yellow('[Tuff DevKit] index/ folder found but no entry file (main.ts/js, index.ts/js)'))
    return null
  }

  try {
    const esbuild = await import('esbuild')
    const manifestPath = path.join(projectRoot, 'manifest.json')
    let manifest = { name: 'unknown', version: '0.0.0' }
    if (await fs.pathExists(manifestPath)) {
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'))
    }

    const startTime = Date.now()
    
    // Use incremental build context for faster rebuilds
    if (!indexBuildContext) {
      indexBuildContext = await esbuild.context({
        entryPoints: [entryPath],
        bundle: true,
        format: 'cjs',
        target: 'node18',
        platform: 'node',
        write: false,
        external: ['electron'],
        minify: false,
        sourcemap: 'inline',
        define: {
          '__PLUGIN_NAME__': JSON.stringify(manifest.name),
          '__PLUGIN_VERSION__': JSON.stringify(manifest.version),
        },
        alias: {
          '@': indexDir,
          '~': indexDir,
        },
        logLevel: 'warning',
      })
    }

    const result = await indexBuildContext.rebuild()
    const duration = Date.now() - startTime
    lastIndexBuildTime = Date.now()

    if (result.errors.length > 0) {
      console.error(chalk.red('[Tuff DevKit] Index folder build failed:'))
      result.errors.forEach((err: any) => console.error(chalk.red(`  - ${err.text}`)))
      return null
    }

    const output = result.outputFiles?.[0]?.text || ''
    console.log(chalk.green(`[Tuff DevKit] index/ rebuilt in ${duration}ms`))
    return output
  } catch (error: any) {
    console.error(chalk.red(`[Tuff DevKit] Failed to build index/: ${error.message}`))
    return null
  }
}

/**
 * Debounced index folder build
 */
function debouncedIndexBuild(projectRoot: string, chalk: any, delay = 100): Promise<string | null> {
  if (indexBuildPromise) {
    return indexBuildPromise
  }
  
  indexBuildPromise = new Promise((resolve) => {
    setTimeout(async () => {
      const result = await buildIndexFolder(projectRoot, chalk)
      indexBuildPromise = null
      resolve(result)
    }, delay)
  })
  
  return indexBuildPromise
}

export default createUnplugin<Options | undefined>((options, meta) => {
  const projectRoot = process.cwd()
  let filesToVirtualize: string[] = []

  let chalkPromise: Promise<typeof import('chalk').default> | undefined
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
      
      // Check for index/ folder - if exists, add virtual index.js
      const indexDir = path.join(projectRoot, INDEX_FOLDER)
      if (await fs.pathExists(indexDir) && !filesToVirtualize.includes('index.js')) {
        filesToVirtualize.push('index.js')
        console.log(chalk.cyan('[Tuff DevKit]'), 'Detected index/ folder, enabling real-time compilation')
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
        
        // Special handling for index.js when index/ folder exists
        if (originalId === 'index.js') {
          const indexDir = path.join(projectRoot, INDEX_FOLDER)
          if (await fs.pathExists(indexDir)) {
            const chalk = await getChalk()
            const bundledCode = await buildIndexFolder(projectRoot, chalk)
            if (bundledCode) {
              return bundledCode
            }
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
        const filesToWatch = [...filesToVirtualize, 'widgets', 'README.md', INDEX_FOLDER]
        const watcher = server.watcher

        for (const file of filesToWatch) {
          try {
            watcher.add(path.join(projectRoot, file))
          }
          catch { /* Ignore if path doesn't exist */ }
        }

        const handleFileChange = async (file: string) => {
          const relativePath = path.relative(projectRoot, file)
          debug(`File changed: ${relativePath}, triggering HMR.`)
          
          // If file is in index/ folder, rebuild and invalidate index.js
          if (relativePath.startsWith(INDEX_FOLDER + '/') || relativePath.startsWith(INDEX_FOLDER + '\\')) {
            const chalk = await getChalk()
            console.log(chalk.cyan('[Tuff DevKit]'), `index/ changed: ${relativePath}`)
            
            // Rebuild index folder
            await debouncedIndexBuild(projectRoot, chalk)
            
            // Invalidate virtual index.js module
            const virtualIndexId = VIRTUAL_PREFIX_RESOLVED + 'index.js'
            const indexMod = server.moduleGraph.getModuleById(virtualIndexId)
            if (indexMod) {
              server.moduleGraph.invalidateModule(indexMod)
            }
            
            server.ws.send('tuff:update', {
              path: 'index.js',
              timestamp: Date.now(),
              source: 'index-folder',
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
          }> = {}

          for (const file of filesToCheck) {
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
