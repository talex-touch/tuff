import type {
  NexusSceneRunRequest,
  NexusSceneRunResult
} from '../../shared/cloud-port-types'

export interface OmniPanelNexusPort {
  runNexusScene(sceneId: string, request: NexusSceneRunRequest): Promise<NexusSceneRunResult | null>
  extractTranslatedTextFromSceneRun(run: NexusSceneRunResult | null): string | null
}

export interface OmniPanelPortsRegistry {
  nexus: OmniPanelNexusPort
}

const DEFAULT_OMNI_PANEL_NEXUS_PORT: OmniPanelNexusPort = Object.freeze({
  runNexusScene: async () => null,
  extractTranslatedTextFromSceneRun: () => null
})

let nexusPort: OmniPanelNexusPort | null = null

export function registerOmniPanelPorts(ports: Partial<OmniPanelPortsRegistry>): void {
  if (ports.nexus !== undefined) {
    nexusPort = ports.nexus
  }
}

export function resetOmniPanelPorts(): void {
  nexusPort = null
}

export function getOmniPanelNexusPort(): OmniPanelNexusPort {
  return nexusPort ?? DEFAULT_OMNI_PANEL_NEXUS_PORT
}
