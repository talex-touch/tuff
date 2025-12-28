<script setup lang="ts">
import { computed, nextTick, ref, useAttrs } from 'vue'
import { useAutoResize } from '../../../../utils/animation/auto-resize'
import { useFlip } from '../../../../utils/animation/flip'
import type {
  AutoSizerActionOptions,
  AutoSizerActionResult,
  AutoSizerDetect,
  AutoSizerProps,
  AutoSizerSnapshot,
  AutoSizerWatchKey,
} from './types'

defineOptions({
  name: 'TxAutoSizer',
  inheritAttrs: false,
})

const props = withDefaults(defineProps<AutoSizerProps>(), {
  as: 'div',
  innerAs: 'div',
  width: true,
  height: true,
  inline: undefined,
  durationMs: 200,
  easing: 'ease',
  outerClass: 'overflow-hidden',
  innerClass: undefined,
  rounding: 'ceil',
  immediate: true,
  rafBatch: true,
  observeTarget: 'inner',
})

const attrs = useAttrs()

const outer = ref<HTMLElement | null>(null)
const inner = ref<HTMLElement | null>(null)

let opSeq = 0

const { refresh, measure, size, setEnabled } = useAutoResize(outer, inner, {
  width: props.width,
  height: props.height,
  applyStyle: true,
  applyMode: 'auto',
  styleTarget: 'outer',
  observeTarget: props.observeTarget,
  rounding: props.rounding,
  immediate: props.immediate,
  rafBatch: props.rafBatch,
  durationMs: props.durationMs,
  easing: props.easing,
  clearStyleOnFinish: true,
})

const { flip: rawFlip } = useFlip(outer, {
  mode: 'size',
  duration: props.durationMs,
  easing: props.easing,
  includeScale: false,
  size: {
    width: props.width,
    height: props.height,
  },
})

function snapshot(el: HTMLElement, watch?: AutoSizerWatchKey[]): AutoSizerSnapshot {
  const keys = new Set(watch ?? ['rect', 'box', 'scroll', 'class', 'style', 'attrs'])

  const rect = keys.has('rect')
    ? { width: el.getBoundingClientRect().width, height: el.getBoundingClientRect().height }
    : { width: 0, height: 0 }

  const box = keys.has('box')
    ? {
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
        offsetWidth: el.offsetWidth,
        offsetHeight: el.offsetHeight,
      }
    : { clientWidth: 0, clientHeight: 0, offsetWidth: 0, offsetHeight: 0 }

  const scroll = keys.has('scroll')
    ? {
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
      }
    : { scrollWidth: 0, scrollHeight: 0 }

  const className = keys.has('class') ? el.className : ''
  const style = keys.has('style') ? el.getAttribute('style') : null

  const attrs: Record<string, string | null> = {}
  if (keys.has('attrs')) {
    for (const name of el.getAttributeNames()) {
      if (name === 'style' || name === 'class') continue
      attrs[name] = el.getAttribute(name)
    }
  }

  return { rect, box, scroll, className, style, attrs }
}

function defaultDetect(before: AutoSizerSnapshot, after: AutoSizerSnapshot): AutoSizerActionResult {
  const changedKeys: string[] = []

  if (before.rect.width !== after.rect.width || before.rect.height !== after.rect.height)
    changedKeys.push('rect')

  if (
    before.box.clientWidth !== after.box.clientWidth
    || before.box.clientHeight !== after.box.clientHeight
    || before.box.offsetWidth !== after.box.offsetWidth
    || before.box.offsetHeight !== after.box.offsetHeight
  ) {
    changedKeys.push('box')
  }

  if (before.scroll.scrollWidth !== after.scroll.scrollWidth || before.scroll.scrollHeight !== after.scroll.scrollHeight)
    changedKeys.push('scroll')

  if (before.className !== after.className)
    changedKeys.push('class')

  if (before.style !== after.style)
    changedKeys.push('style')

  const aKeys = Object.keys(before.attrs)
  const bKeys = Object.keys(after.attrs)
  if (aKeys.length !== bKeys.length)
    changedKeys.push('attrs')
  else {
    for (const k of aKeys) {
      if (before.attrs[k] !== after.attrs[k]) {
        changedKeys.push('attrs')
        break
      }
    }
  }

  return { changedKeys, before, after }
}

function resolveOptions(optionsOrDetect?: AutoSizerActionOptions | AutoSizerDetect) {
  if (typeof optionsOrDetect === 'function') {
    return { watch: undefined, detect: optionsOrDetect, target: undefined }
  }
  return {
    watch: optionsOrDetect?.watch,
    detect: optionsOrDetect?.detect,
    target: optionsOrDetect?.target,
  }
}

function pickTarget(target?: 'inner' | 'outer') {
  if (target === 'outer')
    return outer.value ?? inner.value
  return inner.value ?? outer.value
}

async function flip(action: () => void | Promise<void>) {
  const seq = ++opSeq
  setEnabled(false)
  try {
    await rawFlip(action)
  }
  finally {
    if (seq !== opSeq)
      return
    setEnabled(true)
    await measure(true)
  }
}

async function action(
  fn: (el: HTMLElement) => void | Promise<void>,
  optionsOrDetect?: AutoSizerActionOptions | AutoSizerDetect,
) {
  const seq = ++opSeq
  const { watch, detect, target } = resolveOptions(optionsOrDetect)
  const el = pickTarget(target)
  if (!el)
    return { changedKeys: [] as string[] }

  const before = snapshot(el, watch)
  let after: AutoSizerSnapshot | null = null

  setEnabled(false)
  try {
    await rawFlip(async () => {
      await fn(el)
      await nextTick()
      after = snapshot(el, watch)
    })
  }
  finally {
    if (seq !== opSeq)
      return { changedKeys: [] as string[] }
    setEnabled(true)
    await measure(true)
  }

  const resolvedAfter = after ?? snapshot(el, watch)
  const raw = (detect ?? defaultDetect)(before, resolvedAfter)

  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      before,
      after: resolvedAfter,
      ...raw,
    }
  }

  return {
    changedKeys: [],
    before,
    after: resolvedAfter,
    result: raw,
  }
}

const inline = computed(() => {
  if (typeof props.inline === 'boolean')
    return props.inline
  return props.width && !props.height
})

const baseStyle = computed(() => {
  return {
    boxSizing: 'border-box',
    display: inline.value ? 'inline-block' : undefined,
    width: inline.value ? 'fit-content' : undefined,
    maxWidth: inline.value ? '100%' : undefined,
    flex: inline.value ? '0 0 auto' : undefined,
  }
})

const mergedClass = computed(() => {
  return [props.outerClass, attrs.class]
})

const mergedStyle = computed(() => {
  return [baseStyle.value, attrs.style]
})

const passthroughAttrs = computed(() => {
  const { class: _c, style: _s, ...rest } = attrs
  return rest
})

defineExpose({
  refresh,
  flip,
  action,
  size,
  focus: () => (outer.value as any)?.focus?.(),
  outerEl: outer,
})
</script>

<template>
  <component :is="as" ref="outer" :class="mergedClass" :style="mergedStyle" v-bind="passthroughAttrs">
    <component :is="innerAs" ref="inner" :class="innerClass" style="display: flow-root;">
      <slot />
    </component>
  </component>
</template>
