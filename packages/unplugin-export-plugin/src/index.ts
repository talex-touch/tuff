/* eslint-disable no-console */
import process from 'node:process'
import path from 'pathe'
import fs from 'fs-extra'
import { createUnplugin } from 'unplugin'
import type { ViteDevServer } from 'vite'
import Debug from 'debug'
import type { Options } from './types'
import { build } from './core/exporter'

const VIRTUAL_PREFIX = 'virtual:tuff-raw/'
const VIRTUAL_PREFIX_RESOLVED = `\0${VIRTUAL_PREFIX}`

const debug = Debug('unplugin-tuff:core')

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
        const filesToWatch = [...filesToVirtualize, 'widgets', 'README.md']
        const watcher = server.watcher

        for (const file of filesToWatch) {
          try {
            watcher.add(path.join(projectRoot, file))
          }
          catch { /* Ignore if path doesn't exist */ }
        }

        const handleFileChange = (file: string) => {
          const relativePath = path.relative(projectRoot, file)
          debug(`File changed: ${relativePath}, triggering HMR.`)

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
