import { withInstall } from '../../../utils/withInstall'
import TxTerminal from './src/TxTerminal.vue'

/**
 * TxTerminal — ANSI/Unicode terminal display without process or host privileges.
 *
 * @example
 * ```ts
 * import { TxTerminal } from '@talex-touch/tuffex/terminal'
 * // <TxTerminal read-only :lines="logs" />
 * // <TxTerminal @data="session.write" @resize="resizeSession" />
 * ```
 *
 * @public
 */
const Terminal = withInstall(TxTerminal)

export { Terminal, TxTerminal }
export { TERMINAL_DEFAULT_LABELS } from './src/types'
export type {
  TerminalData,
  TerminalEmits,
  TerminalInstance,
  TerminalLabels,
  TerminalProps,
  TerminalSize,
} from './src/types'
export type TxTerminalInstance = InstanceType<typeof TxTerminal>
export default Terminal
