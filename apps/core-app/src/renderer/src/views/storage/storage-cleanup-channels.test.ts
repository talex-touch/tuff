import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every channel the storage view sends must have a main-process handler (#527).
 *
 * Storagable.vue renders cleanup buttons that `sendRaw` to `storage:cleanup:*`. Nothing in
 * src/main handles those names, so the buttons reach no implementation — while
 * src/main/service/storage-maintenance.ts holds 357 lines of cleanup logic that nothing imports.
 * Anyone debugging "cleanup did not free space" reads that file and finds the logic correct.
 *
 * Whether those three get wired up or the surface gets withdrawn is a product decision, so this
 * records the gap as a list that must shrink rather than asserting either outcome. A *new*
 * unhandled channel fails the run.
 */

const VIEW = path.resolve(process.cwd(), 'src/renderer/src/views/storage/Storagable.vue')
const MAIN = path.resolve(process.cwd(), 'src/main')

/** Channels the view sends that no main-process handler answers. Shrink, never grow. */
const KNOWN_UNHANDLED = [
  'storage:cleanup:downloads',
  'storage:cleanup:file-index',
  'storage:cleanup:updates'
]

/** A channel the same view sends through the same helper, and which *is* handled. */
const CONTROL_CHANNEL = 'system:get-storage-usage'

function channelsSentByView(): string[] {
  const source = readFileSync(VIEW, 'utf8')
  const found = new Set<string>()
  for (const match of source.matchAll(/channel:\s*'([^']+)'/g)) found.add(match[1]!)
  return [...found].sort()
}

function isHandledInMain(channel: string): boolean {
  try {
    execFileSync('grep', ['-rqF', channel, MAIN], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

describe('storage cleanup channels', () => {
  it('finds the channels the view sends', () => {
    // Positive control on the extraction: a regex that matched nothing would make the assertions
    // below vacuous.
    const channels = channelsSentByView()

    expect(channels.length).toBeGreaterThan(0)
    expect(channels).toContain('storage:cleanup:file-index')
  })

  it('can tell a handled channel from an unhandled one', () => {
    // Positive control on the search. The view sends this one through the same helper and main
    // answers it, so a search that could never find anything fails here rather than reporting
    // every channel as unhandled.
    expect(isHandledInMain(CONTROL_CHANNEL)).toBe(true)
    expect(isHandledInMain('storage:cleanup:definitely-not-a-real-channel')).toBe(false)
  })

  it('has no unhandled channel beyond the ones already known', () => {
    const unhandled = channelsSentByView().filter((channel) => !isHandledInMain(channel))

    expect(unhandled).toEqual(KNOWN_UNHANDLED)
  })
})
