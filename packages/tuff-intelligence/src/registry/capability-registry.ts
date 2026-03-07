export interface CapabilityManifest<I = unknown, O = unknown> {
  id: string
  description: string
  invoke: (input: I, context: Record<string, unknown>) => Promise<O>
  enabled?: boolean
  annotations?: {
    readOnly?: boolean
    destructive?: boolean
    idempotent?: boolean
    streamable?: boolean
    requiresApproval?: boolean
  }
}

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, CapabilityManifest>()

  register(manifest: CapabilityManifest) {
    this.capabilities.set(manifest.id, manifest)
  }

  get(id: string): CapabilityManifest | null {
    return this.capabilities.get(id) ?? null
  }

  list(): CapabilityManifest[] {
    return Array.from(this.capabilities.values())
  }
}
