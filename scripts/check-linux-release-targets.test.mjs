import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * The Linux / Ubuntu 24.04 release contract in electron-builder.yml and
 * build-and-release.yml (#213).
 *
 * Two independent packaging defects kept Ubuntu 24.04 broken or unverified:
 *   1. Without `toolsets.appimage`, electron-builder 26 falls back to the legacy
 *      FUSE2 runtime (`0.0.0` / `appimage-12.0.1`), which fails on stock Ubuntu
 *      24.04 because `libfuse2` is no longer installed by default.
 *   2. The `.deb` relied implicitly on electron-builder's internal AppArmor
 *      template and non-t64 default depends, and the Linux CI smoke timed out
 *      during `--appimage-extract-and-run` extraction before `tuff` ever executed
 *      (producing a false `verdict: ok` on v2.4.15-beta.13).
 */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CORE_APP_DIR = path.join(ROOT, 'apps/core-app')
const CONFIG_PATH = path.join(CORE_APP_DIR, 'electron-builder.yml')
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/build-and-release.yml')

const config = readFileSync(CONFIG_PATH, 'utf8').replace(/^\s*#.*$/gm, '')
const workflow = readFileSync(WORKFLOW_PATH, 'utf8')

function topLevelBlock(source, key) {
  const needle = `\n${key}:`
  const start = source.indexOf(needle)
  expect(start, `missing top-level ${key}: block in electron-builder.yml`).toBeGreaterThan(-1)
  const rest = source.slice(start + 1)
  const next = rest.slice(1).search(/\n(?=[a-z])/i)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

describe('linux / Ubuntu 24.04 release targets (#213)', () => {
  it('uses the static FUSE3 AppImage toolset instead of legacy FUSE2', () => {
    const toolsets = topLevelBlock(config, 'toolsets')
    expect(toolsets).toMatch(/appimage:\s*['"]?1\.0\.3['"]?/)
  })

  it('ships both AppImage and deb targets on Linux', () => {
    const linux = topLevelBlock(config, 'linux')
    expect(linux).toContain('AppImage')
    expect(linux).toContain('deb')
  })

  it('checks in an explicit Ubuntu 24.04 AppArmor profile granting userns for deb installs', () => {
    const deb = topLevelBlock(config, 'deb')
    const match = deb.match(/appArmorProfile:\s*(\S+)/)
    expect(match, 'deb.appArmorProfile must be configured').not.toBeNull()

    const profilePath = path.resolve(CORE_APP_DIR, match[1])
    expect(existsSync(profilePath), `missing AppArmor profile at ${profilePath}`).toBe(true)

    const profile = readFileSync(profilePath, 'utf8')
    expect(profile).toContain('abi <abi/4.0>')
    // eslint-disable-next-line no-template-curly-in-string
    expect(profile).toContain('"/opt/${sanitizedProductName}/${executable}"')
    expect(profile).toMatch(/\buserns,/)
  })

  it('declares Ubuntu 24.04 t64-compatible deb dependencies without breaking 22.04', () => {
    const deb = topLevelBlock(config, 'deb')
    expect(deb).toContain('libgtk-3-0t64 | libgtk-3-0')
    expect(deb).toContain('libatspi2.0-0t64 | libatspi2.0-0')
    expect(deb).toContain('libasound2t64 | libasound2')
    expect(deb).toContain('libnss3')
  })

  it('extracts the AppImage outside the launch timeout and smoke-tests the .deb AppArmor install in release CI', () => {
    const smokeStart = workflow.indexOf('name: "Smoke: launch the packaged Linux app"')
    expect(smokeStart).toBeGreaterThan(-1)
    const nextStep = workflow.indexOf('\n      - name:', smokeStart + 1)
    const smokeBlock = workflow.slice(smokeStart, nextStep === -1 ? undefined : nextStep)

    expect(smokeBlock).toContain('--appimage-extract')
    expect(smokeBlock).not.toContain('timeout --signal=TERM 45s xvfb-run -a --server-args="-screen 0 1280x1024x24" "$APPIMAGE" --appimage-extract-and-run')
    expect(smokeBlock).toContain('/etc/apparmor.d/tuff')
    expect(smokeBlock).toContain('/opt/tuff/tuff')
  })
})
