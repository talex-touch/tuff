import type { ITuffIcon } from '@talex-touch/utils'

export function shouldRenderCoreBoxIconColorful(
  icon: ITuffIcon | string | undefined | null
): boolean {
  if (!icon || typeof icon === 'string') return false
  return icon.colorful === true
}
