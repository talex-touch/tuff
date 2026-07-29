import { withInstall } from '../../../utils/withInstall'
import TxTimeline from './src/TxTimeline.vue'
import TxTimelineItem from './src/TxTimelineItem.vue'

// TxTimeline/TxTimelineItem type their props with local (unexported) interfaces,
// so a freshly inferred `const Timeline = withInstall(...)` cannot be named in the
// emitted .d.ts (TS4023 -> the barrel's index.d.ts silently stops emitting).
// Mutate-install in place and re-export the bindings instead.
withInstall(TxTimeline)
withInstall(TxTimelineItem)

export { TxTimeline, TxTimelineItem }
export { TxTimeline as Timeline, TxTimelineItem as TimelineItem }
export type { TimelineContext, TimelineItemColor, TimelineItemProps, TimelineLayout, TimelineProps } from './src/types'
export type TxTimelineInstance = InstanceType<typeof TxTimeline>
export type TxTimelineItemInstance = InstanceType<typeof TxTimelineItem>

export default TxTimeline
