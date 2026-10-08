import type { MotionLoaderVariant } from '../index'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { TxMotionLoader } from '../index'

enableAutoUnmount(afterEach)

interface SvgCase {
  variant: MotionLoaderVariant
  circles: ReadonlyArray<Record<string, string>>
}

// The authored scene geometry is a visible contract, not a copy of the scene
// registry: expectations stay independent of the renderer and descriptor data.
const cases: SvgCase[] = [
  {
    variant: 'app-icon-load',
    circles: [
      { cx: '25', cy: '25', r: '20', 'stroke-width': '4' },
      { cx: '25', cy: '25', r: '20', 'stroke-width': '4', 'stroke-dasharray': '125' },
    ],
  },
  {
    variant: 'fade-arc',
    circles: [
      { cx: '25', cy: '25', r: '20', fill: 'none', 'stroke-width': '3.5' },
      { cx: '25', cy: '25', r: '20', fill: 'none', 'stroke-width': '3.5', 'stroke-dasharray': '80', 'stroke-dashoffset': '28', 'stroke-linecap': 'round' },
    ],
  },
]

function expectSvgGeometry(root: ParentNode, expected: SvgCase) {
  const svg = root.querySelector('svg')!
  expect(svg.getAttribute('viewBox')).toBe('0 0 50 50')
  expect(svg.hasAttribute('viewbox')).toBe(false)
  const circles = svg.querySelectorAll('circle')
  expect(circles).toHaveLength(expected.circles.length)
  for (const [index, attrs] of expected.circles.entries()) {
    const circle = circles[index]!
    for (const [name, value] of Object.entries(attrs))
      expect(circle.getAttribute(name), `${expected.variant} circle ${index} ${name}`).toBe(value)
  }

  // Duplicating correct attrs alongside ignored camel-case attrs is not a
  // clean SVG serialization contract either. Reject both canonical and the
  // lowercased misspellings an HTML parser could leave behind.
  for (const element of [svg, ...svg.querySelectorAll('*')]) {
    for (const name of ['strokeWidth', 'strokeLinecap', 'strokeDasharray', 'strokeDashoffset']) {
      expect(element.hasAttribute(name), `${expected.variant} invalid ${name}`).toBe(false)
      expect(element.hasAttribute(name.toLowerCase()), `${expected.variant} invalid ${name.toLowerCase()}`).toBe(false)
    }
  }
}

describe('txMotionLoader SVG presentation attributes', () => {
  it.each(cases)('SSR serializes $variant as standard SVG while preserving case-sensitive geometry', async (expected) => {
    const html = await renderToString(h(TxMotionLoader, { variant: expected.variant, playing: false }))
    // XML parsing preserves the exact SSR attribute names. HTML parsing would
    // silently repair viewBox's casing and could conceal a broken serializer.
    const output = new DOMParser().parseFromString(html, 'application/xml')
    expectSvgGeometry(output, expected)
  })

  it.each(cases)('client rendering makes $variant presentation attributes consumable by SVG', async (expected) => {
    const wrapper = mount(TxMotionLoader, { props: { variant: expected.variant, playing: false } })
    await nextTick()
    expectSvgGeometry(wrapper.element, expected)
  })
})
