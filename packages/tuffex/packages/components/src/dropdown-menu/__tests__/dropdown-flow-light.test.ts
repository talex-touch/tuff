import type { BaseAnchorPanelCardProps } from '../../base-anchor/src/types'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import TxDropdownItem from '../src/TxDropdownItem.vue'
import TxDropdownMenu from '../src/TxDropdownMenu.vue'
import TxDropdownSubmenu from '../src/TxDropdownSubmenu.vue'

/**
 * The flow light through the real anchor family: DropdownMenu → Popover → Tooltip → BaseAnchor →
 * Card → BaseSurface, nothing stubbed but the glass layer's SVG renderer.
 */
const GlassSurfaceStub = defineComponent({
  name: 'TxGlassSurface',
  template: '<div class="tx-glass-surface-stub" />',
})

const mounted: Array<{ unmount: () => void }> = []

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount()
  document.body.innerHTML = ''
})

async function settle() {
  for (let index = 0; index < 4; index++) {
    await nextTick()
    await flushPromises()
  }
}

function mountMenu(rootCard?: BaseAnchorPanelCardProps, submenuCard?: BaseAnchorPanelCardProps) {
  const wrapper = mount(TxDropdownMenu, {
    attachTo: document.body,
    props: { modelValue: true, animation: { type: 'none' }, panelCard: rootCard },
    slots: {
      trigger: () => h('button', { class: 'trigger' }, 'More'),
      default: () => [
        h(TxDropdownItem, null, () => 'Rename'),
        h(TxDropdownSubmenu, { panelCard: submenuCard, animation: { type: 'none' } }, {
          default: () => 'Open in',
          menu: () => [h(TxDropdownItem, { class: 'nested-item' }, () => 'OMP')],
        }),
      ],
    },
    global: { stubs: { TxGlassSurface: GlassSurfaceStub } },
  })
  mounted.push(wrapper)
  return wrapper
}

function panelLight(selector: string): HTMLElement | null {
  const panel = document.body.querySelector(selector)?.closest('.tx-base-anchor')
  return panel?.querySelector<HTMLElement>('.tx-card__surface .tx-flow-light') ?? null
}

async function openSubmenu() {
  document.body.querySelector<HTMLElement>('.tx-dropdown-submenu__trigger')!.click()
  await settle()
  expect(document.body.querySelector('.tx-dropdown-submenu__panel'), 'submenu panel').not.toBeNull()
}

describe('flow light through the dropdown family', () => {
  it('reaches the menu\'s card through panelCard', async () => {
    mountMenu({ flowLight: 'corners', flowLightIntensity: 0.5 })
    await settle()

    const light = panelLight('.tx-dropdown__panel')
    expect(light?.classList.contains('tx-flow-light--corners')).toBe(true)
    expect(light?.style.getPropertyValue('--tx-flow-light-intensity')).toBe('0.5')
  })

  it('lights a submenu as the menu it opened from', async () => {
    mountMenu({ flowLight: 'corners', flowLightIntensity: 0.5 })
    await settle()
    await openSubmenu()

    const light = panelLight('.tx-dropdown-submenu__panel')
    expect(light?.classList.contains('tx-flow-light--corners')).toBe(true)
    expect(light?.style.getPropertyValue('--tx-flow-light-intensity')).toBe('0.5')
  })

  it('lets a submenu name its own variant and still take the intensity', async () => {
    mountMenu({ flowLight: 'corners', flowLightIntensity: 0.5 }, { flowLight: 'rim' })
    await settle()
    await openSubmenu()

    const light = panelLight('.tx-dropdown-submenu__panel')
    expect(light?.classList.contains('tx-flow-light--rim')).toBe(true)
    expect(light?.style.getPropertyValue('--tx-flow-light-intensity')).toBe('0.5')
  })

  it('lets a submenu turn the light off', async () => {
    mountMenu({ flowLight: 'aurora' }, { flowLight: false })
    await settle()
    await openSubmenu()

    expect(panelLight('.tx-dropdown__panel')?.classList.contains('tx-flow-light--aurora')).toBe(true)
    expect(panelLight('.tx-dropdown-submenu__panel')).toBeNull()
  })

  it('lights nothing when the menu has no flow light', async () => {
    mountMenu()
    await settle()
    await openSubmenu()

    expect(panelLight('.tx-dropdown__panel')).toBeNull()
    expect(panelLight('.tx-dropdown-submenu__panel')).toBeNull()
  })
})
