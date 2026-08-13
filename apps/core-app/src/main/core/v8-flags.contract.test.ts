/**
 * `--max-old-space-size=512` sat in the renderer js-flags under a comment claiming it raised the
 * heap limit. On 64-bit platforms V8's default old-space is far above 512MB, so it lowered the
 * ceiling for every renderer instead - the opposite of what the commit adding it described, and
 * touch-window.ts already reports RENDER_PROCESS_OOM (#795).
 *
 * Source assertions, in the style of the sibling quit-paths.test.ts: precore.ts runs its guards,
 * its handlers and its filesystem setup at module scope, so importing it to read the flag list
 * would boot most of the main process.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PRECORE = readFileSync(path.join(__dirname, 'precore.ts'), 'utf8')

describe('global V8 flags do not cap the renderer heap', () => {
  it('不再给所有子进程设 --max-old-space-size', () => {
    // Positive control: the flag list must still be there, or the absence below proves nothing.
    expect(PRECORE).toContain('const v8JsFlags')

    expect(PRECORE).not.toMatch(/v8JsFlags\s*=\s*\[[^\]]*max-old-space-size/)
  })

  it('--jitless 逃生开关仍然保留', () => {
    // Removing the cap must not take the Tahoe crash workaround with it.
    expect(PRECORE).toContain('TUFF_V8_JITLESS')
    expect(PRECORE).toContain("v8JsFlags.push('--jitless')")
  })

  it('空列表时不会附加一个空的 js-flags 开关', () => {
    expect(PRECORE).toMatch(/if \(v8JsFlags\.length > 0\) \{\s*\n\s*app\.commandLine\.appendSwitch/)
  })
})
