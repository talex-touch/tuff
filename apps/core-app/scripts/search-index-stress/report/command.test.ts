import { describe, expect, it } from 'vitest'
import { reproductionCommand } from './command'
import { runMeta } from './testing/builders'

const command = (argv: string[], over: Parameters<typeof runMeta>[0] = {}) =>
  reproductionCommand(runMeta({ argv, ...over }))

describe('reproductionCommand', () => {
  it('prints the CLI arguments behind the launcher', () => {
    expect(command(['run', '--profile', 'full', '--seed', '1030'])).toBe(
      'pnpm search:stress run --profile full --seed 1030'
    )
  })

  it('adds the profile and the seed when the run left them at their defaults', () => {
    expect(command(['run'], { profile: 'smoke', seed: 7 })).toBe(
      'pnpm search:stress run --profile smoke --seed 7'
    )
    expect(command([], { profile: 'full', seed: 1030 })).toBe(
      'pnpm search:stress run --profile full --seed 1030'
    )
    expect(command(['run', '--seed', '9'], { profile: 'smoke', seed: 9 })).toBe(
      'pnpm search:stress run --seed 9 --profile smoke'
    )
  })

  it('treats the --flag=value form as present', () => {
    expect(command(['run', '--profile=quick', '--seed=5'], { profile: 'full', seed: 1 })).toBe(
      'pnpm search:stress run --profile=quick --seed=5'
    )
  })

  it('leaves other commands alone', () => {
    expect(command(['report', '--from', '/tmp/run'])).toBe(
      'pnpm search:stress report --from /tmp/run'
    )
  })

  it('prints a whole process.argv as recorded', () => {
    expect(command(['node', '/repo/cli.ts', 'run', '--seed', '3'])).toBe(
      'node /repo/cli.ts run --seed 3'
    )
  })

  it('quotes what a shell would split or expand', () => {
    expect(command(['run', '--profile', 'full', '--seed', '1', '--out', "/tmp/my run/it's"])).toBe(
      "pnpm search:stress run --profile full --seed 1 --out '/tmp/my run/it'\\''s'"
    )
    expect(command(['node', '/a b/cli.ts'])).toBe("node '/a b/cli.ts'")
  })
})
