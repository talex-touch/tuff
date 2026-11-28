import type { LogDataType } from '@talex-touch/utils/plugin/log/types'
import type { Plugin as EsbuildPlugin } from 'esbuild'
import fs from 'node:fs/promises'
import { builtinModules } from 'node:module'
import path from 'node:path'
import { build } from 'esbuild'

interface BundleLogger {
  info?: (...args: LogDataType[]) => void
  warn?: (...args: LogDataType[]) => void
  error?: (...args: LogDataType[]) => void
}

const BUNDLE_OUTPUT_FILE = 'prelude.bundle.cjs'
const BUILTIN_MODULE_SET = new Set([
  ...builtinModules,
  ...builtinModules.map((mod) => (mod.startsWith('node:') ? mod : `node:${mod}`)),
  'electron'
])
const BASE_BUILD_OPTIONS = {
  bundle: true,
  platform: 'node' as const,
  format: 'cjs' as const,
  target: 'node24',
  logLevel: 'silent' as const,
  write: false,
  external: ['electron']
}

function isWithinPluginRoot(pluginRootReal: string, candidateReal: string): boolean {
  const normalizedRoot =
    process.platform === 'darwin' || process.platform === 'win32'
      ? pluginRootReal.toLowerCase()
      : pluginRootReal
  const normalizedCandidate =
    process.platform === 'darwin' || process.platform === 'win32'
      ? candidateReal.toLowerCase()
      : candidateReal
  const relative = path.relative(normalizedRoot, normalizedCandidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function createPluginRootConfinementPlugin(pluginRootReal: string): EsbuildPlugin {
  return {
    name: 'tuff-plugin-prelude-root-confinement',
    setup(pluginBuild) {
      pluginBuild.onResolve({ filter: /.*/ }, async (args) => {
        if (args.pluginData?.confinedCheck) {
          return null
        }
        if (BUILTIN_MODULE_SET.has(args.path)) {
          return { path: args.path, external: true }
        }
        const resolved = await pluginBuild.resolve(args.path, {
          kind: args.kind,
          resolveDir: args.resolveDir,
          importer: args.importer,
          pluginData: { confinedCheck: true }
        })
        if (resolved.errors.length > 0) {
          return { errors: resolved.errors }
        }
        if (resolved.external) {
          return { path: resolved.path, external: true }
        }
        if (!resolved.path) {
          return null
        }
        let realTarget: string
        try {
          realTarget = await fs.realpath(resolved.path)
        } catch {
          return {
            errors: [{ text: `Prelude import "${args.path}" could not be canonicalized.` }]
          }
        }
        if (!isWithinPluginRoot(pluginRootReal, realTarget)) {
          return {
            errors: [
              { text: `Prelude import "${args.path}" resolves outside the plugin directory.` }
            ]
          }
        }
        return { path: realTarget, namespace: resolved.namespace }
      })
    }
  }
}

export async function bundlePluginPreludeFromContent(
  pluginName: string,
  pluginPath: string,
  tempDir: string,
  source: string,
  logger?: BundleLogger
): Promise<string | null> {
  const outfile = path.join(tempDir, BUNDLE_OUTPUT_FILE)

  try {
    const pluginRootReal = await fs.realpath(pluginPath)
    const result = await build({
      ...BASE_BUILD_OPTIONS,
      absWorkingDir: pluginRootReal,
      outfile,
      plugins: [createPluginRootConfinementPlugin(pluginRootReal)],
      stdin: {
        contents: source,
        resolveDir: pluginRootReal,
        sourcefile: 'index.js'
      }
    })

    const output = result.outputFiles?.[0]?.text
    if (!output) {
      logger?.warn?.(`[Plugin ${pluginName}] Prelude bundle produced no output.`)
      return null
    }

    return output
  } catch (error) {
    const details: LogDataType = error instanceof Error ? error : { error }
    logger?.warn?.(`[Plugin ${pluginName}] Prelude bundle failed.`, details)
    return null
  }
}

export async function bundlePluginPreludeFromFile(
  pluginName: string,
  pluginPath: string,
  tempDir: string,
  entryPath: string,
  logger?: BundleLogger
): Promise<string | null> {
  const outfile = path.join(tempDir, BUNDLE_OUTPUT_FILE)

  try {
    const pluginRootReal = await fs.realpath(pluginPath)
    const entryReal = await fs.realpath(entryPath)
    if (!isWithinPluginRoot(pluginRootReal, entryReal)) {
      logger?.warn?.(`[Plugin ${pluginName}] Prelude entry resolves outside the plugin directory.`)
      return null
    }
    const result = await build({
      ...BASE_BUILD_OPTIONS,
      absWorkingDir: pluginRootReal,
      outfile,
      plugins: [createPluginRootConfinementPlugin(pluginRootReal)],
      entryPoints: [entryReal]
    })

    const output = result.outputFiles?.[0]?.text
    if (!output) {
      logger?.warn?.(`[Plugin ${pluginName}] Prelude bundle produced no output.`)
      return null
    }

    return output
  } catch (error) {
    const details: LogDataType = error instanceof Error ? error : { error }
    logger?.warn?.(`[Plugin ${pluginName}] Prelude bundle failed.`, details)
    return null
  }
}
