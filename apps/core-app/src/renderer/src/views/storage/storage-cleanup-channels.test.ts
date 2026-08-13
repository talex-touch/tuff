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
const EVENTS_REGISTRY = path.resolve(
  process.cwd(),
  '../../packages/utils/transport/events/index.ts'
)

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
    hits = ''
  }

  for (const file of hits.split('\n').filter(Boolean)) {
    if (registersChannel(readFileSync(file, 'utf8'), channel)) return true
  }

  // A typed event lives in the shared registry, so its name never appears under src/main at all —
  // the handler reads `transport.on(StorageEvents.cleanup.fileIndex, …)`. Resolve the accessor
  // path from the registry source, then look for a registration of that path.
  const accessor = accessorForChannel(channel)
  if (!accessor) return false
  try {
    execFileSync('grep', ['-rqF', `transport.on(${accessor}`, MAIN], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

/** A handler registered against a literal or a locally-defined event constant. */
function registersChannel(source: string, channel: string): boolean {
  const binding = new RegExp(
    `const\\s+(\\w+)\\s*=\\s*define\\w*Event[\\s\\S]{0,200}?['"\`]${channel}['"\`]`
  ).exec(source)
  const constant = binding?.[1]
  if (constant && new RegExp(`transport\\.on\\(\\s*${constant}\\b`).test(source)) return true
  return new RegExp(`(?:transport\\.on|regChannel)\\([^)]{0,80}['"\`]${channel}['"\`]`).test(source)
}

/**
 * `StorageEvents.cleanup.fileIndex` for `storage:cleanup:file-index`, read out of the registry.
 *
 * Derived rather than hard-coded: the point of this file is to notice a channel nobody handles, and
 * a hand-written map would have to be updated by the same person who forgot the handler.
 */
function accessorForChannel(channel: string): string | null {
  const registry = readFileSync(EVENTS_REGISTRY, 'utf8')
  const [domain, ...rest] = channel.split(':')
  const event = rest.at(-1)
  const module = rest.length > 1 ? rest[0] : undefined
  if (!domain || !event) return null

  const pattern = new RegExp(
    `(\\w+):\\s*defineEvent\\('${domain}'\\)\\s*` +
      (module ? `\\.module\\('${module}'\\)\\s*` : '') +
      `\\.event\\('${event}'\\)`
  )
  const key = pattern.exec(registry)?.[1]
  if (!key) return null

  const registryName = `${domain[0]!.toUpperCase()}${domain.slice(1)}Events`
  return module ? `${registryName}.${module}.${key}` : `${registryName}.${key}`
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
