import { describe, expect, it } from 'vitest'
import { parseBuildArgs, parseDevArgs, parsePublishArgs } from '../cli/args'

describe('cli args parsing', () => {
  it('parses build flags', () => {
    const args = parseBuildArgs(['--watch', '--dev', '--output', 'dist-custom'])
    expect(args.watch).toBe(true)
    expect(args.dev).toBe(true)
    expect(args.outputDir).toBe('dist-custom')
  })

  it('parses dev flags', () => {
    const args = parseDevArgs(['--host', '127.0.0.1', '--port', '5173', '--open'])
    expect(args.host).toBe('127.0.0.1')
    expect(args.port).toBe(5173)
    expect(args.open).toBe(true)
  })

  it('parses publish flags', () => {
    const args = parsePublishArgs(['--tag', '1.0.0', '--channel', 'BETA', '--dry-run'])
    expect(args.tag).toBe('1.0.0')
    expect(args.channel).toBe('BETA')
    expect(args.dryRun).toBe(true)
  })
})
