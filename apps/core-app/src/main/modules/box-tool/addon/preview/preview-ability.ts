import type { TuffQuery } from '../../search-engine/types'
import type { PreviewAbilityResult } from '@talex-touch/utils'

export interface PreviewAbilityContext {
  query: TuffQuery
  signal: AbortSignal
}

export interface PreviewAbility {
  readonly id: string
  readonly priority: number
  canHandle(query: TuffQuery): boolean | Promise<boolean>
  execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null>
}

export abstract class BasePreviewAbility implements PreviewAbility {
  abstract readonly id: string
  abstract readonly priority: number

  canHandle(query: TuffQuery): boolean | Promise<boolean> {
    return !!query.text?.trim()
  }

  abstract execute(context: PreviewAbilityContext): Promise<PreviewAbilityResult | null>

  protected getNormalizedQuery(query: TuffQuery): string {
    return query.text?.trim() ?? ''
  }

  protected throwIfAborted(signal: AbortSignal): void {
    if (signal.aborted) {
      throw new DOMException('Preview ability aborted', 'AbortError')
    }
  }
}
