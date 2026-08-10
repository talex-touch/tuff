import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * No Prelude may export `onInputChanged` — the host never calls it (#823).
 *
 * The name exists on two SDK interfaces with the same doc comment, and only one is wired:
 *
 * - `ITargetFeatureLifeCycle.onInputChanged` **is** called — `plugin.ts` iterates
 *   `_featureEvent: Map<string, ITargetFeatureLifeCycle[]>` and invokes it on every input change.
 * - `IFeatureLifeCycle.onInputChanged`, which is what a Prelude exports, is **not**.
 *   `triggerInputChanged` calls `pluginLifecycle.onFeatureTriggered` and the listeners above, and
 *   nothing else.
 *
 * So the hook is not fictional, it is on the wrong object — which is exactly why
 * `touch-browser-open` implemented it in good faith and kept 4 lines of unreachable code plus the
 * `activeSearch` state feeding it. Suggestions still refreshed, because the re-invoked
 * `onFeatureTriggered` was doing the same work.
 *
 * Wiring it instead was the other option and is not a drop-in: the Prelude's handler pushes items,
 * and `onFeatureTriggered` already pushed them for the same event, so every existing plugin would
 * double-publish. That is a design decision for #823, not a fix to smuggle in here.
 *
 * Lives in packages/utils because `ci / CI - utils` is a blocking check, whereas
 * `App suites (core-app)` is continue-on-error and reports success whatever the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const PLUGINS = path.join(REPO_ROOT, 'plugins')

/** Prelude entry points: the `index.js` each plugin root exposes. */
function preludes(): Array<{ name: string, source: string }> {
  return readdirSync(PLUGINS)
    .filter(name => statSync(path.join(PLUGINS, name)).isDirectory())
    .map(name => ({ name, file: path.join(PLUGINS, name, 'index.js') }))
    .filter(({ file }) => {
      try {
        return statSync(file).isFile()
      }
      catch {
        return false
      }
    })
    .map(({ name, file }) => ({ name, source: readFileSync(file, 'utf8') }))
}

const found = preludes()

describe('prelude lifecycle exports', () => {
  it('reads the preludes it means to check', () => {
    // Positive control. "No prelude declares onInputChanged" is also what an empty file list
    // reports, and a wrong root produces exactly that.
    expect(found.length).toBeGreaterThan(10)
  })

  it('finds the hook that is wired, so the scan is known to work', () => {
    // Second control, on the same query shape as the rule below. onFeatureTriggered is called
    // from plugin.ts and every searching plugin implements it.
    const implementing = found.filter(({ source }) => /\bonFeatureTriggered\s*\(/.test(source))

    expect(implementing.length).toBeGreaterThan(5)
  })

  it('declares no onInputChanged, which would never run', () => {
    const dead = found
      .filter(({ source }) => /^\s*(?:async\s+)?onInputChanged\s*\(/m.test(source))
      .map(({ name }) => name)

    expect(dead).toEqual([])
  })
})
