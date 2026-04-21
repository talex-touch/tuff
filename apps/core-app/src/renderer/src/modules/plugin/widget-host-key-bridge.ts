import type { ForwardedKeyEvent } from '~/modules/box/adapter/transport/key-transport'
import { computed, shallowRef, toValue, type MaybeRefOrGetter } from 'vue'

export interface WidgetHostKeyEventPayload {
  seq: number
  event: ForwardedKeyEvent
}

const widgetHostKeyEvents = shallowRef<Record<string, WidgetHostKeyEventPayload>>({})

let widgetHostKeySeq = 0

export function publishWidgetHostKeyEvent(itemId: string, event: ForwardedKeyEvent): void {
  if (!itemId) {
    return
  }

  widgetHostKeySeq += 1
  widgetHostKeyEvents.value = {
    ...widgetHostKeyEvents.value,
    [itemId]: {
      seq: widgetHostKeySeq,
      event
    }
  }
}

export function useWidgetHostKeyEvent(itemIdSource: MaybeRefOrGetter<string | null | undefined>) {
  return computed<WidgetHostKeyEventPayload | null>(() => {
    const itemId = toValue(itemIdSource)
    if (!itemId) {
      return null
    }
    return widgetHostKeyEvents.value[itemId] ?? null
  })
}
