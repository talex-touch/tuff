// Ported from torph/src/lib/text-morph/controller.ts (https://github.com/lochie/torph).
// MIT License © lochie. Kept intentionally close to upstream so its fixes stay
// diffable; deviations are limited to tuffex lint style and the renamed options.

import type { TextMorphEngineOptions } from './types'
import { TextMorphEngine } from './morph'

export type MorphControllerOptions = Omit<TextMorphEngineOptions, 'element'>

export class MorphController {
  private instance: TextMorphEngine | null = null
  private lastText: string | number = ''
  private lastCursorIndex?: number
  private configKey = ''

  attach(element: HTMLElement, options: MorphControllerOptions) {
    this.instance?.destroy()
    this.instance = new TextMorphEngine({ element, ...options })
    this.configKey = MorphController.serializeConfig(options)

    if (this.lastText !== '')
      this.instance.update(this.lastText, this.lastCursorIndex)
  }

  update(text: string | number, cursorIndex?: number) {
    this.lastText = text
    this.lastCursorIndex = cursorIndex
    this.instance?.update(text, cursorIndex)
  }

  needsRecreate(options: MorphControllerOptions): boolean {
    return MorphController.serializeConfig(options) !== this.configKey
  }

  destroy() {
    this.instance?.destroy()
    this.instance = null
  }

  static serializeConfig(options: MorphControllerOptions): string {
    return JSON.stringify({
      durationMs: options.durationMs,
      easing: options.easing,
      spring: options.spring,
      locale: options.locale,
      scale: options.scale,
      numbers: options.numbers,
      decimals: options.decimals,
      debug: options.debug,
      disabled: options.disabled,
      respectReducedMotion: options.respectReducedMotion,
    })
  }
}
