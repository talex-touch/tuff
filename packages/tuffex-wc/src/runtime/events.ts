const CAMEL_TO_KEBAB_RE = /([a-z0-9])([A-Z])/g

/**
 * Convert Vue event names (e.g. `update:modelValue`) to canonical DOM kebab-case (`update:model-value`).
 */
export function toDomEventName(eventName: string): string {
  return eventName.replace(CAMEL_TO_KEBAB_RE, '$1-$2').toLowerCase()
}

/**
 * Convert a Vue emit name into a Vue listener prop key (`'update:modelValue'` -> `'onUpdate:modelValue'`).
 */
export function toVueListenerProp(eventName: string): string {
  if (!eventName)
    return 'on'
  return `on${eventName[0]!.toUpperCase()}${eventName.slice(1)}`
}

export interface HostEventOptions {
  bubbles?: boolean
  composed?: boolean
  cancelable?: boolean
}

/**
 * Dispatch a bubbling, Shadow-DOM-crossing CustomEvent on a custom element host.
 */
export function dispatchHostEvent<T = unknown>(
  host: HTMLElement | null | undefined,
  eventName: string,
  detail?: T,
  options: HostEventOptions = {},
): boolean {
  if (!host || typeof CustomEvent === 'undefined')
    return false

  const domName = toDomEventName(eventName)
  const event = new CustomEvent<T>(domName, {
    detail: detail as T,
    bubbles: options.bubbles ?? true,
    composed: options.composed ?? true,
    cancelable: options.cancelable ?? false,
  })
  return host.dispatchEvent(event)
}
