import { act, createRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  TxAlert,
  TxAvatar,
  TxBadge,
  TxButton,
  TxCard,
  TxDivider,
  TxDotIndicator,
  TxEmpty,
  TxKbd,
  TxProgress,
  TxProgressBar,
  TxSkeleton,
  TxSpinner,
  TxStatCard,
  TxStatusBadge,
  TxStatusHint,
  TxSwitch,
  TxTag,
} from '../index'
import { cleanupAll, mount } from './render-helper'

afterEach(() => {
  cleanupAll()
})

describe('Tier A components (18 modules)', () => {
  it('TxButton renders variants, loading, progress, status, forwardRef, and blocks click while busy', () => {
    const onClick = vi.fn()
    const ref = createRef<HTMLButtonElement>()
    const tree = mount(
      <TxButton ref={ref} variant="primary" size="lg" onClick={onClick}>
        Submit
      </TxButton>,
    )

    const btn = tree.container.querySelector('button')!
    expect(ref.current).toBe(btn)
    expect(btn.className).toContain('tx-button')
    expect(btn.className).toContain('variant-primary')
    expect(btn.className).toContain('tx-size-lg')

    act(() => {
      btn.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)

    tree.rerender(
      <TxButton variant="primary" loading progress={42} onClick={onClick}>
        Uploading
      </TxButton>,
    )
    expect(btn.disabled).toBe(true)
    expect(btn.getAttribute('aria-busy')).toBe('true')
    expect(tree.container.querySelector('.tx-button__progress-value')?.textContent).toBe('42%')

    act(() => {
      btn.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('TxBadge renders variants, numeric values, dot mode, and open toggle', () => {
    const tree = mount(<TxBadge variant="success" value={9} />)
    const badge = tree.container.querySelector('.tx-badge')!
    expect(badge.className).toContain('tx-badge--success')
    expect(badge.className).toContain('tx-badge--numeric')
    expect(badge.textContent).toBe('9')

    tree.rerender(<TxBadge variant="error" dot open={false} />)
    expect(badge.className).toContain('tx-badge--dot')
    expect(badge.className).toContain('is-closed')
  })

  it('TxTag supports variants, dot, count, clickable role, and closable callback', () => {
    const onClose = vi.fn()
    const onClick = vi.fn()
    const { container } = mount(
      <TxTag label="Beta" variant="soft" pill dot="#22c55e" count={4} closable onClick={onClick} onClose={onClose} />,
    )
    const tag = container.querySelector('.tx-tag')!
    expect(tag.getAttribute('role')).toBe('button')
    expect(container.querySelector('.tx-tag__count')?.textContent).toBe('4')

    const closeBtn = container.querySelector<HTMLButtonElement>('.tx-tag__close')!
    act(() => {
      closeBtn.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('TxAvatar renders initials fallback, image error fallback, and status dot', () => {
    const { container } = mount(<TxAvatar name="Talex Dream" status="online" size={48} clickable />)
    const avatar = container.querySelector('.tx-avatar')!
    expect(avatar.getAttribute('role')).toBe('button')
    expect(container.querySelector('.tx-avatar__text')?.textContent).toBe('TD')
    expect(container.querySelector('.tx-avatar__status--online')).toBeTruthy()
  })

  it('TxSpinner renders status ARIA attributes and fallback SVG mode', () => {
    const tree = mount(<TxSpinner size={24} label="Fetching" fallback />)
    const spinner = tree.container.querySelector('.tx-spinner')!
    expect(spinner.getAttribute('role')).toBe('status')
    expect(spinner.getAttribute('aria-label')).toBe('Fetching')
    expect(tree.container.querySelector('svg.tx-spinner__svg')).toBeTruthy()

    tree.rerender(<TxSpinner visible={false} />)
    expect(tree.container.querySelector('.tx-spinner')).toBeNull()
  })

  it('TxDivider renders separator role, orientation, dashed, and centered text', () => {
    const tree = mount(<TxDivider dashed>OR</TxDivider>)
    const sep = tree.container.querySelector('[role="separator"]')!
    expect(sep.getAttribute('aria-orientation')).toBe('horizontal')
    expect(sep.className).toContain('tx-divider--dashed')
    expect(sep.textContent).toBe('OR')

    tree.rerender(<TxDivider direction="vertical" />)
    expect(tree.container.querySelector('[role="separator"]')?.getAttribute('aria-orientation')).toBe('vertical')
  })

  it('TxAlert renders alert role and dismisses in uncontrolled mode', () => {
    const onClose = vi.fn()
    const { container } = mount(<TxAlert type="warning" title="Heads up" message="Low disk" onClose={onClose} />)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Low disk')

    act(() => {
      container.querySelector<HTMLButtonElement>('.tx-alert__close')!.click()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(container.querySelector('[role="alert"]')).toBeNull()
  })

  it('TxCard renders slots (header/footer/cover), loading overlay, and clickable behavior', () => {
    const onClick = vi.fn()
    const { container } = mount(
      <TxCard header="Header" footer="Footer" shadow="soft" clickable loading onClick={onClick}>
        Body
      </TxCard>,
    )
    const card = container.querySelector<HTMLDivElement>('.tx-card')!
    expect(card.getAttribute('role')).toBe('button')
    expect(container.querySelector('.tx-card__header')?.textContent).toBe('Header')
    expect(container.querySelector('.tx-card__footer')?.textContent).toBe('Footer')
    expect(container.querySelector('.tx-card__loading')).toBeTruthy()

    act(() => {
      card.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('TxKbd renders semantic kbd element with size and tone classes', () => {
    const { container } = mount(<TxKbd size="md" tone="primary">⌘K</TxKbd>)
    const kbd = container.querySelector('kbd.tx-kbd')!
    expect(kbd.className).toContain('tx-kbd--md')
    expect(kbd.className).toContain('tx-kbd--primary')
    expect(kbd.textContent).toBe('⌘K')
  })

  it('TxProgress and TxProgressBar expose progressbar ARIA and fire onComplete at 100%', () => {
    const onComplete = vi.fn()
    const { container } = mount(<TxProgress percentage={100} onComplete={onComplete} />)
    const bar = container.querySelector('[role="progressbar"]')!
    expect(bar.getAttribute('aria-valuenow')).toBe('100')
    expect(onComplete).toHaveBeenCalledTimes(1)

    const segTree = mount(
      <TxProgressBar
        segments={[{ value: 30, label: 'Docs' }, { value: 50, label: 'Code' }]}
        segmentsTotal={100}
        showText
        textPlacement="top"
        detail="80 / 100"
      />,
    )
    expect(segTree.container.querySelectorAll('.tx-progress-bar__segment')).toHaveLength(2)
    expect(segTree.container.querySelector('.tx-progress-bar__head-detail')?.textContent).toBe('80 / 100')
  })

  it('TxSkeleton renders line placeholders when loading and children when loaded', () => {
    const tree = mount(<TxSkeleton loading lines={3} variant="text">Loaded Content</TxSkeleton>)
    expect(tree.container.querySelectorAll('.tx-skeleton__item')).toHaveLength(3)

    tree.rerender(<TxSkeleton loading={false} lines={3}>Loaded Content</TxSkeleton>)
    expect(tree.container.querySelector('.tx-skeleton')).toBeNull()
    expect(tree.container.textContent).toBe('Loaded Content')
  })

  it('TxSwitch works both uncontrolled and controlled with ARIA switch semantics', () => {
    const onChange = vi.fn()
    const { container } = mount(<TxSwitch defaultChecked={false} label="Dark mode" onChange={onChange} />)
    const sw = container.querySelector<HTMLButtonElement>('[role="switch"]')!
    expect(sw.getAttribute('aria-checked')).toBe('false')

    act(() => {
      sw.click()
    })
    expect(sw.getAttribute('aria-checked')).toBe('true')
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('TxStatusBadge, TxStatusHint, TxDotIndicator, TxEmpty, and TxStatCard render accurately', () => {
    const badgeTree = mount(<TxStatusBadge text="Granted" statusKey="granted" os="macos" />)
    expect(badgeTree.container.querySelector('[role="status"]')?.textContent).toBe('Granted')
    expect(badgeTree.container.querySelector('.tx-os-icon')).toBeTruthy()

    const hintTree = mount(<TxStatusHint text="Saved" tone="success" />)
    expect(hintTree.container.querySelector('[role="status"]')?.textContent).toBe('Saved')

    const dotTree = mount(<TxDotIndicator color="#22c55e" ariaLabel="Online" />)
    expect(dotTree.container.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('Online')

    const emptyTree = mount(<TxEmpty title="Empty list" description="Add something" compact action={<button type="button">Add</button>} />)
    expect(emptyTree.container.querySelector('.tx-empty-state__title')?.textContent).toBe('Empty list')
    expect(emptyTree.container.querySelector('.tx-empty-state__actions button')?.textContent).toBe('Add')

    const statTree = mount(
      <TxStatCard value={2500} label="Requests" insight={{ from: 2000, to: 2500 }} meta="Last 24h" />,
    )
    expect(statTree.container.querySelector('[role="group"]')).toBeTruthy()
    expect(statTree.container.querySelector('.tx-stat-card__value')?.textContent).toBe('2,500')
    expect(statTree.container.querySelector('.tx-stat-card__insight')?.textContent).toContain('+25%')
  })
})
