import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const applyScriptPath = new URL('./macos-apply-update.sh', import.meta.url)
const restoreScriptPath = new URL('./macos-restore-update.sh', import.meta.url)
const applyScript = await readFile(applyScriptPath, 'utf8')
const restoreScript = await readFile(restoreScriptPath, 'utf8')

function readShellFunction(source: string, name: string): string {
  const match = source.match(new RegExp(`${name}\\(\\) \\{([\\s\\S]*?)\\n\\}`))
  if (!match?.[1]) {
    throw new Error(`Missing shell function: ${name}`)
  }
  return match[1]
}

describe('macOS update scripts', () => {
  it.runIf(process.platform !== 'win32')('remain valid Bash', async () => {
    await Promise.all([
      execFileAsync('/bin/bash', ['-n', applyScriptPath.pathname]),
      execFileAsync('/bin/bash', ['-n', restoreScriptPath.pathname])
    ])
  })

  it('detaches the DMG mount without a /tmp path spelling precheck', async () => {
    const cleanupMount = readShellFunction(applyScript, 'cleanup_mount')

    expect(cleanupMount).toContain('/usr/bin/hdiutil detach "$MOUNT_DIR" -quiet')
    expect(cleanupMount).not.toMatch(/(?:^|\n)\s*(?:\/usr\/bin\/)?mount(?:\s|$)/)
    expect(cleanupMount).not.toContain('grep')

    const root = await mkdtemp(path.join(tmpdir(), 'tuff-macos-cleanup-test-'))
    const capturePath = path.join(root, 'hdiutil-args.txt')
    const mountDir = '/tmp/tuff-update-stage-spelling-probe/mount'
    const executableFunction = cleanupMount.replace('/usr/bin/hdiutil', 'hdiutil_probe')

    try {
      await execFileAsync(
        '/bin/bash',
        [
          '-c',
          `hdiutil_probe() { printf '%s\\n' "$@" > "$CAPTURE_FILE"; }\ncleanup_mount() {${executableFunction}\n}\ncleanup_mount`
        ],
        {
          env: {
            ...process.env,
            CAPTURE_FILE: capturePath,
            MOUNT_DIR: mountDir
          }
        }
      )

      await expect(readFile(capturePath, 'utf8')).resolves.toBe(`detach\n${mountDir}\n-quiet\n`)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('keeps apply and recovery free of privilege-escalation fallbacks', () => {
    for (const source of [applyScript, restoreScript]) {
      expect(source).not.toMatch(/\b(?:sudo|osascript)\b/)
    }
  })
})
