import { execFile } from 'node:child_process'
import process from 'node:process'
import { promisify } from 'node:util'
import { ensureXdotoolAvailable } from './linux-desktop-tools'

const execFileAsync = promisify(execFile)

export type DesktopShortcut = 'copy' | 'paste'

const MAC_SHORTCUT_KEYS: Record<DesktopShortcut, string> = {
  copy: 'c',
  paste: 'v'
}

const WIN_SHORTCUT_KEYS: Record<DesktopShortcut, string> = {
  copy: 'c',
  paste: 'v'
}

const LINUX_SHORTCUT_KEYS: Record<DesktopShortcut, string> = {
  copy: 'ctrl+c',
  paste: 'ctrl+v'
}

function createWindowsSendKeysScript(shortcut: DesktopShortcut): string {
  return `$wshell = New-Object -ComObject WScript.Shell; Start-Sleep -Milliseconds 30; $wshell.SendKeys('^${WIN_SHORTCUT_KEYS[shortcut]}')`
}

export async function sendPlatformShortcut(shortcut: DesktopShortcut): Promise<void> {
  if (process.platform === 'darwin') {
    await execFileAsync('osascript', [
      '-e',
      `tell application "System Events" to keystroke "${MAC_SHORTCUT_KEYS[shortcut]}" using {command down}`
    ])
    return
  }

  if (process.platform === 'win32') {
    await execFileAsync('powershell', [
      '-NoLogo',
      '-NonInteractive',
      '-Command',
      createWindowsSendKeysScript(shortcut)
    ])
    return
  }

  if (process.platform === 'linux') {
    await ensureXdotoolAvailable()
    await execFileAsync('xdotool', ['key', '--clearmodifiers', LINUX_SHORTCUT_KEYS[shortcut]])
    return
  }

  throw new Error(`Unsupported platform: ${process.platform}`)
}
