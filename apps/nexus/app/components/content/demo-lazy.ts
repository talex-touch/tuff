export interface DemoActivationRequest {
  demo?: string
  isActive: boolean
}

/**
 * Demos run on their own once they approach the viewport, so any activation
 * request is honoured as long as there is a demo that is not running yet.
 */
export function shouldActivateDemo(request: DemoActivationRequest) {
  return Boolean(request.demo) && !request.isActive
}

/** Mount a demo slightly before it scrolls into view so it is already running when seen. */
export const DEMO_LAZY_ROOT_MARGIN = '240px 0px'
