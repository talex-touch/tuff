import type {
  ConversationStreamItemKey,
  ConversationStreamKey,
  ConversationStreamLoadResult,
  ConversationStreamProps,
} from './src/types'
import { withInstall } from '../../../utils/withInstall'
import TxConversationStream from './src/TxConversationStream.vue'

const ConversationStream = withInstall(TxConversationStream)

export { ConversationStream, TxConversationStream }
export { createPositionCache } from './src/use-position-cache'
export type { PositionCache } from './src/use-position-cache'
export { useStickToBottom } from './src/use-stick-to-bottom'
export type { StickToBottomOptions } from './src/use-stick-to-bottom'
export type {
  ConversationStreamItemKey,
  ConversationStreamKey,
  ConversationStreamLoadResult,
  ConversationStreamProps,
}

/**
 * Hand-written because `TxConversationStream` is a generic SFC
 * (`<script setup generic="T">`): vue-tsc types those as functions, so
 * `InstanceType<typeof TxConversationStream>` fails with TS2344 and consumers
 * need a nameable ref surface. Drift against the real `defineExpose` payload
 * is a compile error via `instance-drift.contract.ts`.
 *
 * `atBottom` is a `boolean`, not a ref: the public instance proxy unwraps
 * exposed refs, and vue-tsc types the expose surface post-unwrap. Reads
 * through a template ref still track reactivity.
 */
export interface TxConversationStreamInstance {
  scrollToBottom: (behavior?: ScrollBehavior) => void
  scrollToIndex: (index: number) => void
  atBottom: boolean
}

export default ConversationStream
