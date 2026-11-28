export interface LocalAiCliSurfacePort {
  requestFeatureRefresh(reason: 'local-ai-cli'): void
  showLocalAi(draftText?: string): Promise<void>
  restoreLocalAi(): Promise<void>
  hideForPasteBack(): void
}

export interface LocalAiCliPortsRegistry {
  surface: LocalAiCliSurfacePort
}

const DEFAULT_LOCAL_AI_CLI_SURFACE_PORT: LocalAiCliSurfacePort = Object.freeze({
  requestFeatureRefresh: () => undefined,
  showLocalAi: async () => undefined,
  restoreLocalAi: async () => undefined,
  hideForPasteBack: () => undefined
})

let surfacePort: LocalAiCliSurfacePort | null = null

export function registerLocalAiCliPorts(ports: Partial<LocalAiCliPortsRegistry>): void {
  if (ports.surface !== undefined) {
    surfacePort = ports.surface
  }
}

export function resetLocalAiCliPorts(): void {
  surfacePort = null
}

export function getLocalAiCliSurfacePort(): LocalAiCliSurfacePort {
  return surfacePort ?? DEFAULT_LOCAL_AI_CLI_SURFACE_PORT
}
