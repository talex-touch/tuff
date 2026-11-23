// Ported from border-beam/src/pulseDriver.ts
// (https://github.com/Jakubantalik/Libraries). MIT License © 2026 Jakub Antalik.
// Framework-free module kept intentionally close to upstream; local deviations
// are limited to strict-TS (noUncheckedIndexedAccess) hardening so upstream
// fixes stay diffable.

import type { PulseDriverConfig } from './styles';

/**
 * Shared breathing driver for the Pulse effects.
 *
 * The pulse breathing (size / drift / per-quadrant opacity / height) and the
 * slow hue drift used to run as ~15 per-instance CSS `@property` keyframe
 * animations at the display refresh rate (60–120 Hz). Because each value feeds
 * the painted gradients/filters, that repainted the breathing layers 60–120×/s.
 *
 * The motion is very slow (1.6–6.4 s periods), so instead every registered
 * instance is driven from a SINGLE shared requestAnimationFrame loop throttled
 * to ~30 fps. This halves the paint frequency on 60 Hz displays and quarters it
 * on 120 Hz, with no perceptible change to the breathing.
 *
 * Each oscillator ping-pongs a CSS custom property between `a` and `b` with an
 * ease-in-out (cosine) curve over `period` seconds, offset by `delay` seconds so
 * otherwise-identical oscillators desync (matching the former CSS keyframes +
 * animation-delay).
 */

interface PulseInstance {
  el: HTMLElement;
  config: PulseDriverConfig;
}

const instances = new Set<PulseInstance>();
let rafId: number | null = null;
let lastFrame = 0;
let envListenersAttached = false;
let documentHidden = false;
let windowFocused = true;
let lowBatteryMotion = false;
let lowBatteryObserver: MutationObserver | null = null;

// ~30 fps. Subtract a small slack so a frame that lands a hair early still runs.
const FRAME_INTERVAL = 1000 / 30 - 2;

const TWO_PI = Math.PI * 2;

function readDocumentHidden(): boolean {
  return typeof document !== 'undefined' ? Boolean(document.hidden) : false;
}

function readWindowFocused(): boolean {
  return typeof document !== 'undefined' && typeof document.hasFocus === 'function'
    ? document.hasFocus()
    : true;
}

function readLowBatteryMotion(): boolean {
  return typeof document !== 'undefined'
    ? document.documentElement?.getAttribute('data-low-battery-motion') === '1'
    : false;
}

function isEnvironmentPaused(): boolean {
  return documentHidden || !windowFocused || lowBatteryMotion;
}

/** Cosine ease-in-out factor in [0, 1]: 0 at phase 0/1, 1 at phase 0.5. */
function pingPong(phase: number): number {
  return (1 - Math.cos(TWO_PI * phase)) / 2;
}

function frame(ts: number): void {
  rafId = null;
  if (instances.size === 0 || isEnvironmentPaused()) return;

  rafId = requestAnimationFrame(frame);

  if (ts - lastFrame < FRAME_INTERVAL) return;
  lastFrame = ts;

  const tSec = ts / 1000;

  instances.forEach(({ el, config }) => {
    for (const osc of config.oscillators) {
      // Match CSS animation-delay semantics: a positive delay starts later.
      const phase = (tSec - osc.delay) / osc.period;
      const value = osc.a + (osc.b - osc.a) * pingPong(phase);
      el.style.setProperty(
        osc.prop,
        osc.unit === 'px' ? `${value.toFixed(2)}px` : value.toFixed(4)
      );
    }

    if (config.hue) {
      const { prop, range, period, continuous } = config.hue;
      // `continuous` rotates a full circle (0→range, looping) so every color
      // sweeps through every edge; otherwise drift between -range and +range.
      const value = continuous
        ? ((tSec / period) % 1) * range
        : -range + 2 * range * pingPong(tSec / period);
      el.style.setProperty(prop, `${value.toFixed(2)}deg`);
    }
  });
}

function startLoop(): void {
  if (rafId == null && instances.size > 0 && !isEnvironmentPaused()) {
    lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }
}

function stopLoop(): void {
  if (rafId != null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  lastFrame = 0;
}

function syncLoop(): void {
  if (instances.size === 0 || isEnvironmentPaused()) {
    stopLoop();
  } else {
    startLoop();
  }
}

function onVisibilityChange(): void {
  documentHidden = readDocumentHidden();
  if (!documentHidden) {
    if (typeof document !== 'undefined' && typeof document.hasFocus === 'function' && !document.hasFocus()) {
      windowFocused = false;
    }
    lowBatteryMotion = readLowBatteryMotion();
  }
  syncLoop();
}

function onWindowFocus(): void {
  windowFocused = true;
  lowBatteryMotion = readLowBatteryMotion();
  syncLoop();
}

function onWindowBlur(): void {
  windowFocused = false;
  syncLoop();
}

function attachEnvListeners(): void {
  if (envListenersAttached) return;
  envListenersAttached = true;
  documentHidden = readDocumentHidden();
  windowFocused = readWindowFocused();
  lowBatteryMotion = readLowBatteryMotion();

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      lowBatteryObserver = new MutationObserver(() => {
        lowBatteryMotion = readLowBatteryMotion();
        syncLoop();
      });
      lowBatteryObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-low-battery-motion'],
      });
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', onWindowFocus);
    window.addEventListener('blur', onWindowBlur);
  }
}

function detachEnvListeners(): void {
  if (!envListenersAttached) return;
  envListenersAttached = false;
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  }
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', onWindowFocus);
    window.removeEventListener('blur', onWindowBlur);
  }
  lowBatteryObserver?.disconnect();
  lowBatteryObserver = null;
}

function stopLoopIfIdle(): void {
  if (instances.size === 0) {
    stopLoop();
    detachEnvListeners();
  }
}

/**
 * Register an element to be driven by the shared pulse loop.
 *
 * @returns a cleanup function that unregisters the instance (and stops the
 *          shared loop once no instances remain).
 */
export function registerPulseInstance(
  el: HTMLElement,
  config: PulseDriverConfig
): () => void {
  const instance: PulseInstance = { el, config };
  if (instances.size === 0) {
    attachEnvListeners();
  }
  instances.add(instance);
  syncLoop();

  return () => {
    instances.delete(instance);
    stopLoopIfIdle();
  };
}
