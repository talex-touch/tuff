import { computed, onScopeDispose, ref } from '@vue/reactivity'
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as TuffexReact from '../index'
import { REACT_COMPONENT_IDS, REACT_COMPONENTS_MANIFEST, useComputed, useReactiveScope, useSignal } from '../index'
import { cleanupAll, mount } from './render-helper'

afterEach(() => {
  cleanupAll()
})

const LOCKED_32_IDS = [
  // Tier A (18)
  'button',
  'badge',
  'tag',
  'avatar',
  'spinner',
  'divider',
  'alert',
  'card',
  'kbd',
  'progress',
  'progress-bar',
  'skeleton',
  'switch',
  'status-badge',
  'status-hint',
  'dot-indicator',
  'empty',
  'stat-card',
  // Tier B (12)
  'input',
  'textarea',
  'checkbox',
  'radio',
  'slider',
  'tabs',
  'collapse',
  'tooltip',
  'popover',
  'dialog',
  'drawer',
  'select',
  // Tier C (2)
  'stream-text',
  'markdown-view',
] as const

describe('reactivity hooks & manifest contract', () => {
  it('bridges @vue/reactivity ref and computed into React via useSignal and useComputed', () => {
    const count = ref(1)
    const doubled = computed(() => count.value * 2)

    function Counter() {
      const value = useSignal(count)
      const doubleVal = useSignal(doubled)
      const tripled = useComputed(() => count.value * 3)
      return (
        <div>
          <span data-testid="val">{value}</span>
          <span data-testid="double">{doubleVal}</span>
          <span data-testid="triple">{tripled}</span>
        </div>
      )
    }

    const { container } = mount(<Counter />)
    expect(container.querySelector('[data-testid="val"]')?.textContent).toBe('1')
    expect(container.querySelector('[data-testid="double"]')?.textContent).toBe('2')
    expect(container.querySelector('[data-testid="triple"]')?.textContent).toBe('3')

    act(() => {
      count.value = 5
    })
    expect(container.querySelector('[data-testid="val"]')?.textContent).toBe('5')
    expect(container.querySelector('[data-testid="double"]')?.textContent).toBe('10')
    expect(container.querySelector('[data-testid="triple"]')?.textContent).toBe('15')
  })

  it('disposes useReactiveScope cleanly on unmount', () => {
    const disposed = vi.fn()

    function Scoped() {
      const signal = useReactiveScope(() => {
        const s = ref('alive')
        onScopeDispose(disposed)
        return s
      })
      const text = useSignal(signal)
      return <span>{text}</span>
    }

    const tree = mount(<Scoped />)
    expect(tree.container.textContent).toBe('alive')
    expect(disposed).not.toHaveBeenCalled()

    tree.unmount()
    expect(disposed).toHaveBeenCalledTimes(1)
  })

  it('exports the exact locked 32 Phase-1 component modules and symbols', () => {
    expect(REACT_COMPONENT_IDS).toHaveLength(32)
    expect([...REACT_COMPONENT_IDS].sort()).toEqual([...LOCKED_32_IDS].sort())

    const byTier = { A: 0, B: 0, C: 0 }
    for (const id of LOCKED_32_IDS) {
      const entry = REACT_COMPONENTS_MANIFEST[id]
      expect(entry).toBeDefined()
      expect(entry!.status).toBe('ready')
      expect(entry!.sampleTsx.length).toBeGreaterThan(0)
      byTier[entry!.tier] += 1

      for (const symbol of entry!.exports) {
        expect((TuffexReact as Record<string, unknown>)[symbol], `Missing export ${symbol}`).toBeDefined()
      }
    }

    expect(byTier).toEqual({ A: 18, B: 12, C: 2 })
  })
})
