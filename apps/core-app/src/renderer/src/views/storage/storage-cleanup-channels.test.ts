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
 * Resolved by wiring rather than by withdrawing the buttons: the view, the service and the shared
 * StorageCleanupResult type already agreed on the contract, so the only missing piece was the
 * registration. The inventory below is now empty and the assertion is an equality, which means a
 * *new* unhandled channel fails the run — the same guarantee, with nothing left to excuse.
 */

const VIEW = path.resolve(process.cwd(), 'src/renderer/src/views/storage/Storagable.vue')
const MAIN = path.resolve(process.cwd(), 'src/main')

/**
 * Channels the view sends that no main-process handler answers.
 *
 * Empty since #527 wired the three cleanup events. Keep it empty: an entry here is a button that
 * shows a confirmation dialog and then fails, which is worse than a button that is not there.
 */
const KNOWN_UNHANDLED: string[] = []

/** A channel the same view sends through the same helper, and which *is* handled. */
const CONTROL_CHANNEL = 'system:get-storage-usage'

function channelsSentByView(): string[] {
  const source = readFileSync(VIEW, 'utf8')
  const found = new Set<string>()
  for (const match of source.matchAll(/channel:\s*'([^']+)'/g)) found.add(match[1]!)
  return [...found].sort()
}

/**
 * Whether main registers a handler for a channel — not merely whether the name appears there.
 *
 * The first version of this grepped for the channel string. That reports "handled" for a channel
 * whose event is *defined* in main and never registered, which is a state this repo actually
 * reached: removing the three `transport.on` calls left the `defineRawEvent` lines behind and the
 * check stayed green. So it now resolves the event constant the name is bound to, and requires a
 * `transport.on(<constant>` for it.
 */
function isHandledInMain(channel: string): boolean {
  let hits: string
  try {
    hits = execFileSync('grep', ['-rlF', channel, MAIN], { encoding: 'utf8' })
  } catch {
    return false
  }

  for (const file of hits.split('\n').filter(Boolean)) {
    const source = readFileSync(file, 'utf8')
    // `const someEvent = defineRawEvent<…>(\n  'channel'\n)` — the binding may be lines away.
    const binding = new RegExp(
      `const\\s+(\\w+)\\s*=\\s*define\\w*Event[\\s\\S]{0,200}?['"\`]${channel}['"\`]`
    ).exec(source)
    const constant = binding?.[1]
    if (constant && new RegExp(`transport\\.on\\(\\s*${constant}\\b`).test(source)) return true
    // A handler may also register the literal directly.
    if (new RegExp(`(?:transport\\.on|regChannel)\\([^)]{0,80}['"\`]${channel}['"\`]`).test(source))
      return true
  }
  return false
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

  it('leaves no channel the view sends without a handler', () => {
    const unhandled = channelsSentByView().filter((channel) => !isHandledInMain(channel))

    expect(unhandled).toEqual(KNOWN_UNHANDLED)
  })
})
