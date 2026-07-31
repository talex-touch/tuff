import { withInstall } from '../../../utils/withInstall'
import TxRating from './src/TxRating.vue'

// TxRating.vue types its props with a local (unexported) `interface Props`, so a
// freshly inferred `const Rating = withInstall(...)` cannot have its type named in
// the emitted .d.ts (TS4023 -> the barrel's index.d.ts silently stops emitting).
// Mutate-install in place and re-export the binding instead: `Rating` stays a
// nameable alias and still carries the runtime `.install`.
withInstall(TxRating)

export { TxRating }
export { TxRating as Rating }
export type { RatingEmits, RatingIcon, RatingProps } from './src/types'
export type TxRatingInstance = InstanceType<typeof TxRating>

export default TxRating
