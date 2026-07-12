import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { withOSAdapter } from '@talex-touch/utils/electron/env-tool'

const execFileAsync = promisify(execFile)

export interface WallpaperAdapter {
  getDesktopWallpaperPath(): Promise<string | null>
}

async function execFileOutput(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(command, args)
    return typeof stdout === 'string' ? stdout.trim() : null
  } catch {
    return null
  }
}

class DesktopWallpaperAdapter implements WallpaperAdapter {
  async getDesktopWallpaperPath(): Promise<string | null> {
    const resolver = withOSAdapter<void, Promise<string | null>>({
      win32: () => this.getWindowsWallpaperPath(),
      darwin: () => this.getMacOSWallpaperPath(),
      linux: () => this.getLinuxWallpaperPath()
    })

    return resolver ? await resolver : null
  }

  private async getWindowsWallpaperPath(): Promise<string | null> {
    const output = await execFileOutput('reg', [
      'query',
      'HKCU\\Control Panel\\Desktop',
      '/v',
      'WallPaper'
    ])
    if (!output) return null

    const line = output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.toLowerCase().startsWith('wallpaper'))
    if (!line) return null

    const parts = line.split(/\s{2,}/)
    return parts[parts.length - 1] || null
  }

  private async getMacOSWallpaperPath(): Promise<string | null> {
    const output = await execFileOutput('osascript', [
      '-e',
      'tell application "System Events" to get POSIX path of (get picture of item 1 of desktops)'
    ])
    return output || null
  }

  private async getLinuxWallpaperPath(): Promise<string | null> {
    const output = await execFileOutput('gsettings', [
      'get',
      'org.gnome.desktop.background',
      'picture-uri'
    ])
    if (!output) return null

    const cleaned = output.replace(/^'+|'+$/g, '')
    if (!cleaned || cleaned === 'none') return null
    if (cleaned.startsWith('file://')) {
      return decodeURI(cleaned.replace('file://', ''))
    }
    return cleaned
  }
}

export const wallpaperAdapter: WallpaperAdapter = new DesktopWallpaperAdapter()
