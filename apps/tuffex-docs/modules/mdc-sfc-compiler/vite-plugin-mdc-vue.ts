import { existsSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'
import { compileMdcToSfc } from './compile-mdc-to-sfc'
import type { MdcDocRouteEntry, MdcVuePluginOptions } from './types'

interface CachedSfcEntry {
  mtimeMs: number
  size: number
  salt: string
  sfc: string
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, '/')
}

function normalizeCleanId(id: string): { path: string, query: string } {
  const qIdx = id.indexOf('?')
  if (qIdx === -1)
    return { path: toPosixPath(id), query: '' }
  return {
    path: toPosixPath(id.slice(0, qIdx)),
    query: id.slice(qIdx + 1),
  }
}

/**
 * Reusable Vite plugin (`enforce: 'pre'`) that compiles `.mdc` Markdown files into
 * Vue 3 SFCs on demand so `@vitejs/plugin-vue` compiles them into native ES modules
 * (`default` Vue component with `createStaticVNode` + named `docMeta` export).
 *
 * Also serves a lazy route-index virtual module (`options.virtualIndexId`) with one
 * direct `() => import('<abs>.mdc')` per route and supports single-file dev HMR.
 */
export function createMdcVuePlugin<TMeta = Record<string, unknown>>(
  options: MdcVuePluginOptions<TMeta>,
): Plugin {
  const normalizedContentDir = toPosixPath(resolve(options.contentDir)).replace(/\/+$/, '')
  const contentDirPrefix = `${normalizedContentDir}/`
  const resolvedVirtualIndexId = `\0${options.virtualIndexId}`
  const sfcCache = new Map<string, CachedSfcEntry>()

  let cachedRoutes: MdcDocRouteEntry[] | null = null

  const getRoutes = (): MdcDocRouteEntry[] => {
    if (!cachedRoutes)
      cachedRoutes = options.discoverRoutes(normalizedContentDir)
    return cachedRoutes
  }

  const isOwnedMdcFile = (posixPath: string): boolean => (
    posixPath.endsWith('.mdc') && posixPath.startsWith(contentDirPrefix)
  )

  return {
    name: 'mdc-sfc-vue',
    enforce: 'pre',

    resolveId(id) {
      if (id === options.virtualIndexId)
        return resolvedVirtualIndexId
      return null
    },

    async load(id) {
      if (id === resolvedVirtualIndexId) {
        return options.generateVirtualIndexCode(getRoutes())
      }

      const { path: cleanPath, query } = normalizeCleanId(id)
      // Only intercept base `.mdc` requests; allow `@vitejs/plugin-vue` to serve
      // sub-block virtual requests like `foo.mdc?vue&type=style&index=0&lang.css`.
      if (query || !isOwnedMdcFile(cleanPath))
        return null

      if (!existsSync(cleanPath))
        return null

      this.addWatchFile(cleanPath)

      const stats = statSync(cleanPath)
      const salt = options.getCacheKeySalt ? options.getCacheKeySalt() : ''
      const cached = sfcCache.get(cleanPath)
      if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size && cached.salt === salt) {
        return { code: cached.sfc, map: null }
      }

      const raw = readFileSync(cleanPath, 'utf8')
      const compiled = await compileMdcToSfc(raw, {
        ...options.getCompileOptions(cleanPath),
        filePath: cleanPath,
      })

      sfcCache.set(cleanPath, {
        mtimeMs: stats.mtimeMs,
        size: stats.size,
        salt,
        sfc: compiled.sfc,
      })

      return { code: compiled.sfc, map: null }
    },

    configureServer(server: ViteDevServer) {
      const invalidateIndex = (changedPath: string) => {
        const posix = toPosixPath(changedPath)
        if (!isOwnedMdcFile(posix))
          return
        cachedRoutes = null
        sfcCache.delete(posix)
        const mod = server.moduleGraph.getModuleById(resolvedVirtualIndexId)
        if (mod)
          server.moduleGraph.invalidateModule(mod)
      }

      server.watcher.on('add', invalidateIndex)
      server.watcher.on('unlink', invalidateIndex)
    },

    handleHotUpdate(ctx) {
      const posix = toPosixPath(ctx.file)
      if (!isOwnedMdcFile(posix))
        return
      sfcCache.delete(posix)
    },
  }
}
