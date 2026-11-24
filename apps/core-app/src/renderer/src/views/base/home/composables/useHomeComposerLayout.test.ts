// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useHomeComposerLayout } from './useHomeComposerLayout'

const rect = (width: number, height = 110) =>
  ({ left: 0, top: 0, width, height, right: width, bottom: height }) as DOMRect

function mountLayout(options: { withComposerRef: boolean }) {
  const input = ref<HTMLTextAreaElement | null>(null)
  const composer = ref<HTMLElement | null>(null)
  const composerGroup = ref<HTMLElement | null>(null)
  let layout!: ReturnType<typeof useHomeComposerLayout>

  const wrapper = mount(
    defineComponent({
      setup() {
        layout = useHomeComposerLayout(
          options.withComposerRef ? { input, composer, composerGroup } : { input, composerGroup }
        )
        return () =>
          h('div', { ref: composerGroup, class: 'HomePage-ComposerGroup' }, [
            h('div', { class: 'TuffAIComposer' }, [
              h('div', { ref: composer, class: 'TuffAIComposer-Box' }, [
                h('textarea', { ref: input, class: 'TuffAIComposer-Input' })
              ])
            ])
          ])
      }
    })
  )

  return { wrapper, layout, composer }
}

describe('useHomeComposerLayout', () => {
  it('measures bubbleMaxWidth from the composer ref at 78% of the lane width', () => {
    const { wrapper, layout, composer } = mountLayout({ withComposerRef: true })
    composer.value!.getBoundingClientRect = () => rect(720)

    expect(layout.bubbleMaxWidth()).toBeCloseTo(561.6, 2)
    wrapper.unmount()
  })

  it('falls back to .TuffAIComposer inside composerGroup when composer ref is absent', () => {
    const { wrapper, layout } = mountLayout({ withComposerRef: false })
    const beam = wrapper.get('.TuffAIComposer').element as HTMLElement
    beam.getBoundingClientRect = () => rect(640)

    expect(layout.bubbleMaxWidth()).toBeCloseTo(499.2, 2)
    wrapper.unmount()
  })
})
