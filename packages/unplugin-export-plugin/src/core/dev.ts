
/* eslint-disable no-console */
import process from 'node:process'
import path from 'pathe'
import fs from 'fs-extra'
import type { ViteDevServer } from 'vite'
import type { Options } from '../types'

export async function dev(options?: Options, server?: ViteDevServer) {
  if (!server) {
    console.warn('[TalexTouch TuffDevKit] Vite Dev Server not found. Tuff DevKit is running in standalone mode.')
    return
  }

  const { default: chalk } = await import('chalk')
  const logPrefix = chalk.cyan('[TalexTouch TuffDevKit]')

  const projectRoot = process.cwd()

  // --- Filesystem Allow (New) ---
  console.log(`${logPrefix} Adding project root to fs.allow: ${chalk.yellow(projectRoot)}`)
  server.config.server.fs.allow.push(projectRoot)

  // --- HMR Logic ---
  const filesToWatch = ['manifest.json', 'index.js', 'preload.js', 'widgets']
  const watcher = server.watcher

  for (const file of filesToWatch)
    watcher.add(path.join(projectRoot, file))

  const handleFileChange = (file: string, event: 'changed' | 'added' | 'removed') => {
    const relativePath = path.relative(projectRoot, file)
    console.log(`${logPrefix} File ${event}: ${chalk.yellow(relativePath)}`)
    server.ws.send('tuff:update', {
      path: relativePath,
      timestamp: Date.now(),
    })
  }

  watcher.on('change', file => handleFileChange(file, 'changed'))
  watcher.on('add', file => handleFileChange(file, 'added'))
  watcher.on('unlink', file => handleFileChange(file, 'removed'))

  console.log(`${logPrefix} Watching for file changes...`)

  // --- File Serving Logic ---
  const filesToServe = ['manifest.json', 'index.js', 'preload.js']

  server.middlewares.use(async (req, res, next) => {
    if (!req.url)
      return next()

    const url = req.url.startsWith('/') ? req.url.slice(1) : req.url
    console.log(`${logPrefix} Middleware triggered for URL: ${chalk.gray(req.url)}`)

    const isWidget = url.startsWith('widgets/')

    if (filesToServe.includes(url) || isWidget) {
      console.log(`${logPrefix} URL match found: ${chalk.green(url)}`)
      const filePath = path.join(projectRoot, url)

      if (await fs.pathExists(filePath)) {
        console.log(`${logPrefix} Found file at: ${chalk.cyan(filePath)}`)
        try {
          const content = await fs.readFile(filePath, 'utf-8')
          let contentType = 'text/plain'
          if (url.endsWith('.js'))
            contentType = 'application/javascript'
          else if (url.endsWith('.json'))
            contentType = 'application/json'
          else if (url.endsWith('.vue'))
            contentType = 'application/javascript' // Serve .vue as JS

          console.log(`${logPrefix} Serving file ${chalk.green(url)} with Content-Type: ${chalk.blue(contentType)}`)
          res.writeHead(200, { 'Content-Type': contentType })
          res.end(content)
          return
        }
        catch (error) {
          console.error(`${logPrefix} ${chalk.red('Error serving file')} ${chalk.yellow(filePath)}:`, error)
          res.statusCode = 500
          res.end('Internal Server Error')
          return
        }
      }
      else {
        console.warn(`${logPrefix} ${chalk.yellow('File not found for matched URL')}: ${chalk.red(filePath)}`)
      }
    }
    else {
      console.log(`${logPrefix} No match for URL ${chalk.gray(url)}, passing to next middleware.`)
    }

    return next()
  })

  console.log(`${logPrefix} File serving middleware enabled.`)
}
