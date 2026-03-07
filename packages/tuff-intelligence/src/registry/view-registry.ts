import type { ViewManifest } from '../adapters/view'

export class ViewRegistry {
  private readonly views = new Map<string, ViewManifest>()

  register(manifest: ViewManifest) {
    this.views.set(manifest.type, manifest)
  }

  get(type: string): ViewManifest | null {
    return this.views.get(type) ?? null
  }

  list(): ViewManifest[] {
    return Array.from(this.views.values())
  }
}
