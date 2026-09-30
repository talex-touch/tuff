import type { CodeStreamProps } from './src/types'
import { withInstall } from '../../../utils/withInstall'
import component from './src/TxCodeStream.vue'

const TxCodeStream = withInstall(component)

// The streaming family's name for the same component (StreamText, StreamCode,
// StreamMarkdown, StreamElement): one object, reached through two keys.
export { TxCodeStream, TxCodeStream as TxStreamCode }
export type { CodeStreamProps }
export type TxCodeStreamInstance = InstanceType<typeof component>

export default TxCodeStream
