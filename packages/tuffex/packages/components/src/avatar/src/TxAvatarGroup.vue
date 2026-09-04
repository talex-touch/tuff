<script lang="ts">
import type { AvatarGroupProps } from './types'
import type { VNode } from 'vue'
import { cloneVNode, computed, defineComponent, Fragment, h, isVNode } from 'vue'
import { TxPopover } from '../../popover'
import TxAvatar from './TxAvatar.vue'

function toCssLength(value: number | string): string {
  return typeof value === 'number' ? `${value}px` : value
}

export default defineComponent({
  name: 'TxAvatarGroup',
  props: {
    max: { type: Number, required: false },
    size: { type: [String, Number], required: false },
    overlap: { type: [Number, String], default: 8 },
    hoverEffect: { type: String, default: 'lift' },
    spreadOnHover: { type: Boolean, default: false },
    spreadOverlap: { type: [Number, String], default: 0 },
    overflowPopover: { type: Boolean, default: false },
    overflowPopoverTrigger: { type: String, default: 'hover' },
    overflowPopoverPlacement: { type: String, default: 'top' },
  },
  setup(props: AvatarGroupProps, { slots }) {
    const overlapPx = computed(() => toCssLength(props.overlap ?? 8))
    const spreadOverlapPx = computed(() => toCssLength(props.spreadOverlap ?? 0))

    // `v-for` slot content arrives as a single Fragment vnode; counting it as one
    // node would defeat `max` (and the per-item overlap/ring injection) for the
    // most common way of rendering an avatar list.
    const flattenNodes = (vnodes: unknown[]): VNode[] => {
      return vnodes.flatMap((node) => {
        if (!isVNode(node))
          return []
        if (node.type === Fragment && Array.isArray(node.children))
          return flattenNodes(node.children)
        return [node]
      })
    }

    // The hidden avatars were sliced off before rendering, so reusing their vnodes
    // in the panel is safe — nothing else is mounting them.
    const renderOverflowPanel = (hidden: VNode[]) => h(
      'div',
      { class: 'tx-avatar-group__overflow-grid' },
      hidden.map((vnode) => {
        const rawProps = (vnode as any).props ?? {}
        const overflowProps: Record<string, any> = {
          class: [rawProps.class, 'tx-avatar-group__overflow-item'],
        }
        if (props.size && rawProps.size == null) {
          overflowProps.size = props.size
        }
        return cloneVNode(vnode as any, overflowProps)
      }) as any,
    )

    return () => {
      const nodes = flattenNodes(slots.default?.() ?? [])
      const maxVisible = typeof props.max === 'number' ? Math.max(0, props.max) : nodes.length
      const extraCount = typeof props.max === 'number' ? Math.max(0, nodes.length - maxVisible) : 0
      const visible = nodes.slice(0, maxVisible)
      const hidden = extraCount > 0 ? nodes.slice(maxVisible) : []

      // A scoped selector never matches slot content on its own (the avatars carry
      // the parent's scope id, not ours), but `:deep()` does: it compiles to
      // `.tx-avatar-group[data-v-x] .child`, and the group root — rendered here — is
      // what carries the attribute. So the stacking offsets live in the stylesheet:
      // `margin-left` and `z-index` have to be overridable by `:hover`, and an inline
      // value outranks every rule.
      //
      // The ring is the one thing still injected inline, because nothing hovers it.
      // Only the border, though: an inline border-radius would outrank TxAvatar's own
      // `shape` classes (square 8px / rounded 12px) and silently force every grouped
      // avatar circular. The border follows whatever radius the avatar sets.
      const ringStyle = {
        border: '2px solid var(--tx-avatar-group-border, #fff)',
      }

      const stackStyle = (index: number) => ({
        ...ringStyle,
        '--tx-avatar-group-index': String(index + 1),
      })

      const children = visible.map((vnode, index) => {
        const rawProps = (vnode as any).props ?? {}
        const className = rawProps.class
        const style = rawProps.style

        const injectedProps: Record<string, any> = {
          class: [className, 'tx-avatar-group__item'],
          style: [stackStyle(index), style],
        }

        if (props.size && rawProps.size == null) {
          injectedProps.size = props.size
        }

        return cloneVNode(vnode as any, injectedProps)
      })

      if (extraCount > 0) {
        const index = children.length
        const showPopover = props.overflowPopover === true

        const moreAvatar = h(
          TxAvatar,
          {
            size: props.size,
            // When wrapped, the popover's reference element becomes the flex item and
            // owns the stacking offsets; the avatar inside must not claim them too or
            // the negative margin lands twice.
            class: showPopover
              ? ['tx-avatar-group__more']
              : ['tx-avatar-group__item', 'tx-avatar-group__more'],
            style: showPopover ? ringStyle : stackStyle(index),
          },
          {
            default: () => `+${extraCount}`,
          },
        )

        if (!showPopover) {
          children.push(moreAvatar)
        }
        else {
          children.push(
            h(
              TxPopover,
              {
                trigger: props.overflowPopoverTrigger ?? 'hover',
                placement: props.overflowPopoverPlacement ?? 'top',
                // The reference is a single avatar. Left to its default, the panel
                // would inherit that ~40px width and stack the overflow avatars into
                // a one-per-row column.
                matchReferenceWidth: false,
                // `referenceClass` is the only way in: TxBaseAnchor sets
                // `inheritAttrs: false` and forwards attrs to the teleported panel, so a
                // plain `class` here would style the floating layer, not the trigger.
                referenceClass: ['tx-avatar-group__item', 'tx-avatar-group__more-ref'],
              },
              {
                reference: () => moreAvatar,
                default: () => slots.overflow?.({ nodes: hidden, count: extraCount })
                  ?? renderOverflowPanel(hidden),
              },
            ),
          )
        }
      }

      return h(
        'div',
        {
          class: [
            'tx-avatar-group',
            { 'is-hover-lift': props.hoverEffect !== 'none' },
            { 'is-spread-hover': props.spreadOnHover === true },
          ],
          style: {
            '--tx-avatar-group-overlap': overlapPx.value,
            '--tx-avatar-group-spread-overlap': spreadOverlapPx.value,
            '--tx-avatar-group-more-z': String(children.length + 1),
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

  /* Indirection so `:hover` can retarget the whole row from one place: the items
     inherit this, they don't each need their own state. */
  --tx-avatar-group-gap: var(--tx-avatar-group-overlap);
}

.tx-avatar-group :deep(.tx-avatar-group__item) {
  z-index: var(--tx-avatar-group-index, 1);
  margin-left: calc(var(--tx-avatar-group-gap) * -1);
  transition: transform 0.18s ease, box-shadow 0.18s ease, margin-left 0.22s ease;
}

.tx-avatar-group :deep(.tx-avatar-group__item:first-child) {
  margin-left: 0;
}

.tx-avatar-group :deep(.tx-avatar-group__more-ref) {
  z-index: var(--tx-avatar-group-more-z, 1);
}

.tx-avatar-group.is-hover-lift :deep(.tx-avatar-group__item:not(.tx-avatar-group__more-ref):hover) {
  z-index: var(--tx-avatar-group-hover-z, 999);
  transform: translateY(-4px) scale(1.06);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}

/*
 * The popover's reference is a square wrapper, so lifting it directly would draw
 * a rectangular shadow around a round avatar and drag the anchor's reference rect
 * out from under the open panel. Lift the avatar inside it instead; the wrapper
 * already sits above its neighbours via --tx-avatar-group-more-z, so it needs no
 * z-index promotion of its own.
 */
.tx-avatar-group.is-hover-lift :deep(.tx-avatar-group__more-ref:hover .tx-avatar-group__more) {
  transform: translateY(-4px) scale(1.06);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.18);
}

.tx-avatar-group :deep(.tx-avatar-group__more-ref .tx-avatar-group__more) {
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.tx-avatar-group.is-spread-hover:hover {
  --tx-avatar-group-gap: var(--tx-avatar-group-spread-overlap);
}

.tx-avatar-group__more {
  font-weight: 600;
}

/*
 * The panel is teleported to <body>, so it is not a descendant of the group root
 * and `.tx-avatar-group :deep(...)` cannot reach it. These have to be standalone
 * selectors, which still carry our scope id because we render them.
 */
.tx-avatar-group__overflow-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  /* Five medium avatars across (5 * 40 + 4 * 8) before wrapping to a second row. */
  max-width: var(--tx-avatar-group-overflow-width, 232px);
}

.tx-avatar-group__overflow-grid :deep(.tx-avatar-group__overflow-item) {
  flex: none;
}

/*
 * Motion is decoration here; the stacking order and the shadow are information
 * (which avatar is being pointed at), so they survive the preference.
 */
@media (prefers-reduced-motion: reduce) {
  .tx-avatar-group :deep(.tx-avatar-group__item),
  .tx-avatar-group :deep(.tx-avatar-group__more-ref .tx-avatar-group__more) {
    transition: none;
  }

  .tx-avatar-group.is-hover-lift :deep(.tx-avatar-group__item:not(.tx-avatar-group__more-ref):hover),
  .tx-avatar-group.is-hover-lift :deep(.tx-avatar-group__more-ref:hover .tx-avatar-group__more) {
    transform: none;
  }
}
</style>
