<script lang="ts">
import type { CSSProperties, PropType, VNode } from 'vue'
import type { StaggerEasing, StaggerProps } from './types'
import { cloneVNode, Comment, computed, defineComponent, Fragment, h, TransitionGroup } from 'vue'

// Flatten template `v-for` output: a `v-for` compiles to a single Fragment vnode
// whose real element vnodes live in `children`. Without descending into it the
// stagger index lands on the Fragment (a no-op) instead of the elements.
function flattenFragments(vnodes: VNode[]): VNode[] {
  const result: VNode[] = []
  for (const vnode of vnodes) {
    if (vnode.type === Fragment && Array.isArray(vnode.children))
      result.push(...flattenFragments(vnode.children as VNode[]))
    else if (vnode.type !== Comment)
      result.push(vnode)
  }
  return result
}

export default defineComponent({
  name: 'TxStagger',
  props: {
    tag: { type: String, default: 'div' },
    appear: { type: Boolean, default: true },
    name: { type: String, default: 'tx-stagger' },
    duration: { type: Number, default: 180 },
    delayStep: { type: Number, default: 24 },
    delayBase: { type: Number, default: 0 },
    easing: { type: String as PropType<StaggerEasing>, default: 'ease-out' },
  },
  setup(props: StaggerProps, { slots }) {
    const rootStyle = computed(() => {
      return {
        '--tx-stagger-duration': `${props.duration}ms`,
        '--tx-stagger-delay-step': `${props.delayStep}ms`,
        '--tx-stagger-delay-base': `${props.delayBase}ms`,
        '--tx-stagger-easing': props.easing,
      } as CSSProperties
    })

    const normalizedChildren = computed<VNode[]>(() => {
      return flattenFragments(slots.default?.({}) ?? [])
    })

    return () => {
      const children = normalizedChildren.value.map((child, index) => {
        return cloneVNode(child, {
          style: [
            child.props?.style,
            { '--tx-stagger-index': index },
          ],
        })
      })

      return h(
        TransitionGroup,
        {
          // Pass `name`/`appear` on the first render too: TransitionGroup only runs
          // the appear transition on its initial mount and consumes these as props
          // (not fallthrough attrs), so deferring them permanently skipped appear.
          name: props.name,
          tag: props.tag,
          appear: props.appear,
          class: 'tx-stagger',
          style: rootStyle.value,
        },
        {
          default: () => children,
        },
      )
    }
  },
})
</script>

<style lang="scss">
.tx-stagger {
  --tx-stagger-index: 0;
}

.tx-stagger-enter-active,
.tx-stagger-leave-active {
  transition:
    opacity var(--tx-stagger-duration, 180ms) var(--tx-stagger-easing, ease-out),
    transform var(--tx-stagger-duration, 180ms) var(--tx-stagger-easing, ease-out);
  transition-delay: calc(var(--tx-stagger-delay-base, 0ms) + var(--tx-stagger-index, 0) * var(--tx-stagger-delay-step, 24ms));
}

.tx-stagger-enter-from,
.tx-stagger-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
