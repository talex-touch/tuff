import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { describe, expect, it } from 'vitest'
import TxStep from '../src/TxStep.vue'
import txStepSource from '../src/TxStep.vue?raw'
import TxSteps from '../src/TxSteps.vue'

function mountSteps(options: { active?: number | string, direction?: 'horizontal' | 'vertical' } = {}) {
  return mount(TxSteps, {
    props: {
      active: options.active ?? 1,
      direction: options.direction,
    },
    slots: {
      default: `
        <TxStep title="Start" description="Collect basics" />
        <TxStep title="Details" description="Fill details" />
        <TxStep title="Finish" description="Review" />
      `,
    },
    global: {
      components: { TxStep },
    },
  })
}

describe('txSteps', () => {
  it('uses child order as the default step value', () => {
    const wrapper = mountSteps({ active: 1 })
    const steps = wrapper.findAll('.tx-step')
    const heads = wrapper.findAll('.tx-step__head')

    expect(wrapper.attributes('role')).toBe('list')
    expect(heads.map(head => head.element.tagName)).toEqual(['BUTTON', 'BUTTON', 'BUTTON'])
    expect(heads[0].attributes('type')).toBe('button')
    expect(heads[0].attributes('role')).toBeUndefined()
    expect(heads[0].attributes('tabindex')).toBeUndefined()
    expect(steps[0].classes()).toContain('tx-step--completed')
    expect(steps[1].classes()).toContain('tx-step--active')
    expect(steps[1].find('.tx-step__head').attributes('aria-current')).toBe('step')
    expect(steps[2].find('.tx-step__number').text()).toBe('3')
  })

  it('does not render connector line for the last step', async () => {
    const wrapper = mountSteps({ active: 1 })
    await nextTick()
    const steps = wrapper.findAll('.tx-step')

    expect(steps[0].find('.tx-step__line').exists()).toBe(true)
    expect(steps[1].find('.tx-step__line').exists()).toBe(true)
    expect(steps[2].find('.tx-step__line').exists()).toBe(false)
  })

  it('supports explicit string step values', () => {
    const wrapper = mount(TxSteps, {
      props: {
        active: 'details',
      },
      slots: {
        default: `
          <TxStep title="Start" step="start" />
          <TxStep title="Details" step="details" />
        `,
      },
      global: {
        components: { TxStep },
      },
    })

    expect(wrapper.findAll('.tx-step')[1].classes()).toContain('tx-step--active')
  })

  it('updates internal active step through clickable step buttons', async () => {
    const wrapper = mountSteps({ active: 0 })
    const heads = wrapper.findAll('.tx-step__head')

    await heads[2].trigger('click')
    expect(wrapper.findAll('.tx-step')[2].classes()).toContain('tx-step--active')

    await heads[1].trigger('click')
    expect(wrapper.findAll('.tx-step')[1].classes()).toContain('tx-step--active')

    await heads[0].trigger('click')
    expect(wrapper.findAll('.tx-step')[0].classes()).toContain('tx-step--active')
  })

  it('blocks disabled or non-clickable steps', async () => {
    const wrapper = mount(TxSteps, {
      props: {
        active: 0,
      },
      slots: {
        default: `
          <TxStep title="Start" />
          <TxStep title="Disabled" disabled />
          <TxStep title="Static" :clickable="false" />
        `,
      },
      global: {
        components: { TxStep },
      },
    })

    const heads = wrapper.findAll('.tx-step__head')
    expect(heads[1].element.tagName).toBe('BUTTON')
    expect(heads[1].attributes('disabled')).toBeDefined()
    expect(heads[1].attributes('role')).toBeUndefined()
    expect(heads[2].element.tagName).toBe('DIV')
    expect(heads[2].attributes('role')).toBeUndefined()

    await heads[1].trigger('click')
    await heads[2].trigger('click')

    expect(wrapper.findAll('.tx-step')[0].classes()).toContain('tx-step--active')
  })

  it('derives the connector geometry from one marker-size variable per size', () => {
    // `tx-step--small`/`tx-step--large` and `tx-step--vertical` render on the same element,
    // so a descendant combinator (space) would never match. Since 2026-09-06 there are no
    // per-size line offsets at all: each size sets `--tx-step-icon-size` and the line reads it.
    expect(txStepSource).toMatch(/\.tx-step--small \{[^}]*--tx-step-icon-size: 20px/)
    expect(txStepSource).toMatch(/\.tx-step--large \{[^}]*--tx-step-icon-size: 28px/)
    expect(txStepSource).toMatch(/\.tx-step--horizontal \.tx-step__line \{[^}]*var\(--tx-step-icon-size\)/)
    expect(txStepSource).toMatch(/\.tx-step--vertical \.tx-step__line \{[^}]*var\(--tx-step-icon-size\)/)
    expect(txStepSource).not.toContain('.tx-step--small .tx-step--vertical')
    expect(txStepSource).not.toContain('.tx-step--large .tx-step--vertical')
  })

  it('keeps the connector out of the marker button and colours it once the step is completed', async () => {
    const wrapper = mount(TxSteps, {
      props: { active: 1 },
      slots: {
        default: `
          <TxStep title="Download" :step="0" />
          <TxStep title="Install" :step="1" />
          <TxStep title="Done" :step="2" />
        `,
      },
      global: { components: { TxStep } },
    })
    // Each step registers itself in setup; `isLast` only settles once every sibling is in.
    await nextTick()

    const steps = wrapper.findAll('.tx-step')
    // Pre-fix the line was a flex sibling of the marker inside the head, which
    // pushed every marker left of its own title.
    expect(steps[0].find('.tx-step__head .tx-step__line').exists()).toBe(false)
    expect(steps[0].find('.tx-step__line').classes()).toContain('tx-step__line--completed')
    expect(steps[1].find('.tx-step__line').classes()).not.toContain('tx-step__line--completed')
    // The fill is its own element so completion can sweep along the rail.
    expect(steps[0].find('.tx-step__line .tx-step__line-fill').exists()).toBe(true)
    // Each step publishes its index for the sweep stagger.
    expect(steps[1].attributes('style')).toContain('--tx-step-index: 1')
  })

  it('choreographs progress in CSS and switches it all off under reduced motion', () => {
    // The sweep runs on mount and on completion (keyframes), un-completion eases
    // back through the plain transition, the new current marker pops in behind
    // the sweep and then breathes; none of it is JS.
    expect(txStepSource).toContain('@keyframes tx-step-line-fill')
    expect(txStepSource).toContain('@keyframes tx-step-line-fill-vertical')
    expect(txStepSource).toContain('@keyframes tx-step-activate')
    expect(txStepSource).toContain('@keyframes tx-step-breathe')
    expect(txStepSource).toMatch(/\.tx-step__line--completed \.tx-step__line-fill \{[^}]*animation: tx-step-line-fill[^;]*var\(--tx-step-index/)
    expect(txStepSource).toMatch(/\.tx-step__icon--active \{[^}]*animation:[^;]*tx-step-activate[^;]*tx-step-breathe/)

    const reduced = txStepSource.slice(txStepSource.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('animation: none')
    expect(reduced).toContain('transition: none')
  })

  it('names each step button from its visible title (and description) via aria references', () => {
    const wrapper = mountSteps({ active: 1 })
    const heads = wrapper.findAll('.tx-step__head')

    // Pre-fix the button wrapped only the number/icon, so its accessible name was
    // just "1"; it now points at the sibling title and description nodes.
    const labelledby = heads[0].attributes('aria-labelledby')
    expect(labelledby).toBeTruthy()
    expect(wrapper.get(`[id="${labelledby}"]`).text()).toBe('Start')

    const describedby = heads[0].attributes('aria-describedby')
    expect(describedby).toBeTruthy()
    expect(wrapper.get(`[id="${describedby}"]`).text()).toBe('Collect basics')
  })

  it('propagates direction and size changes to child steps', async () => {
    const wrapper = mount(TxSteps, {
      props: {
        direction: 'horizontal',
        size: 'medium',
      },
      slots: {
        default: `
          <TxStep title="Start" />
          <TxStep title="Finish" />
        `,
      },
      global: {
        components: { TxStep },
      },
    })

    const initialStep = wrapper.findAll('.tx-step')[0]
    expect(initialStep.classes()).toContain('tx-step--horizontal')
    expect(initialStep.classes()).toContain('tx-step--medium')

    await wrapper.setProps({ direction: 'vertical', size: 'large' })

    const updatedStep = wrapper.findAll('.tx-step')[0]
    expect(updatedStep.classes()).toContain('tx-step--vertical')
    expect(updatedStep.classes()).toContain('tx-step--large')
    expect(updatedStep.classes()).not.toContain('tx-step--horizontal')
    expect(updatedStep.classes()).not.toContain('tx-step--medium')
  })
})
