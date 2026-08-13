import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A user-facing dialog must not print internal paths (#800).
 *
 * The renderer-not-found modal concatenated `app.getAppPath()`, `__dirname`, `process.resourcesPath`
 * and every candidate path into its detail text. A user hitting a broken install screenshots that
 * for a support request and shares their OS username and directory layout — for information that
 * is actionable only to a developer, and which the caller had already written to the log.
 *
 * The log path is not a substitute: `app.getPath('logs')` is itself an absolute path containing the
 * username, so naming it in the text reintroduces the same leak in miniature. The dialog offers a
 * button instead.
 *
 * Lives in packages/utils because `ci / CI - utils` is blocking, while `App suites (core-app)` is
 * continue-on-error and reports success however the suite does.
 */

const REPO_ROOT = path.resolve(__dirname, '../../..')
const TOUCH_APP = path.join(REPO_ROOT, 'apps/core-app/src/main/core/touch-app.ts')
const source = readFileSync(TOUCH_APP, 'utf8')

const dialogBody = (() => {
  const start = source.indexOf('private async showFileNotFoundDialog')
  if (start === -1) return ''
  const end = source.indexOf('\n  }\n', start)
  return source.slice(start, end === -1 ? undefined : end)
})()

/** Expressions that resolve to an absolute path on the user's machine. */
const PATH_SOURCES = [
  'app.getAppPath()',
  '__dirname',
  'process.resourcesPath',
  "app.getPath('logs')"
]

describe('renderer-not-found dialog', () => {
  it('is found', () => {
    // Positive control: an empty slice satisfies every "does not contain" assertion below.
    expect(dialogBody).not.toBe('')
    expect(dialogBody).toContain('dialog.showMessageBox')
  })

  it('builds its detail text without any machine path', () => {
    const detail = /const detail = \[[\s\S]*?\]\.join/.exec(dialogBody)?.[0] ?? ''

    expect(detail).not.toBe('')
    for (const expression of PATH_SOURCES) {
      expect(detail, expression).not.toContain(expression)
    }
    expect(detail).not.toContain('triedPaths')
  })

  it('still records the paths where they are useful', () => {
    // Removing the disclosure must not remove the diagnosis: the same values go to the log, which
    // is where a developer reads them.
    expect(dialogBody).toContain('mainLog.error')
    expect(dialogBody).toMatch(/meta: \{ filePath, triedPaths/)
  })

  it('offers the log folder as an action rather than as text', () => {
    // The user still needs to reach the log; a button gets them there without the folder location
    // appearing on screen.
    expect(dialogBody).toContain("buttons: ['OK', 'Open Log Folder']")
    expect(dialogBody).toContain("shell.openPath(app.getPath('logs'))")
  })
})
