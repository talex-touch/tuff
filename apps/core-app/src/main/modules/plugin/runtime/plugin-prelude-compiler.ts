import type { LogDataType } from '@talex-touch/utils/plugin/log/types'
import path from 'node:path'
import { build } from 'esbuild'

interface BundleLogger {
  info?: (...args: LogDataType[]) => void
  warn?: (...args: LogDataType[]) => void
  error?: (...args: LogDataType[]) => void
}

const BUNDLE_OUTPUT_FILE = 'prelude.bundle.cjs'
const BASE_BUILD_OPTIONS = {
  bundle: true,
  platform: 'node' as const,
  format: 'cjs' as const,
  target: 'node18',
  logLevel: 'silent' as const,
  write: false,
  external: ['electron']
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
    const result = await build({
      ...BASE_BUILD_OPTIONS,
      absWorkingDir: pluginPath,
      outfile,
      stdin: {
        contents: source,
        resolveDir: pluginPath,
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
    const result = await build({
      ...BASE_BUILD_OPTIONS,
      absWorkingDir: pluginPath,
      outfile,
      entryPoints: [entryPath]
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
