// Ported from metal-fx/src/types.ts
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.
// React-specific members are dropped: Vue covers `children` through the default
// slot, `className`/`style` through attribute fallthrough (the wrapper merges
// them exactly like upstream's `className ? \`metal-fx-root ${className}\`` and
// `{ ...style, ... }` do), and `ReactNode`/`CSSProperties`/`HTMLAttributes`/
// `React.RefObject<T | null>` map to `VNodeChild`/`CSSProperties`/
// `HTMLAttributes`/`Ref<T | null>`.
//
// Local additions (placement only, values byte-identical to upstream):
// `TextInnerShadow` / `MetalBadgeCore` and the two frozen default bags live
// here rather than next to their components — upstream declares them inside
// `MetalText.tsx` / `MetalBadge.tsx`, which Vue renders as single-file
// components that cannot export extra bindings.

import type { HTMLAttributes, Ref } from 'vue';
import type { MaskFn } from './engine/renderer/core';

/**
 * Variant for the metal effect.
 * - 'button' (default): pill-shaped 134×40 baseline with shaderScale 1.6
 * - 'circle': compact 32×32 circle baseline with shaderScale 1.3
 *
 * In practice the wrapped child's measured dimensions drive the visible size —
 * the variant only controls the shader sampling scale and ring thickness.
 */
export type MetalFxVariant = 'button' | 'circle';

/**
 * Theme mode for the metal effect.
 *
 * - `auto` (default): follows the user's `prefers-color-scheme` and updates
 *   live when the OS / browser theme changes (also gracefully falls back to
 *   `dark` during SSR or when `matchMedia` is unavailable).
 * - `dark`: pin to the dark-mode tunings regardless of system preference.
 * - `light`: pin to the light-mode tunings regardless of system preference.
 *
 * Drive this from your app's theme state if you have a manual toggle that
 * doesn't follow the OS — otherwise `auto` is the right default.
 */
export type MetalFxTheme = 'dark' | 'light' | 'auto';

/**
 * Bundled preset names. Each preset ships both a dark and light mode block.
 */
export type MetalFxPreset = 'chromatic' | 'silver' | 'gold';

/**
 * A reflection target: either a bare element/ref, or a ref plus a per-target
 * `strength` multiplier (0..1+). Use the object form when a surface should
 * only catch a faint echo of the metal — a container the button sits inside,
 * for example — without turning down every other target.
 *
 * Upstream accepts `RefObject<HTMLElement | null>` (React refs are always
 * objects); Vue template refs are `Ref`s, and a resolved element is accepted
 * too so a `shallowRef`-free DOM lookup stays ergonomic.
 */
export type MetalFxReflectionTarget =
  | HTMLElement
  | Ref<HTMLElement | null>
  | { ref: Ref<HTMLElement | null>; strength?: number };

/**
 * Props for the MetalFx component.
 *
 * `children` / `className` / `style` travel as slot + template attributes
 * (`class`/`style` are merged onto the root element by the wrapper itself, so
 * the component declares `inheritAttrs: false` and re-applies them).
 */
export interface MetalFxProps extends /* @vue-ignore */ Omit<HTMLAttributes, 'children'> {
  /**
   * Variant — controls the shader sampling scale + ring width.
   * - `button` (default): pill-style ring at 1 px wide, scale 1.6
   * - `circle`: compact circle with a 2 px ring, scale 1.3
   */
  variant?: MetalFxVariant;

  /**
   * Color preset. All three presets ship both dark and light mode tunings —
   * `theme` picks the right side at runtime.
   * @default 'chromatic'
   */
  preset?: MetalFxPreset;

  /**
   * Theme mode. `'auto'` (default) resolves via
   * `matchMedia('(prefers-color-scheme: dark)')` and switches live when the
   * OS theme changes. Pass `'dark'` or `'light'` to pin a specific mode.
   * @default 'auto'
   */
  theme?: MetalFxTheme;

  /**
   * Effect strength (0..1). Multiplies the shader bitmap opacity and the glow
   * SVG alpha. The shader continues to animate at full intensity at any value;
   * only the rendered alpha onto the host is scaled. Lighter values let the
   * underlying child surface show through more strongly.
   * @default 1
   */
  strength?: number;

