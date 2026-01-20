import type { PublishConfig } from '../types'

export interface BuildArgs {
  watch?: boolean
  dev?: boolean
  outputDir?: string
}

export interface DevArgs {
  host?: string | boolean
  port?: number
  open?: boolean
}

export function parseBuildArgs(args: string[]): BuildArgs {
  let watch: boolean | undefined
  let dev = false
  let outputDir: string | undefined

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--watch') {
      watch = true
    }
    else if (arg === '--dev') {
      dev = true
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

  return { watch, dev, outputDir }
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

export function parsePublishArgs(args: string[]): PublishConfig {
  const options: PublishConfig = {}

  if (args.includes('--dry-run')) {
    options.dryRun = true
  }

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--tag' && args[i + 1]) {
      options.tag = args[++i]
    }
    else if (args[i] === '--channel' && args[i + 1]) {
      options.channel = args[++i] as PublishConfig['channel']
    }
    else if (args[i] === '--notes' && args[i + 1]) {
      options.notes = args[++i]
    }
    else if (args[i] === '--api-url' && args[i + 1]) {
      options.apiUrl = args[++i]
    }
  }

  return options
}
