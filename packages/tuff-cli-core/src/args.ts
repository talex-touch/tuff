import type {
  BuildPackageFormat,
  NpmPublishAccess,
  PublishConfig,
  PublishTarget,
} from './types'

export interface BuildArgs {
  watch?: boolean
  dev?: boolean
  outputDir?: string
  format?: BuildPackageFormat
  npm?: boolean
}

export interface DevArgs {
  host?: string | boolean
  port?: number
  open?: boolean
}

const VALID_BUILD_FORMATS = new Set<BuildPackageFormat>(['tpex', 'npm', 'both'])
const VALID_PUBLISH_TARGETS = new Set<PublishTarget>(['nexus', 'npm', 'both'])
const VALID_NPM_ACCESS = new Set<NpmPublishAccess>(['public', 'restricted'])

function parseBuildPackageFormat(value: string): BuildPackageFormat {
  const normalized = value.trim().toLowerCase()
  if (VALID_BUILD_FORMATS.has(normalized as BuildPackageFormat))
    return normalized as BuildPackageFormat
  throw new Error(`Invalid --format value: ${value}. Expected tpex, npm, or both.`)
}

function parsePublishTarget(value: string): PublishTarget {
  const normalized = value.trim().toLowerCase()
  if (VALID_PUBLISH_TARGETS.has(normalized as PublishTarget))
    return normalized as PublishTarget
  throw new Error(`Invalid --target value: ${value}. Expected nexus, npm, or both.`)
}

function parseNpmAccess(value: string): NpmPublishAccess {
  const normalized = value.trim().toLowerCase()
  if (VALID_NPM_ACCESS.has(normalized as NpmPublishAccess))
    return normalized as NpmPublishAccess
  throw new Error(`Invalid --access value: ${value}. Expected public or restricted.`)
}

export function resolveBuildPackageFormat(options?: {
  format?: BuildPackageFormat
  npm?: boolean
}): BuildPackageFormat {
  if (options?.format === 'both')
    return 'both'
  if (options?.format === 'npm')
    return 'npm'
  if (options?.format === 'tpex')
    return options.npm ? 'both' : 'tpex'
  if (options?.npm)
    return 'both'
  return 'tpex'
}

export function parseBuildArgs(args: string[]): BuildArgs {
  let watch: boolean | undefined
  let dev = false
  let outputDir: string | undefined
  let format: BuildPackageFormat | undefined
  let npm: boolean | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--watch') {
      watch = true
    }
    else if (arg === '--dev') {
      dev = true
    }
    else if (arg === '--npm') {
      npm = true
    }
    else if (arg === '--format') {
      const next = args[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --format')
      format = parseBuildPackageFormat(next)
      i++
    }
    else if (arg.startsWith('--format=')) {
      const value = arg.slice('--format='.length)
      if (!value)
        throw new Error('Missing value for --format')
      format = parseBuildPackageFormat(value)
    }
    else if (arg === '--output') {
      const next = args[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --output')
      outputDir = next
      i++
    }
    else if (arg.startsWith('--output=')) {
      outputDir = arg.slice(9)
      if (!outputDir)
        throw new Error('Missing value for --output')
    }
    else if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`)
    }
  }

  return { watch, dev, outputDir, format, npm }
}

export function parseDevArgs(args: string[]): DevArgs {
  let host: string | boolean | undefined
  let port: number | undefined
  let open: boolean | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--open') {
      open = true
    }
    else if (arg === '--host') {
      const next = args[i + 1]
      if (next && !next.startsWith('-')) {
        host = next
        i++
      }
      else {
        host = true
      }
    }
    else if (arg.startsWith('--host=')) {
      host = arg.slice(7)
    }
    else if (arg === '--port') {
      const next = args[i + 1]
      if (!next || next.startsWith('-'))
        throw new Error('Missing value for --port')
      const value = Number(next)
      if (!Number.isFinite(value))
        throw new Error(`Invalid --port value: ${next}`)
      port = value
      i++
    }
    else if (arg.startsWith('--port=')) {
      const value = Number(arg.slice(7))
      if (!Number.isFinite(value))
        throw new Error(`Invalid --port value: ${arg.slice(7)}`)
      port = value
    }
  }

  return { host, port, open }
}

function readOptionValue(args: string[], index: number, flag: string): string {
  const next = args[index + 1]
  if (!next || next.startsWith('-'))
    throw new Error(`Missing value for ${flag}`)
  return next
}

export function parsePublishArgs(args: string[]): PublishConfig {
  const options: PublishConfig = {}

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--dry-run') {
      options.dryRun = true
    }
    else if (arg === '--non-interactive') {
      options.nonInteractive = true
    }
    else if (arg === '--provenance') {
      options.provenance = true
    }
    else if (arg === '--target') {
      options.target = parsePublishTarget(readOptionValue(args, i, '--target'))
      i++
    }
    else if (arg.startsWith('--target=')) {
      const value = arg.slice('--target='.length)
      if (!value)
        throw new Error('Missing value for --target')
      options.target = parsePublishTarget(value)
    }
    else if (arg === '--registry') {
      options.registry = readOptionValue(args, i, '--registry')
      i++
    }
    else if (arg.startsWith('--registry=')) {
      const value = arg.slice('--registry='.length)
      if (!value)
        throw new Error('Missing value for --registry')
      options.registry = value
    }
    else if (arg === '--access') {
      options.access = parseNpmAccess(readOptionValue(args, i, '--access'))
      i++
    }
    else if (arg.startsWith('--access=')) {
      const value = arg.slice('--access='.length)
      if (!value)
        throw new Error('Missing value for --access')
      options.access = parseNpmAccess(value)
    }
    else if (arg === '--tag') {
      if (args[i + 1]) {
        options.tag = args[++i]
      }
    }
    else if (arg.startsWith('--tag=')) {
      const value = arg.slice('--tag='.length)
      if (value)
        options.tag = value
    }
    else if (arg === '--channel') {
      if (args[i + 1]) {
        options.channel = args[++i] as PublishConfig['channel']
      }
    }
    else if (arg.startsWith('--channel=')) {
      const value = arg.slice('--channel='.length)
      if (value)
        options.channel = value as PublishConfig['channel']
    }
    else if (arg === '--notes') {
      if (args[i + 1]) {
        options.notes = args[++i]
      }
    }
    else if (arg.startsWith('--notes=')) {
      const value = arg.slice('--notes='.length)
      if (value)
        options.notes = value
    }
    else if (arg === '--api-url') {
      if (args[i + 1]) {
        options.apiUrl = args[++i]
      }
    }
    else if (arg.startsWith('--api-url=')) {
      const value = arg.slice('--api-url='.length)
      if (value)
        options.apiUrl = value
    }
  }

  return options
}
