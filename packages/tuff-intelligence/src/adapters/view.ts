import type { ViewIntent } from '../protocol/decision'

export interface ViewManifest<Props = Record<string, unknown>> {
  type: string
  lifecycle: 'ephemeral' | 'persistent'
  description: string
  validateProps?: (props: unknown) => props is Props
}

export interface ViewRendererAdapter {
  id: string
  getAvailableViews(): ViewManifest[]
  render(intent: ViewIntent): Promise<void>
  patch(intent: ViewIntent): Promise<void>
  dispose(viewId: string): Promise<void>
}
