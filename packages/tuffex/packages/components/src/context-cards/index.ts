import { withInstall } from '../../../utils/withInstall'
import TxContextCards from './src/TxContextCards.vue'
import TxContextChunk from './src/TxContextChunk.vue'

/**
 * TxContextCards — retrieved knowledge chunks with their provenance.
 *
 * `TxContextChunk` renders a single card and is exported for hosts that lay out
 * their own list (a RAG debugging pane, an inline citation drawer).
 *
 * Only the parent gets an unprefixed alias: `ContextChunk` is the name of the
 * chunk *data* type, and a same-named component binding would shadow it for
 * anyone importing both from the package root.
 *
 * @example
 * ```ts
 * import { TxContextCards } from '@talex-touch/tuffex'
 *
 * // <TxContextCards :chunks="chunks" :total="32" @open="openSource" />
 * ```
 *
 * @public
 */
withInstall(TxContextCards)
withInstall(TxContextChunk)

export { TxContextCards, TxContextChunk }
export { TxContextCards as ContextCards }
export type {
  ContextCardsEmits,
  ContextCardsProps,
  ContextChunk,
  ContextChunkEmits,
  ContextChunkOpenPayload,
  ContextChunkProps,
  ContextChunkSource,
  ContextChunkTone,
} from './src/types'
export type TxContextCardsInstance = InstanceType<typeof TxContextCards>
export type TxContextChunkInstance = InstanceType<typeof TxContextChunk>

export default TxContextCards
