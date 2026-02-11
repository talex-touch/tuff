import type { ITuffIcon } from '@talex-touch/utils'

export type IconValue = ITuffIcon | string | null | undefined

export function toIcon(icon?: IconValue): ITuffIcon | null {
  if (!icon) return null
  if (typeof icon === 'string') {
    return { type: 'class', value: icon }
  }
  return icon
}
