import type { ScannedAppInfo } from './app-types'
import chalk from 'chalk'
import { appScanner } from './app-scanner'
import { LogStyle } from './app-utils'

export interface AppProviderSourceScannerOptions {
  resolveScannedAppKey: (app: Pick<ScannedAppInfo, 'bundleId' | 'stableId' | 'path'>) => string
  isManagedEntry: (extensions: Record<string, string | null> | undefined) => boolean
  logApp: (message: string, style: (message: string) => string) => void
  getKnownMissingIconApps: () => Promise<Set<string>>
  saveKnownMissingIconApps: (knownMissingIconApps: Set<string>) => Promise<void>
}

export type SourceScannerDbApp = {
  extensions: Record<string, string | null>
}

export class AppProviderSourceScanner {
  constructor(private readonly options: AppProviderSourceScannerOptions) {}

  public async loadScannedApps(options?: { forceRefresh?: boolean }): Promise<ScannedAppInfo[]> {
    return await appScanner.getApps({ forceRefresh: options?.forceRefresh === true })
  }

  public buildScannedAppsMap(scannedApps: ScannedAppInfo[]): Map<string, ScannedAppInfo> {
    return new Map(
      scannedApps
        .map((app) => [this.options.resolveScannedAppKey(app), app] as const)
        .filter(([key]) => Boolean(key))
    )
  }

  public partitionDbApps<T extends SourceScannerDbApp>(
    apps: T[]
  ): {
    scannedApps: T[]
    managedEntries: T[]
  } {
    const scannedApps: T[] = []
    const managedEntries: T[] = []

    for (const app of apps) {
      if (this.options.isManagedEntry(app.extensions)) {
        managedEntries.push(app)
      } else {
        scannedApps.push(app)
      }
    }

    return { scannedApps, managedEntries }
  }

  public async recordMissingIconApps(scannedApps: ScannedAppInfo[]): Promise<void> {
    const knownMissingIconApps = await this.options.getKnownMissingIconApps()
    let missingIconConfigUpdated = false

    for (const app of scannedApps) {
      if (app.icon) continue

      const uniqueId = this.options.resolveScannedAppKey(app)
      if (!uniqueId || knownMissingIconApps.has(uniqueId)) continue

      this.options.logApp(`Icon not found for app: ${chalk.yellow(app.name)}`, LogStyle.warning)
      knownMissingIconApps.add(uniqueId)
      missingIconConfigUpdated = true
    }

    if (missingIconConfigUpdated) {
      await this.options.saveKnownMissingIconApps(knownMissingIconApps)
    }
  }
}
