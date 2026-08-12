// @vitest-environment jsdom
/* eslint-disable vue/one-component-per-file -- Two probes on purpose: one renders its host at
   mount, the other flips later. Merging them would collapse the two scheduling cases this file
   exists to tell apart. */

/**
 * `mountShadowApp()` was driven by a default (pre-flush) watcher with `immediate: true`, but it
 * needs `shadowHost.value`, which Vue only populates after the render that creates the
 * `v-else-if="canRenderShadow"` div. `ensureShadowRoot()` returned null, `mountShadowApp` bailed,
 * and nothing re-triggered the watcher — so shadow render mode could never mount (#833).
 *
 * Mounting the real WidgetFrame would need the renderer registry, the widget host key bridge and a
 * live custom renderer. These pin the *scheduling* instead, which is the whole defect, against this
 * repo's Vue rather than against my memory of its semantics:
 *
 * | when                                    | is the template ref populated? |
 * |-----------------------------------------|--------------------------------|
 * | `immediate` callback, `flush: 'pre'`     | no                             |
 * | `immediate` callback, `flush: 'post'`    | no                             |
 * | `onMounted`, node rendered at mount      | yes                            |
 * | pre-flush watcher, enabled flips later   | no                             |
 * | post-flush watcher, enabled flips later  | yes                            |
 *
 * The second row is why `flush: 'post'` alone is not the fix, and the third and fifth are why the
 * component now uses `onMounted` *and* a post-flush watcher.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick, onMounted, ref, watch } from 'vue'

interface Sighting {
  where: string
  hasRef: boolean
}

/** Mirrors WidgetFrame: a host div rendered only while `enabled`, with a template ref on it. */
function createProbe(enabled: ReturnType<typeof ref<boolean>>, seen: Sighting[]) {
  return defineComponent({
    setup() {
      const host = ref<HTMLElement | null>(null)
      const record = (where: string): void => {
        seen.push({ where, hasRef: Boolean(host.value) })
      }

      watch(
        () => enabled.value,
        () => record('immediate-pre'),
        { immediate: true }
      )
      watch(
        () => enabled.value,
        () => record('immediate-post'),
        {
          immediate: true,
          flush: 'post'
        }
      )
      onMounted(() => record('onMounted'))

      return () => (enabled.value ? h('div', { ref: host }) : null)
    }
  })
}

function sighting(seen: Sighting[], where: string): Sighting | undefined {
  return seen.find((entry) => entry.where === where)
}

describe('the shadow host ref is only readable after the DOM update', () => {
  it('immediate 回调读不到 ref —— 无论 pre 还是 post', () => {
    const seen: Sighting[] = []
    mount(createProbe(ref(true), seen))

    expect(sighting(seen, 'immediate-pre')?.hasRef).toBe(false)
    // The reason `flush: 'post'` alone would not have fixed this: Vue runs the first invocation
    // directly rather than through the scheduler.
    expect(sighting(seen, 'immediate-post')?.hasRef).toBe(false)
  })

  it('onMounted 读得到 —— 这是「挂载时就该渲染」那半的修法', () => {
    const seen: Sighting[] = []
    mount(createProbe(ref(true), seen))

    expect(sighting(seen, 'onMounted')?.hasRef).toBe(true)
  })

  it('宿主尚未渲染时 onMounted 自然读不到(否则上一条会掩盖"总是能读到")', () => {
    const seen: Sighting[] = []
    mount(createProbe(ref(false), seen))

    expect(sighting(seen, 'onMounted')?.hasRef).toBe(false)
  })

  /**
   * The rows above are facts about Vue, not about WidgetFrame — reverting the component would not
   * make any of them fail. Mounting the real component needs the renderer registry, the widget host
   * key bridge and a live custom renderer, so the wiring is asserted from the source instead,
   * deliberately and narrowly: it must not go back to an immediate pre-flush watcher.
   */
  it('WidgetFrame 确实按上表接线:onMounted + post-flush,且不再用 immediate', () => {
    const source = readFileSync(path.join(__dirname, 'WidgetFrame.vue'), 'utf8')

    expect(source).toContain('onMounted(syncShadowApp)')
    expect(source).toMatch(/watch\(\s*\(\) => \[canRenderShadow\.value[\s\S]*?flush: 'post'/)
    expect(source).not.toMatch(/canRenderShadow\.value[\s\S]{0,400}immediate: true/)
  })

  it('稍后翻转为可渲染时,只有 post-flush 的 watcher 读得到', async () => {
    const enabled = ref(false)
    const later: Sighting[] = []

    const Probe = defineComponent({
      setup() {
        const host = ref<HTMLElement | null>(null)
        watch(
          () => enabled.value,
          () => later.push({ where: 'pre', hasRef: Boolean(host.value) })
        )
        watch(
          () => enabled.value,
          () => later.push({ where: 'post', hasRef: Boolean(host.value) }),
          {
            flush: 'post'
          }
        )
        return () => (enabled.value ? h('div', { ref: host }) : null)
      }
    })

    mount(Probe)
    enabled.value = true
    await nextTick()

    expect(sighting(later, 'pre')?.hasRef).toBe(false)
    expect(sighting(later, 'post')?.hasRef).toBe(true)
  })
})
