import type { ITuffIcon } from '@talex-touch/utils'

const fallbackCoreBoxIcon: ITuffIcon = {
  type: 'class',
  value: 'i-ri-puzzle-line',
  status: 'normal'
}
const defaultCoreBoxIconColor = 'var(--tx-text-color-primary, #e5e7eb)'

function isClassIconString(value: string): boolean {
  return value.startsWith('i-') || value.startsWith('ri-') || value.startsWith('ri:')
}

function normalizeClassIconValue(value: string): string {
  if (value.startsWith('ri:')) return `i-ri-${value.slice(3)}`
  if (value.startsWith('ri-')) return `i-${value}`
  return value
}

function resolveStringIconType(value: string): ITuffIcon['type'] {
  return isClassIconString(value) ? 'class' : 'url'
}

export function normalizeCoreBoxIcon(icon: ITuffIcon | string | undefined | null): ITuffIcon {
  if (!icon) return { ...fallbackCoreBoxIcon }

  if (typeof icon === 'string') {
    const rawValue = icon.trim()
    const type = resolveStringIconType(rawValue)
    return {
      type,
      value: type === 'class' ? normalizeClassIconValue(rawValue) : rawValue,
      status: 'normal'
    }
  }

  if (!('value' in icon) || !icon.value?.length) {
    return { ...fallbackCoreBoxIcon }
  }

  return {
    ...icon,
    type: icon.type || 'url',
    value: icon.value,
    status: icon.status || 'normal'
  }
}

export function shouldRenderCoreBoxIconColorful(
  icon: ITuffIcon | string | undefined | null
): boolean {
  if (!icon || typeof icon === 'string') return false
  return icon.colorful === true
}

export function resolveCoreBoxIconColor(icon: ITuffIcon | string | undefined | null): string {
  if (!icon || typeof icon === 'string') return defaultCoreBoxIconColor
  return icon.color || defaultCoreBoxIconColor
}
