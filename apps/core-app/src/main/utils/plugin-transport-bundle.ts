import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import esbuild from 'esbuild'
import { app } from 'electron'
import { createLogger } from './logger'

const transportBundleLog = createLogger('PluginTransportBundle')

let cachedBundlePath: string | null = null
let cachedSourceMtime = 0
let buildPromise: Promise<string | null> | null = null

const getRepoRootFromPlugin = (pluginPath?: string): string | null => {
  if (!pluginPath) return null
  return path.resolve(pluginPath, '..', '..')
}

const findTransportEntry = (pluginPath?: string): string | null => {
  const repoRoot = getRepoRootFromPlugin(pluginPath)
  const appPath = app.getAppPath()
  const candidates = [
    repoRoot
      ? path.join(repoRoot, 'packages', 'utils', 'transport', 'sdk', 'plugin-transport.ts')
      : null,
    appPath
      ? path.join(
          appPath,
          '..',
          '..',
          'packages',
          'utils',
          'transport',
          'sdk',
          'plugin-transport.ts'
        )
      : null
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

const getBundlePath = (): string => {
  return path.join(os.tmpdir(), 'tuff-plugin-transport.cjs')
}

export async function getPluginTransportBundlePath(pluginPath?: string): Promise<string | null> {
  if (cachedBundlePath && fs.existsSync(cachedBundlePath)) {
    return cachedBundlePath
  }

  if (buildPromise) {
    return buildPromise
  }

  buildPromise = (async () => {
    const entry = findTransportEntry(pluginPath)
    if (!entry) {
      transportBundleLog.warn('Failed to locate plugin transport entry')
      return null
    }

    const bundlePath = getBundlePath()
    const sourceStat = fs.statSync(entry)
    const sourceMtime = sourceStat.mtimeMs

    if (fs.existsSync(bundlePath) && cachedSourceMtime >= sourceMtime) {
      cachedBundlePath = bundlePath
      return cachedBundlePath
    }

    try {
      await esbuild.build({
        entryPoints: [entry],
        outfile: bundlePath,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node22',
        sourcemap: false,
        logLevel: 'silent',
        external: ['electron'],
        define: {
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
        }
      })
      cachedSourceMtime = sourceMtime
      cachedBundlePath = bundlePath
      return cachedBundlePath
    } catch (error) {
      transportBundleLog.error('Failed to build plugin transport bundle', { error })
      return null
    }
  })()

  try {
    return await buildPromise
  } finally {
    buildPromise = null
  }
}
