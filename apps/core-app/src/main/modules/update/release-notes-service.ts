import type { BundledReleaseNotesCatalog, BundledReleaseNotesState } from '@talex-touch/utils'
import { promises as fs } from 'node:fs'
import { normalizeBundledReleaseNotesCatalog } from '@talex-touch/utils'

interface ReleaseNotesStateRepository {
  getLastAcknowledgedVersion: () => Promise<string | null>
  acknowledge: (version: string) => Promise<void>
}

interface ReleaseNotesServiceDeps {
  currentVersion: string
  catalogPaths: string[]
  repository: ReleaseNotesStateRepository
}

export class ReleaseNotesService {
  private catalogPromise: Promise<BundledReleaseNotesCatalog> | null = null

  constructor(private readonly deps: ReleaseNotesServiceDeps) {}

  async getBundledState(): Promise<BundledReleaseNotesState> {
    const [catalog, lastAcknowledgedVersion] = await Promise.all([
      this.loadCatalog(),
      this.deps.repository.getLastAcknowledgedVersion()
    ])
    return { catalog, lastAcknowledgedVersion }
  }

  async acknowledge(version: string): Promise<void> {
    if (version.trim() !== this.deps.currentVersion) {
      throw new Error('Release notes can only acknowledge the current app version')
    }
    await this.deps.repository.acknowledge(this.deps.currentVersion)
  }

  private async loadCatalog(): Promise<BundledReleaseNotesCatalog> {
    if (!this.catalogPromise) {
      this.catalogPromise = this.readCatalog()
    }
    return this.catalogPromise
  }

  private async readCatalog(): Promise<BundledReleaseNotesCatalog> {
    for (const candidate of this.deps.catalogPaths) {
      try {
        const parsed: unknown = JSON.parse(await fs.readFile(candidate, 'utf8'))
        const catalog = normalizeBundledReleaseNotesCatalog(parsed)
        if (!catalog) throw new Error(`Invalid release notes catalog: ${candidate}`)
        if (catalog.generatedForVersion !== this.deps.currentVersion) {
          throw new Error(
            `Release notes catalog version mismatch: expected ${this.deps.currentVersion}, received ${catalog.generatedForVersion}`
          )
        }
        return catalog
      } catch (error) {
        if (isMissingFile(error)) continue
        throw error
      }
    }
    throw new Error('Bundled release notes catalog is missing')
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isMissingFile(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT'
}
