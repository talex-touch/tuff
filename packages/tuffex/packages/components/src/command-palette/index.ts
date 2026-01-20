import type { CommandPaletteEmits, CommandPaletteItem, CommandPaletteProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxCommandPalette from './src/TxCommandPalette.vue'

const CommandPalette = withInstall(TxCommandPalette)

export { CommandPalette, TxCommandPalette }
export type { CommandPaletteEmits, CommandPaletteItem, CommandPaletteProps }
export type TxCommandPaletteInstance = InstanceType<typeof TxCommandPalette>

export default CommandPalette
