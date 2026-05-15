import type { TuffTool, TuffToolInvocationResult } from '../tools/types'
import { toCapabilityManifest } from '../tools/tool-kit'

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

type StoredCapabilityManifest = CapabilityManifest<any, any>

export class CapabilityRegistry {
  private readonly capabilities = new Map<string, StoredCapabilityManifest>()

  register<I = unknown, O = unknown>(manifest: CapabilityManifest<I, O>): CapabilityManifest<I, O> {
    this.capabilities.set(manifest.id, manifest as StoredCapabilityManifest)
    return manifest
  }

  registerTool<I, O>(
    tool: TuffTool<I, O>,
  ): CapabilityManifest<I, TuffToolInvocationResult<O>> {
    const manifest = toCapabilityManifest(tool)
    this.register(manifest)
    return manifest
  }

  get(id: string): CapabilityManifest | null {
    return this.capabilities.get(id) ?? null
  }

  list(): CapabilityManifest[] {
    return Array.from(this.capabilities.values())
  }
}
