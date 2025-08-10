import { exec } from 'child_process'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'

const ICON_CACHE_DIR = path.join(os.tmpdir(), 'talex-touch-app-icons')

interface MacApp {
  _name: string
  lastModified: string
  path: string
  runtime_environment: string
  signed_by: string[]
  version: string
  obtained_from: string
}

async function convertIcnsToPng(icnsPath: string, pngPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = `sips -s format png "${icnsPath}" --out "${pngPath}" --resampleHeightWidth 64 64`
    exec(command, (error) => {
      if (error) {
        return reject(new Error(`sips command failed for ${icnsPath}: ${error.message}`))
      }
      resolve(pngPath)
    })
  })
}

async function getAppIcon(app: MacApp): Promise<string | null> {
  const safeName = app._name.replace(/[/\\?%*:|"<>]/g, '-')
  const cachedIconPath = path.join(ICON_CACHE_DIR, `${safeName}.png`)
  const noneMarkerPath = path.join(ICON_CACHE_DIR, `${safeName}.none`)

  try {
    // 1. Check for cached PNG
    if (await fs.stat(cachedIconPath).catch(() => false)) {
      const buffer = await fs.readFile(cachedIconPath)
      return buffer.toString('base64')
    }

    // 2. Check for "none" marker
    if (await fs.stat(noneMarkerPath).catch(() => false)) {
      return null
    }

    // 3. Find .icns file
    const plistPath = path.join(app.path, 'Contents', 'Info.plist')
    const resourcesPath = path.join(app.path, 'Contents', 'Resources')
    let icnsFile: string | undefined

    try {
      const plistContent = await fs.readFile(plistPath, 'utf-8')
      const iconNameMatch = plistContent.match(/<key>CFBundleIconFile<\/key>\s*<string>(.*?)<\/string>/)
      if (iconNameMatch?.[1]) {
        let iconFile = iconNameMatch[1]
        if (!iconFile.endsWith('.icns')) {
          iconFile += '.icns'
        }
        const potentialPath = path.join(resourcesPath, iconFile)
        if (await fs.stat(potentialPath).catch(() => false)) {
          icnsFile = potentialPath
        }
      }
    } catch {
      // Plist might not exist or be readable, continue to scan directory
    }

    if (!icnsFile) {
        const files = await fs.readdir(resourcesPath).catch(() => [])
        const found = files.find(f => f.endsWith('.icns'))
        if(found) {
            icnsFile = path.join(resourcesPath, found)
        }
    }

    if (!icnsFile) {
      await fs.writeFile(noneMarkerPath, '')
      return null
    }

    // 4. Convert .icns to .png
    await convertIcnsToPng(icnsFile, cachedIconPath)
    const buffer = await fs.readFile(cachedIconPath)
    return buffer.toString('base64')

  } catch (error) {
    console.warn(`[Darwin] Failed to get icon for ${app._name}:`, error)
    await fs.writeFile(noneMarkerPath, '').catch(() => {});
    return null
  }
}


async function getApplications(): Promise<
  {
    name: string
    path: string
    icon: string
    bundleId: string
    uniqueId: string
    lastModified: Date
  }[]
> {
  await fs.mkdir(ICON_CACHE_DIR, { recursive: true })

  return new Promise((resolve, reject) => {
    exec(
      'system_profiler SPApplicationsDataType -json',
      { maxBuffer: 1024 * 1024 * 20 },
      async (error, stdout) => {
        if (error) {
          return reject(new Error(`system_profiler command failed: ${error.message}`))
        }

        try {
          const data = JSON.parse(stdout)
          const apps = data.SPApplicationsDataType as MacApp[]

          if (!apps || !Array.isArray(apps)) {
            return reject(
              new Error('Unexpected output from system_profiler: SPApplicationsDataType is not an array.')
            )
          }

          const appPromises = apps
            .filter(
              (app) =>
                app.path &&
                (app.path.startsWith('/Applications/') || app.path.startsWith('/System/Applications/'))
            )
            .map(async (app) => {
              const icon = await getAppIcon(app)
              const bundleId = app.signed_by?.[0]
              return {
                name: app._name,
                path: app.path,
                icon: icon ? `data:image/png;base64,${icon}` : '',
                bundleId: bundleId,
                uniqueId: bundleId || app.path,
                lastModified: new Date(app.lastModified)
              }
            })

          const settledApps = await Promise.allSettled(appPromises)

          const successfulApps = settledApps
            .filter((result) => result.status === 'fulfilled' && result.value)
            .map((result) => (result as PromiseFulfilledResult<any>).value)

          resolve(successfulApps)
        } catch (parseError) {
          reject(new Error(`Failed to parse system_profiler JSON output: ${parseError}`))
        }
      }
    )
  })
}

export default getApplications;