  /**
   * Multiplier on the glow only (halo + catch-light), on top of `strength`.
   * Use it when the shader runs at low `strength` but the glow should still
   * read — e.g. metal text. Clamped to 0..1 after multiplying.
   * @default 1
   */
  glowGain?: number;

  /**
   * Pause the shader animation. The visible canvas keeps the last painted
   * frame so the metal silhouette stays on screen.
   * @default false
   */
  paused?: boolean;

  /**
   * Optional explicit border radius (CSS px). When omitted, MetalFx reads the
   * computed border-radius of the wrapped child each resize.
   */
  borderRadius?: number;

  /**
   * When true, MetalFx normalizes the host element's outer chrome (border /
   * outline / box-shadow) so user-provided component styles don't clash with
   * the metal ring. Inner fills, typography, and content remain untouched.
   * @default true
   */
  normalizeHostStyles?: boolean;

  /**
   * Neighbour elements that should receive a soft proximity reflection of the
   * metal effect. Reflections only render when the resolved theme is `dark` —
   * pass-through in light mode (no DOM scan, no per-frame work).
   *
   * Pass refs (or live elements) to the sibling DOM elements you want to
   * receive the reflection (chips next to a send button, search field next to
   * an Upgrade pill, ...).
   *
   * A target that *contains* the wrapped element (its parent card, say)
   * receives the reflection on both the nearest vertical and horizontal
   * inner edges. Pair with `{ ref, strength }` to keep that subtle.
   */
  reflectionTargets?: ReadonlyArray<MetalFxReflectionTarget>;

  /**
   * Disable the wandering halo overlay. The shader ring still renders.
   * @default false
   */
  disableGlow?: boolean;

  /**
   * Light rim along the top inside edge of the ring — an inner shadow from
   * above, like the one on metal text. `true` uses the design defaults
   * (white 90 %, offset 1 px, blur 0.5 px); pass an object to tune.
   * @default undefined (off)
   */
  innerShadow?: boolean | { offsetY?: number; blur?: number; alpha?: number; color?: string };

  /**
   * Override the shader sampling scale. Larger values zoom into the shared
   * shader (visibly bigger pattern features); smaller values zoom out.
   * Defaults to the variant's baseline (1.6 for `'button'`, 1.3 for
   * `'circle'`) multiplied by `scale`.
   */
  shaderScale?: number;

  /**
   * Override the ring thickness in CSS pixels. Defaults to the variant's
   * baseline (1 for `'button'`, 2 for `'circle'`) multiplied by `scale`.
   */
  ringCssPx?: number;

  /**
   * Master scale multiplier for every absolute-pixel constant the engine
   * uses internally. Set this when you render the wrapped element at a
   * non-1× size (e.g. inside a CSS `zoom: 2` container, or when you've
   * doubled all your Tailwind sizes by hand). It scales:
   *   - shader sampling (so pattern features grow proportionally)
   *   - ring thickness on the canvas
   *   - glow SVG stroke widths, blur radii, fade-circle radius, and the
   *     small inset/outward offsets that position the catch-light
   *   - reflection canvas stroke band, border-highlight thickness, and the
   *     reference draw width baseline
   * @default 1
   */
  scale?: number;

  /**
   * Custom alpha mask painter. When set, the shader is kept only where the
   * mask paints (device px, origin at the wrapper's top-left) and the ring
   * punch is skipped — for metal-filled text or glyphs. Pair with
   * `disableGlow`; the glow assumes a ring perimeter.
   */
  mask?: MaskFn;

  /**
   * How the glow is placed when `mask` is set. `'mask'` (default) samples
   * points inside the mask and clips the halo to it — right for metal text.
   * `'ring'` keeps the rounded-rect perimeter behaviour — a halo along the
   * element's edge — for a full-fill mask like a badge.
   */
  glowMode?: 'mask' | 'ring';
}

/**
 * Public handle exposed by `TxMetalFx` through `defineExpose`, carrying the
 * wrapped root element.
 *
 * Upstream forwards that node directly as the `forwardRef` value; Vue has no
 * ref-as-value equivalent for components, so the element travels on a named
 * handle (`<TxMetalFx ref="fx" />` → `fx.value?.el`).
 */
