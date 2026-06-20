export type DemoActivationReason = 'manual' | 'visibility'

export interface DemoActivationRequest {
  demo?: string
  isActive: boolean
  reason: DemoActivationReason
}

export function shouldActivateDemo(request: DemoActivationRequest) {
  return Boolean(request.demo) && !request.isActive && request.reason === 'manual'
}
