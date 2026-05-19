import type { DivisionBoxConfig } from '@talex-touch/utils'

export const DIVISION_BOX_HEADER_HEIGHT = 64

export function resolveDivisionBoxHeaderHeight(config: Pick<DivisionBoxConfig, 'header'>): number {
  return config.header?.show === false ? 0 : DIVISION_BOX_HEADER_HEIGHT
}