export interface MetalFxRef {
  el: HTMLDivElement | null;
}

/**
 * Figma inner shadow on the text (1471:40930): white 90 %, offset 0/1,
 * blur 0.5 — a hairline of light along the top inside edge of every glyph.
 * CSS has no inner shadow for text, so it's computed: glyph alpha minus the
 * same alpha shifted down by the offset leaves exactly that top rim, which is
 * then blurred and drawn white on an overlay above the metal.
 */
export interface TextInnerShadow { offsetY: number; blur: number; alpha: number }

/** Upstream default for `MetalText`'s `innerShadow`. */
export const FIGMA_INNER_SHADOW: TextInnerShadow = { offsetY: 1, blur: 0.5, alpha: 0.9 };
/** Tuned on the demo's "Plan Pro" card. */
export const METAL_TEXT_DEFAULTS = Object.freeze({ metalOpacity: 0.62, shaderScale: 2.8, glowGain: 2.5, innerShadow: FIGMA_INNER_SHADOW });

/**
 * Props for the `TxMetalText` component.
 *
 * The label is normally the default slot (`<TxMetalText>Pro</TxMetalText>`);
 * `children` is the upstream React spelling and still works as a fallback when
 * the slot is empty. The glyph mask and the `aria-label` are painted from
 * whichever text actually renders.
 */
export interface MetalTextProps {
  /** Fallback label when the default slot is empty (upstream React prop). */
  children?: string;
  /** CSS `font` shorthand for the live span, e.g. `500 24px/1 Inter, sans-serif`. */
  font: string;
  /** Base text colour from the design; the metal composites over it. */
  color: string;
  strength?: number;
  theme?: MetalFxTheme;
  reflectionTargets?: ReadonlyArray<MetalFxReflectionTarget>;
  /** Top-edge light rim inside the glyphs. Pass null to disable. */
  innerShadow?: TextInnerShadow | null;
  /** Halo on the glyphs. Off by default — the design has none. */
  glow?: boolean;
  /** Glow multiplier when `glow` is on. */
  glowGain?: number;
  /** How much metal shows over the base colour (0..1), multiplied with `strength`. */
  metalOpacity?: number;
  /** Zoom of the metal inside the glyphs. */
  shaderScale?: number;
}

/** White core under a metal badge's label. */
export interface MetalBadgeCore { r: number; blur: number; a: number; size: number }

/** Tuned on the demo's "Live mode · New" card. */
export const METAL_BADGE_DEFAULTS = Object.freeze({
  metalOpacity: 0.8,
  shaderScale: 1.6,
  /** White core under the label: solid radius (% of ellipse), ramp width, opacity, ellipse size (% of box). */
  core: Object.freeze({ r: 46, blur: 100, a: 0.94, size: 49 }) as MetalBadgeCore,
  gradient: 0,
  glow: 0.41,
});

/** Props for the `TxMetalBadge` component. */
export interface MetalBadgeProps {
  /** Badge label. Annotated with `aria-label` on the pill's text layer. */
  children?: string;
  strength?: number;
  theme?: MetalFxTheme;
  /** Size multiplier on the Figma metrics (45×25, 12.222px). */
  scale?: number;
  reflectionTargets?: ReadonlyArray<MetalFxReflectionTarget>;
  /** How much metal shows over the white fill (0..1), multiplied with `strength`. */
  metalOpacity?: number;
  shaderScale?: number;
  core?: MetalBadgeCore;
  /** Top→bottom white wash strength (0..1). */
  gradient?: number;
  /** Inner white glow strength (0..1). */
  glow?: number;
  textColor?: string;
}

/**
 * Discriminates the bare-element shape of `MetalFxReflectionTarget` without
 * touching the DOM (no `HTMLElement` during SSR). Type guard so the callers
 * keep their narrowing.
 */
export function isElementTarget(target: MetalFxReflectionTarget): target is HTMLElement {
  return typeof HTMLElement !== 'undefined' && target instanceof HTMLElement;
}
