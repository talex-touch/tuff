import type { BaseAnchorAnimationOptions, BaseAnchorAnimationType } from '../src/types'
import { describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'
import { useBaseAnchorMotion } from '../src/base-anchor-motion'

/**
 * Drive the motion composable directly — it only needs `computed`, and jsdom has
 * no layout, so DOM-level timing assertions would be meaningless anyway.
 */
function createMotion(animation: BaseAnchorAnimationOptions) {
  return useBaseAnchorMotion({
    clipRef: ref(null),
    contentRef: ref(null),
    arrowRef: ref(null),
    side: computed(() => 'bottom' as const),
    alignment: computed(() => 'center' as const),
    arrowSize: computed(() => 10),
    showArrow: computed(() => false),
    animation: computed(() => animation),
    panelBackground: computed(() => 'refraction'),
    useCard: computed(() => true),
    keepAliveContent: computed(() => false),
    isOpen: computed(() => false),
    isCurrentRun: () => true,
    setMounted: () => {},
    setPanelSurfaceMoving: () => {},
    pulsePanelSurfaceMoving: () => {},
    prepareLiquid: () => false,
    applyLiquidFrame: () => {},
    settleLiquid: () => {},
    prefersReducedMotion: () => false,
  })
}

function resolve(animation: BaseAnchorAnimationOptions) {
  return createMotion(animation).resolvedAnimation.value
}

const ALL_TYPES: BaseAnchorAnimationType[] = [
  'transfer',
  'boom',
  'opacity',
  'none',
  'drip',
  'bead',
  'expand',
]

/** Fields every type shares, whatever its own table says. */
const LIQUID_TAIL = {
  gooBlur: 4.5,
  gooThreshold: 20,
  gooThresholdOffset: -9,
  seedHeight: 12,
  beadPinch: 60,
  beadVelocityRef: 4,
  itemSelector: '[data-liquid-item]',
}

const CLASSIC_ERA = {
  duration: 432,
  closeDuration: 194.4,
  ease: 'back.out(2)',
  closeEase: 'power3.in',
  distance: 30,
  scale: 1.08,
  blur: 12,
  opacity: 0,
  ...LIQUID_TAIL,
}

const LIQUID_ERA = {
  duration: 260,
  closeDuration: 150,
  ease: 'linear',
  closeEase: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
  distance: 30,
  scale: 1.08,
  blur: 12,
  opacity: 0,
  ...LIQUID_TAIL,
}

const EXPAND_ERA = {
  duration: 400,
  closeDuration: 240,
  ease: 'spring(10, 0.6)',
  closeEase: 'power2.in',
  distance: 12,
  scale: 0.88,
  blur: 12,
  opacity: 0,
  ...LIQUID_TAIL,
}

/**
 * Captured from the implementation *before* open/close resolution was split by
 * phase, so it cannot be self-confirming: if the refactor shifts any field for
 * any type, this table disagrees.
 *
 * The point is narrow and load-bearing — the anchor's motion was tuned frame by
 * frame against a reference capture, so "adds a capability" must mean the
 * existing output is untouched, not merely that it still looks plausible.
 */
const FROZEN_BASELINE: Record<string, Record<string, unknown>> = {
  // `transfer` deliberately left the shared classic table too: it now slides
  // in slightly small and lets its back ease swing it past full — the scale
  // bounce is a requested change, not refactor drift.
  transfer: { type: 'transfer', ...CLASSIC_ERA, scale: 0.92 },
  // `boom` deliberately left the shared classic table: it now seeds below 1 so
  // the panel scales *up* out of the blur instead of being pushed away.
  boom: { type: 'boom', ...CLASSIC_ERA, scale: 0.94 },
  opacity: { type: 'opacity', ...CLASSIC_ERA },
  none: { type: 'none', ...CLASSIC_ERA },
  drip: { type: 'drip', ...LIQUID_ERA },
  bead: { type: 'bead', ...LIQUID_ERA },
  expand: { type: 'expand', ...EXPAND_ERA },
}

describe('base anchor animation phases', () => {
  describe('equivalence with the pre-split resolver', () => {
    it.each(ALL_TYPES)('resolves %s exactly as before', (type) => {
      const resolved = resolve({ type })
      const expected = FROZEN_BASELINE[type]!

      for (const [field, value] of Object.entries(expected))
        expect({ field, value: resolved[field as keyof typeof resolved] }).toEqual({ field, value })
    })

    it('makes the untyped default symmetric spring expand', () => {
      // Decision reversed 08-15: only the tooltip zooms with boom (it pins the
      // type itself); everything untyped expands both ways.
      const resolved = resolve({})
      expect(resolved.type).toBe('expand')
      expect(resolved.closeType).toBe('expand')
      expect(resolved.closeDuration).toBe(EXPAND_ERA.closeDuration)
      expect(resolved.closeEase).toBe(EXPAND_ERA.closeEase)
    })

    it('keeps an explicit type symmetric', () => {
      // Pinning a type must stay predictable: `type: 'boom'` closes as boom
      // unless the caller also names a `closeType`.
      expect(resolve({ type: 'boom' }).closeType).toBe('boom')
      expect(resolve({ type: 'transfer' }).closeType).toBe('transfer')
    })

    it('still lets an explicit option beat the type table', () => {
      const resolved = resolve({ type: 'expand', duration: 300, scale: 0.9 })
      expect(resolved.duration).toBe(300)
      expect(resolved.scale).toBe(0.9)
      // Untouched fields keep the expand table rather than falling back to the
      // legacy transfer-era props.
      expect(resolved.closeDuration).toBe(EXPAND_ERA.closeDuration)
      expect(resolved.ease).toBe(EXPAND_ERA.ease)
    })
  })

  describe('closeType', () => {
    it('defaults to the open type, so omitting it changes nothing', () => {
      for (const type of ALL_TYPES)
        expect(resolve({ type }).closeType).toBe(type)
    })

    it('drives the close phase from its own type table', () => {
      // boom in, expand out: the close timing has to come from expand's table,
      // not from boom's transfer-era one.
      const resolved = resolve({ type: 'boom', closeType: 'expand' })

      expect(resolved.type).toBe('boom')
      expect(resolved.closeType).toBe('expand')
      expect(resolved.duration).toBe(CLASSIC_ERA.duration)
      expect(resolved.ease).toBe(CLASSIC_ERA.ease)
      expect(resolved.closeDuration).toBe(EXPAND_ERA.closeDuration)
      expect(resolved.closeEase).toBe(EXPAND_ERA.closeEase)
    })

    it('lets an explicit closeDuration beat the closeType table', () => {
      const resolved = resolve({ type: 'boom', closeType: 'expand', closeDuration: 90 })
      expect(resolved.closeDuration).toBe(90)
    })
  })

  describe('exit geometry', () => {
    it('falls back to the shared fields when absent', () => {
      const resolved = resolve({ type: 'boom', scale: 0.94, blur: 8 })
      expect(resolved.exit.scale).toBe(0.94)
      expect(resolved.exit.blur).toBe(8)
    })

    it('overrides only the fields it names', () => {
      // `scale` means opposite things per type — boom starts at 1.08 and shrinks
      // in, expand starts below 1 and grows — so a composite that shares one
      // value is wrong at one end by construction.
      const resolved = resolve({
        type: 'boom',
        scale: 0.94,
        blur: 8,
        closeType: 'expand',
        exit: { scale: 0.97 },
      })

      expect(resolved.scale).toBe(0.94)
      expect(resolved.exit.scale).toBe(0.97)
      expect(resolved.exit.blur).toBe(8)
    })

    it('clamps exit values like the shared ones', () => {
      const resolved = resolve({ type: 'boom', exit: { scale: -5, blur: -3, opacity: 4 } })
      expect(resolved.exit.scale).toBeGreaterThan(0)
      expect(resolved.exit.blur).toBe(0)
      expect(resolved.exit.opacity).toBe(1)
    })
  })

  describe('liquid types cannot be mixed across phases', () => {
    // drip/bead share one measured stage between the two directions — including
    // `usesBeadMotion`, which the template reads — so a half-liquid composite
    // would strand it mid-run, and drip-into-bead would need the stage geometry
    // to change direction while it is live.
    it('falls back to a symmetric run when only the open type is liquid', () => {
      const resolved = resolve({ type: 'drip', closeType: 'expand' })
      expect(resolved.closeType).toBe('drip')
    })

    it('falls back to a symmetric run when only the close type is liquid', () => {
      const resolved = resolve({ type: 'boom', closeType: 'bead' })
      expect(resolved.closeType).toBe('boom')
    })

    it('rejects drip paired with bead as well', () => {
      const resolved = resolve({ type: 'drip', closeType: 'bead' })
      expect(resolved.closeType).toBe('drip')
    })

    it('warns in dev so the silent downgrade is discoverable', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      resolve({ type: 'boom', closeType: 'drip' })
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]![0]).toContain('closeType')
      warn.mockRestore()
    })
  })
})
