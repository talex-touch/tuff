import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent } from 'vue'
import TxCard from '../src/TxCard.vue'

const BaseSurfaceStub = defineComponent({
  name: 'TxBaseSurface',
  props: [
    'mode',
    'moving',
    'fallbackMaskOpacity',
    'radius',
    'color',
    'opacity',
    'blur',
    'overlayOpacity',
    'refractionStrength',
    'refractionProfile',
    'refractionTone',
    'refractionAngle',
    'refractionLightX',
    'refractionLightY',
  ],
  template: '<div class="base-surface-stub" />',
})

const SpinnerStub = defineComponent({
  name: 'TxSpinner',
  props: {
    size: { type: Number, default: undefined },
  },
  template: '<span class="spinner-stub" :data-size="size" />',
})

function mountCard(options: Parameters<typeof mount<typeof TxCard>>[1] = {}) {
  return mount(TxCard, {
    ...options,
    global: {
      ...(options.global ?? {}),
      stubs: {
        TxBaseSurface: BaseSurfaceStub,
        TxSpinner: SpinnerStub,
        ...(options.global?.stubs ?? {}),
      },
    },
  })
}

describe('txCard', () => {
  it('renders default classes, surface mode, dimensions, and default slot', () => {
    const wrapper = mountCard({
      slots: {
        default: '<p>Card body</p>',
      },
    })

    expect(wrapper.classes()).toEqual(expect.arrayContaining([
      'tx-card',
      'is-solid',
      'is-bg-pure',
      'is-shadow-none',
      'is-medium',
    ]))
    expect(wrapper.text()).toContain('Card body')
    expect(wrapper.attributes('style')).toContain('--tx-card-radius: 18px')
    expect(wrapper.attributes('style')).toContain('--tx-card-padding: 12px')
    expect(wrapper.findComponent(BaseSurfaceStub).props('mode')).toBe('pure')
  })

  it('renders structural slots and size-specific padding', () => {
    const wrapper = mountCard({
      props: {
        size: 'large',
        radius: 24,
      },
      slots: {
        cover: '<img alt="cover" />',
        header: '<strong>Header</strong>',
        default: '<span>Body</span>',
        footer: '<small>Footer</small>',
      },
    })

    expect(wrapper.find('.tx-card__cover').exists()).toBe(true)
    expect(wrapper.find('.tx-card__header').text()).toContain('Header')
    expect(wrapper.find('.tx-card__body').text()).toContain('Body')
    expect(wrapper.find('.tx-card__footer').text()).toContain('Footer')
    expect(wrapper.attributes('style')).toContain('--tx-card-radius: 24px')
    expect(wrapper.attributes('style')).toContain('--tx-card-padding: 16px')
  })

  it('emits click only when clickable and enabled', async () => {
    const wrapper = mountCard({
      props: {
        clickable: true,
      },
    })

    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.setProps({ disabled: true })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)

    await wrapper.setProps({ clickable: false, disabled: false })
    await wrapper.trigger('click')
    expect(wrapper.emitted('click')).toHaveLength(1)
  })

  it('exposes button semantics and keyboard activation when clickable', async () => {
    const wrapper = mountCard({
      props: { clickable: true },
    })

    // A clickable card must be tab-reachable and announce button semantics.
    expect(wrapper.attributes('role')).toBe('button')
    expect(wrapper.attributes('tabindex')).toBe('0')

    // Enter and Space both activate through the same guard as a mouse click.
    await wrapper.trigger('keydown', { key: 'Enter' })
    await wrapper.trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('click')).toHaveLength(2)

    // Disabled leaves the tab order and blocks keyboard activation.
    await wrapper.setProps({ disabled: true })
    expect(wrapper.attributes('tabindex')).toBeUndefined()
    expect(wrapper.attributes('aria-disabled')).toBe('true')
    await wrapper.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('click')).toHaveLength(2)
  })

  it('does not turn a non-clickable card into a button or hijack nested keys', async () => {
    const wrapper = mountCard({
      props: { clickable: true },
      slots: { default: '<input class="inner" />' },
    })

    // Space typed inside a focusable child must not activate the card.
    await wrapper.find('.inner').trigger('keydown', { key: ' ' })
    expect(wrapper.emitted('click')).toBeUndefined()

    // A plain card carries no interactive semantics (no over-blocking).
    const plain = mountCard()
    expect(plain.attributes('role')).toBeUndefined()
    expect(plain.attributes('tabindex')).toBeUndefined()
  })

  it('renders loading overlay and forwards spinner size', () => {
    const wrapper = mountCard({
      props: {
        loading: true,
        loadingSpinnerSize: 20,
      },
    })

    expect(wrapper.classes()).toContain('is-loading')
    expect(wrapper.find('.tx-card__loading').exists()).toBe(true)
    expect(wrapper.find('.spinner-stub').attributes('data-size')).toBe('20')
  })

  it('maps mask and glass backgrounds to surface props', () => {
    const mask = mountCard({
      props: {
        background: 'mask',
        maskOpacity: 1.4,
      },
    })

    expect(mask.findComponent(BaseSurfaceStub).props()).toMatchObject({
      mode: 'mask',
      opacity: 1,
      color: 'var(--tx-card-fake-background, var(--tx-bg-color-overlay, #fff))',
    })

    const glass = mountCard({
      props: {
        background: 'glass',
        glassBlur: false,
        glassOverlay: false,
      },
    })

    expect(glass.findComponent(BaseSurfaceStub).props()).toMatchObject({
      mode: 'glass',
      blur: 0,
      overlayOpacity: 0,
    })
  })

  it('maps refraction props and light-follow state to BaseSurface', async () => {
    const wrapper = mountCard({
      props: {
        background: 'refraction',
        refractionStrength: 140,
        refractionProfile: 'cinematic',
        refractionTone: 'balanced',
        refractionAngle: 540,
        refractionLightFollowMouse: true,
        refractionLightSpring: false,
      },
    })

    const root = wrapper.element as HTMLElement
    root.getBoundingClientRect = () => ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 100,
      bottom: 100,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await wrapper.trigger('mousemove', {
      clientX: 100,
      clientY: 100,
    })

    const surfaceProps = wrapper.findComponent(BaseSurfaceStub).props()
    expect(surfaceProps).toMatchObject({
      mode: 'refraction',
      refractionStrength: 100,
      refractionProfile: 'cinematic',
      refractionTone: 'balanced',
      refractionLightX: 1,
      refractionLightY: 1,
    })
    expect(surfaceProps.refractionAngle).toBeCloseTo(119.25)
  })

  it('does not start surface motion on mouseleave when disabled', async () => {
    const wrapper = mountCard({
      props: {
        disabled: true,
        inertial: true,
        background: 'glass',
      },
    })

    await wrapper.trigger('mouseleave')

    // A disabled card must stay fully inert: no moving=true flash to the surface.
    expect(wrapper.findComponent(BaseSurfaceStub).props('moving')).toBe(false)
  })

  it('still starts return motion on mouseleave when enabled', async () => {
    const wrapper = mountCard({
      props: {
        inertial: true,
        background: 'glass',
      },
    })

    await wrapper.trigger('mouseleave')

    // Guard must not over-block: an enabled inertial card still returns to rest.
    expect(wrapper.findComponent(BaseSurfaceStub).props('moving')).toBe(true)
  })
})
