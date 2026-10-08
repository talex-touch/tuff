// Ported from Amicro. MIT License. Copyright (c) 2026 SYED  SUBHAN UDDIN.
import type { CSSProperties, PropType, VNode } from 'vue'
import type { LoaderNode, LoaderText } from './scene-types'
import type { MotionLoaderLabels } from './types'
import { defineComponent, h, onBeforeUnmount, onBeforeUpdate, onDeactivated, onMounted, onUpdated } from 'vue'
import { TxSkeleton } from '../../skeleton'
import { TxTextMorph } from '../../text-morph'
import { loaderEasing, loaderStaticStyle, loaderTracks } from './motion'

const SVG_PRESENTATION_ATTRIBUTES: Readonly<Record<string, string>> = {
  strokeWidth: 'stroke-width',
  strokeLinecap: 'stroke-linecap',
  strokeLinejoin: 'stroke-linejoin',
  strokeDasharray: 'stroke-dasharray',
  strokeDashoffset: 'stroke-dashoffset',
}

export default defineComponent({
  name: 'TxMotionLoaderScene',
  props: {
    scene: { type: Object as PropType<LoaderNode>, required: true },
    active: Boolean,
    speed: { type: Number, required: true },
    labels: { type: Object as PropType<Required<MotionLoaderLabels>>, required: true },
    instanceId: { type: String, required: true },
  },
  setup(props) {
    const elements = new Map<string, { element: Element, node: LoaderNode }>()
    const animations: Animation[] = []

    function stop(): void {
      for (const animation of animations)
        animation.cancel()
      animations.length = 0
    }

    function sync(): void {
      stop()
      if (!props.active)
        return
      for (const { element, node } of elements.values()) {
        if (typeof element.animate !== 'function')
          continue
        for (const track of loaderTracks(node)) {
          const easing = loaderEasing(track.timing)
          if (easing !== 'linear') {
            for (const frame of track.frames)
              frame.easing = easing
          }
          const animation = element.animate(track.frames, {
            duration: (track.timing.duration ?? 0.3) * 1000,
            delay: (track.timing.delay ?? 0) * 1000,
            iterations: Number.POSITIVE_INFINITY,
            easing: 'linear',
            fill: 'both',
          })
          animation.playbackRate = props.speed
          animations.push(animation)
        }
      }
    }

    onMounted(sync)
    onBeforeUpdate(() => {
      stop()
      elements.clear()
    })
    onUpdated(sync)
    onDeactivated(stop)
    onBeforeUnmount(stop)

    function renderChild(child: LoaderNode | LoaderText | string, path: string): VNode | string {
      if (typeof child === 'string')
        return child
      if ('label' in child) {
        return h(TxTextMorph, {
          text: props.labels[child.label],
          disabled: !props.active,
        })
      }
      return renderNode(child, path)
    }

    function renderNode(node: LoaderNode, path: string): VNode {
      if (node.tag === 'skeleton')
        return h(TxSkeleton, { ...node.attrs, loading: true })
      const attrs = { ...node.attrs }
      for (const name in attrs) {
        const svgName = SVG_PRESENTATION_ATTRIBUTES[name]
        if (typeof svgName === 'string') {
          attrs[svgName] = attrs[name]!
          delete attrs[name]
        }
      }
      // Both gooey sources used a document-global #goo. Scope every definition and
      // reference with the parent's hydration-stable useId() value instead.
      if (typeof attrs.id === 'string')
        attrs.id = `${props.instanceId}-${attrs.id}`
      const style = loaderStaticStyle(node)
      if (typeof style.filter === 'string')
        style.filter = style.filter.replace(/url\(#([^)]+)\)/g, `url(#${props.instanceId}-$1)`)
      let children: (VNode | string)[]
      if (node.characters) {
        const template = node.children?.[0]
        const text = props.labels[node.characters] + (node.characterSuffix ?? '')
        children = template && typeof template === 'object' && 'tag' in template
          ? Array.from(text, (character, index) => renderNode({
              ...template,
              children: [character === ' ' ? '\u00A0' : character],
              motion: template.motion
                ? {
                    ...template.motion,
                    timing: {
                      ...template.motion.timing,
                      delay: index * (node.characterDelay ?? 0),
                    },
                  }
                : undefined,
            }, `${path}-${index}`))
          : []
      }
      else {
        children = (node.children ?? []).map((child, index) => renderChild(child, `${path}-${index}`))
      }
      return h(node.tag, {
        ...attrs,
        style,
        ref: node.motion
          ? (element: unknown) => {
              if (element && typeof element === 'object' && 'animate' in element)
                elements.set(path, { element: element as Element, node })
              else
                elements.delete(path)
            }
          : undefined,
      }, children)
    }

    return () => h('div', {
      class: 'tx-motion-loader__scene',
      style: { zoom: props.scene.zoom ?? 1 } as CSSProperties,
    }, [renderNode(props.scene, '0')])
  },
})
