import { rubberband } from '../../../../utils/gesture'

// The view math the preview shares with the maps is utils/pan-zoom's; these types match its own,
// declared here because the published declarations carry no internal util.

/**
 * Where the current image is drawn: `translate(tx, ty) scale(k)` over its natural size, in stage
 * pixels. `k` is the zoom against the image's own pixels, so 1 is 100%.
 */
export interface PreviewView {
  k: number
  tx: number
  ty: number
}

export interface PreviewSize {
  width: number
  height: number
}

/** A box on the stage, in stage pixels. */
export interface PreviewBox {
  x: number
  y: number
  width: number
  height: number
}

export interface PreviewPoint {
  x: number
  y: number
}

/** How far each translation may go at one scale: `[min, max]` per axis. */
export interface PreviewBounds {
  tx: [number, number]
  ty: [number, number]
}

/** The scale at which the whole image fits `box`. A small image is never blown up past its own pixels. */
export function fitScale(image: PreviewSize, box: PreviewBox): number {
  if (!(image.width > 0) || !(image.height > 0) || !(box.width > 0) || !(box.height > 0))
    return 1
  return Math.min(1, box.width / image.width, box.height / image.height)
}

/** The whole image, centred in `box`. */
export function fitView(image: PreviewSize, box: PreviewBox): PreviewView {
  const k = fitScale(image, box)
  return {
    k,
    tx: box.x + (box.width - image.width * k) / 2,
    ty: box.y + (box.height - image.height * k) / 2,
  }
}

function axisBounds(size: number, boxStart: number, boxSize: number, stageSize: number): [number, number] {
  if (size > stageSize)
    return [stageSize - size, 0]
  // Narrower than the stage: held centred on the fit box, so it never floats off to one side, and
  // inside the stage, where the box sits off centre under the chrome.
  const centred = Math.max(0, Math.min(stageSize - size, boxStart + (boxSize - size) / 2))
  return [centred, centred]
}

/**
 * Pan limits at scale `k`. Along an axis where the image is larger than the stage it keeps the
 * stage covered; where it is smaller it does not move.
 */
export function panBounds(k: number, image: PreviewSize, box: PreviewBox, stage: PreviewSize): PreviewBounds {
  return {
    tx: axisBounds(image.width * k, box.x, box.width, stage.width),
    ty: axisBounds(image.height * k, box.y, box.height, stage.height),
  }
}

/**
 * A pinched scale as drawn: inside `[min, max]` it follows the fingers, and past either end it
 * resists, measured in octaves, so pinching out twice as far shows as about 1.4 times.
 */
export function resistScale(k: number, min: number, max: number): number {
  if (k < min)
    return min * 2 ** rubberband(Math.log2(k / min), 1)
  if (k > max)
    return max * 2 ** rubberband(Math.log2(k / max), 1)
  return k
}

/**
 * Where a double-click or a double-tap zooms to: at least twice the fit, and up to the image's
 * own pixels when those are no more than four times as far, so a large photo opens to the detail
 * and a screenshot to 100%.
 */
export function detailScale(fit: number, max: number): number {
  return Math.max(fit, Math.min(max, Math.max(fit * 2, Math.min(1, fit * 4))))
}

const ZOOM_PRESETS = [0.25, 0.5, 1, 2, 4, 8, 16]

/**
 * The scales the zoom readout's menu offers below the whole picture: 100% and its halvings and
 * doublings, those past the fit and no further than `max`.
 */
export function zoomPresets(fit: number, max: number): number[] {
  return ZOOM_PRESETS.filter(k => k > fit * (1 + 1e-3) && k <= max * (1 + 1e-3))
}

/** `WheelEvent` with the legacy deltas Chromium and WebKit still report. */
export interface LegacyWheel {
  deltaMode: number
  deltaX: number
  deltaY: number
  wheelDeltaX?: number
  wheelDeltaY?: number
}

/**
 * Whether a plain wheel event is a mouse wheel's notch rather than a trackpad's two-finger
 * scroll. No browser names the device, so this reads what each reports: Firefox counts a mouse
 * wheel in lines, and Chromium and WebKit count it in whole notches of 120 in the legacy
 * `wheelDelta`, where a trackpad's pixels come out as fractions of one.
 */
export function isNotchWheel(event: LegacyWheel): boolean {
  if (event.deltaMode !== 0)
    return true
  const legacy = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.wheelDeltaY : event.wheelDeltaX
  return typeof legacy === 'number' && legacy !== 0 && legacy % 120 === 0
}
