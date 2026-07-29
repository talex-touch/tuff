<script lang="ts">
import type { AvatarGroupProps } from './types'
import { cloneVNode, computed, defineComponent, h, isVNode } from 'vue'
import TxAvatar from './TxAvatar.vue'

export default defineComponent({
  name: 'TxAvatarGroup',
  props: {
    max: { type: Number, required: false },
    size: { type: [String, Number], required: false },
    overlap: { type: [Number, String], default: 8 },
  },
  setup(props: AvatarGroupProps, { slots }) {
    const overlapPx = computed(() => {
      return typeof props.overlap === 'number' ? `${props.overlap}px` : props.overlap
    })

    return () => {
      const nodes = (slots.default?.() ?? []).filter(n => isVNode(n))
      const maxVisible = typeof props.max === 'number' ? Math.max(0, props.max) : nodes.length
      const extraCount = typeof props.max === 'number' ? Math.max(0, nodes.length - maxVisible) : 0
      const visible = nodes.slice(0, maxVisible)

      // Scoped styles never reach slot content (the avatars belong to the parent's
      // scope), so the group ring must be injected inline alongside the layout offsets.
      // Only the border is injected: an inline border-radius would outrank TxAvatar's
      // own `shape` classes (square 8px / rounded 12px) and silently force every
      // grouped avatar circular. The border follows whatever radius the avatar sets.
      const ringStyle = {
        border: '2px solid var(--tx-avatar-group-border, #fff)',
      }

      const children = visible.map((vnode, index) => {
        const rawProps = (vnode as any).props ?? {}
        const className = rawProps.class
        const style = rawProps.style

        const layoutStyle = index === 0
          ? { zIndex: 1 }
          : { marginLeft: `calc(${overlapPx.value} * -1)`, zIndex: index + 1 }

        const injectedProps: Record<string, any> = {
          class: [className, 'tx-avatar-group__item'],
          style: [ringStyle, style, layoutStyle],
        }

        if (props.size && rawProps.size == null) {
          injectedProps.size = props.size
        }

        return cloneVNode(vnode as any, injectedProps)
      })

      if (extraCount > 0) {
        const index = children.length
        children.push(
          h(
            TxAvatar,
            {
              size: props.size,
              class: ['tx-avatar-group__item', 'tx-avatar-group__more'],
              style: [
                ringStyle,
                index === 0
                  ? { zIndex: 1 }
                  : { marginLeft: `calc(${overlapPx.value} * -1)`, zIndex: index + 1 },
              ],
            },
            {
              default: () => `+${extraCount}`,
            },
          ),
        )
      }

      return h(
        'div',
        {
          class: 'tx-avatar-group',
          style: {
            '--tx-avatar-group-overlap': overlapPx.value,
          },
        },
        children as any,
      )
    }
  },
})
</script>

<style scoped>
.tx-avatar-group {
  display: inline-flex;
  align-items: center;
}

.tx-avatar-group__more {
  font-weight: 600;
}
</style>
