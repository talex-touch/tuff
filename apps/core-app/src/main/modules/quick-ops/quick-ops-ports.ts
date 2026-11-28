import type { FlowSession, FlowTarget } from '@talex-touch/utils'

export type QuickOpsFlowTargetWording = () => Pick<FlowTarget, 'name' | 'description'> & {
  pluginName?: string
}

export interface QuickOpsFlowTargetRegistrationOptions {
  pluginName?: string
  pluginIcon?: string
  isEnabled?: boolean
  hasFlowHandler?: boolean
  isNativeShare?: boolean
  wording?: QuickOpsFlowTargetWording
}

export interface QuickOpsFlowBusPort {
  registerTarget(
    pluginId: string,
    target: FlowTarget,
    options?: QuickOpsFlowTargetRegistrationOptions
  ): boolean
  unregisterTarget(fullTargetId: string): boolean
  registerDeliveryHandler(
    pluginId: string,
    handler: (session: FlowSession) => Promise<void>
  ): () => void
  acknowledge(sessionId: string, ackPayload?: unknown): boolean
}

let activeFlowBusPort: QuickOpsFlowBusPort | null = null

export function getQuickOpsFlowBusPort(): QuickOpsFlowBusPort | null {
  return activeFlowBusPort
}

export function registerQuickOpsFlowBusPort(port: QuickOpsFlowBusPort | null): () => void {
  const previous = activeFlowBusPort
  activeFlowBusPort = port
  return () => {
    if (activeFlowBusPort === port) {
      activeFlowBusPort = previous
    }
  }
}

export function resetQuickOpsPorts(): void {
  activeFlowBusPort = null
}
