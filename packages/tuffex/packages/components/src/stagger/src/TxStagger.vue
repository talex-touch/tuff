<script lang="ts">
import type { StaggerProps } from './types'
import type { CSSProperties, VNode } from 'vue'
import { Comment, TransitionGroup, cloneVNode, computed, defineComponent, h, onMounted, ref } from 'vue'

export default defineComponent({
  name: 'TxStagger',
  props: {
    tag: { type: String, default: 'div' },
    appear: { type: Boolean, default: true },
    name: { type: String, default: 'tx-stagger' },
    duration: { type: Number, default: 180 },
    delayStep: { type: Number, default: 24 },
    delayBase: { type: Number, default: 0 },
    easing: { type: String, default: 'ease-out' },
  },
  setup(props: StaggerProps, { slots }) {
    const isMounted = ref(false)

    const rootStyle = computed(() => {
      return {
        '--tx-stagger-duration': `${props.duration}ms`,
        '--tx-stagger-delay-step': `${props.delayStep}ms`,
        '--tx-stagger-delay-base': `${props.delayBase}ms`,
        '--tx-stagger-easing': props.easing,
      } as CSSProperties
    })

    const normalizedChildren = computed<VNode[]>(() => {
      const vnodes = slots.default?.({}) ?? []
      return vnodes.filter((vnode: VNode) => vnode.type !== Comment)
    })

    onMounted(() => {
      isMounted.value = true
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
          name: isMounted.value ? props.name : undefined,
          tag: props.tag,
          appear: isMounted.value ? props.appear : undefined,
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
