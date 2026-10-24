import type { CSSProperties, Ref } from 'vue'
import type { FlightPose, PreviewFlight } from './flight'
import type { ImagePreviewItem } from './types'
import type { PreviewGestures } from './use-preview-gestures'
import type { PreviewPictures } from './use-preview-pictures'
import type { PreviewBox, PreviewSize, PreviewView } from './zoom'
import { computed, shallowRef, watch } from 'vue'
import { lerpPose, poseStyles, viewPose } from './flight'
import { SLIDE_GAP } from './use-preview-gestures'
import { fitView } from './zoom'

// The pages: the current picture with a neighbour waiting either side, each as drawn. A slide's
// picture sits in a frame, the window of it shown. At rest that is all of it, drawn at its view;
// in flight the frame is the thumbnail's crop, opening out on the way. ImagePreviewSlide draws them.

/** How far a closing drag shrinks the picture, at its furthest. */
const DISMISS_SHRINK = 0.25

export interface PreviewSlide {
  index: number
  offset: -1 | 0 | 1
  item: ImagePreviewItem
}

/** A slide as ImagePreviewSlide draws it. */
export interface DrawnSlide extends PreviewSlide {
  key: string
  /** Its picture flies between its thumbnail and the stage. */
  flying: boolean
  /** Out of sight while a picture flies home. */
  hidden: boolean
  /** Where the slide sits across the stage; a flight carries itself. */
  style: CSSProperties | undefined
  frame: Record<string, string>
  picture: Record<string, string>
  /** The thumbnail's pixels standing in until the picture loads. */
  standIn: string | null
  loaded: boolean
  failed: boolean
  /** Where the placeholder shimmers, in the picture's place, while it loads. */
  placeholder: CSSProperties | null
}

export interface PreviewSlidesOptions {
  items: () => readonly ImagePreviewItem[]
  current: Readonly<Ref<number>>
  gestures: PreviewGestures
  pictures: PreviewPictures
  stageSize: () => PreviewSize
  fitBox: () => PreviewBox
  /** The picture in the air, if one is. */
  flight: () => PreviewFlight | null
  /** How far the flight has come, 0 at the thumbnail and 1 on the stage. */
  presence: () => number
  closing: () => boolean
}

export interface PreviewSlides {
  drawnSlides: Readonly<Ref<DrawnSlide[]>>
  /** Where a picture is fitted, as a style: a failed picture's message fills it. */
  boxStyle: Readonly<Ref<CSSProperties>>
  /** The current picture as drawn now, `size` big, with its slide's shift and a closing drag's pull. */
  drawnPose: (size: PreviewSize) => FlightPose
  /**
   * A page turned: a zoomed or turned picture paged away from keeps its view while it slides out
   * of sight, as the page turns halfway through the slide.
   */
  holdOutgoing: () => void
}

function orient(size: PreviewSize, turns: number): PreviewSize {
  return Math.abs(turns) % 2 === 1 ? { width: size.height, height: size.width } : size
}

export function usePreviewSlides(options: PreviewSlidesOptions): PreviewSlides {
  const { gestures, pictures } = options

  const outgoing = shallowRef<{ index: number, view: PreviewView, turns: number, angle: number } | null>(null)

  function holdOutgoing(): void {
    const view = gestures.view.value
    const turns = gestures.turns.value
    outgoing.value = view && gestures.moving.value && (gestures.zoomed.value || turns % 4 !== 0)
      ? { index: options.current.value, view, turns, angle: gestures.angle.value }
      : null
  }

  watch(gestures.moving, (moving) => {
    if (!moving)
      outgoing.value = null
  })

  const slides = computed<PreviewSlide[]>(() => {
    const items = options.items()
    const current = options.current.value
    const list: PreviewSlide[] = []
    for (const offset of [-1, 0, 1] as const) {
      const item = items[current + offset]
      if (item)
        list.push({ index: current + offset, offset, item })
    }
    return list
  })

  function restPose(slide: PreviewSlide, size: PreviewSize): FlightPose {
    const stage = options.stageSize()
    if (slide.offset === 0) {
      const oriented = orient(size, gestures.turns.value)
      return viewPose(gestures.view.value ?? fitView(oriented, options.fitBox()), oriented, gestures.angle.value, stage)
    }
    const frozen = outgoing.value?.index === slide.index ? outgoing.value : null
    if (frozen) {
      const oriented = orient(size, frozen.turns)
      return viewPose(frozen.view, oriented, frozen.angle, stage)
    }
    return viewPose(fitView(size, options.fitBox()), size, 0, stage)
  }

  /** Where a slide sits across the stage: a page either side of the current one, moved by a swipe. */
  function slideX(slide: PreviewSlide): number {
    return slide.offset * (options.stageSize().width + SLIDE_GAP) + gestures.track.value
  }

  function slideStyle(slide: PreviewSlide): CSSProperties {
    const x = slideX(slide)
    if (slide.offset !== 0)
      return { transform: `translate3d(${x}px, 0, 0)` }
    const { x: dx, y: dy } = gestures.dismiss.value
    const scale = 1 - gestures.dismissProgress.value * DISMISS_SHRINK
    return { transform: `translate3d(${x + dx}px, ${dy}px, 0) scale(${scale})` }
  }

  function drawnPose(size: PreviewSize): FlightPose {
    const oriented = orient(size, gestures.turns.value)
    const view = gestures.view.value ?? fitView(oriented, options.fitBox())
    const { x, y } = gestures.dismiss.value
    return viewPose(view, oriented, gestures.angle.value, options.stageSize(), {
      x: gestures.track.value + x,
      y,
      scale: 1 - gestures.dismissProgress.value * DISMISS_SHRINK,
    })
  }

  /**
   * Where a picture flying out lands: as drawn now, posed for the copy that flies, `size` big. That
   * copy can be its thumbnail's pixels standing in, while the view is measured in the picture's own,
   * which may load mid-air. One paged away from mid-air lands where it waits beside the current one.
   */
  function landingPose(slide: PreviewSlide, size: PreviewSize): FlightPose {
    const own = pictures.isFailed(slide.item.url) ? undefined : pictures.sizes.value.get(slide.item.url)
    const base = own ?? size
    // A neighbour at rest has its place across from its slide; a flight is drawn without one.
    const rest = slide.offset === 0 ? null : restPose(slide, base)
    const pose = rest ? { ...rest, x: rest.x + slideX(slide) } : drawnPose(base)
    return base.width === size.width ? pose : { ...pose, k: (pose.k * base.width) / size.width }
  }

  /** In the picture's place, at the shape it is expected at. */
  function placeholderStyle(slide: PreviewSlide): CSSProperties {
    const shape = pictures.shapeOf(slide.item)
    const view = fitView(shape, options.fitBox())
    return {
      width: `${shape.width * view.k}px`,
      height: `${shape.height * view.k}px`,
      transform: `translate3d(${view.tx}px, ${view.ty}px, 0)`,
    }
  }

  const drawnSlides = computed<DrawnSlide[]>(() => {
    const shown = options.flight()
    const presence = options.presence()
    const closing = options.closing()
    return slides.value.map((slide) => {
      const flying = shown?.index === slide.index
      const size = shown && flying ? shown.size : pictures.sizeOf(slide.item)
      // A flight lands on the picture as drawn now, so it follows a resize mid-air, and a wheel's
      // or a key's zoom or page turn on the way out carries it along rather than cutting it short.
      const pose = shown && flying
        ? lerpPose(shown.from, shown.to ?? landingPose(slide, size), presence)
        : restPose(slide, size)
      const styles = poseStyles(pose, size)
      const standIn = pictures.standIns.value.get(slide.item.url)?.src ?? null
      const loaded = pictures.isLoaded(slide.item.url)
      return {
        ...slide,
        key: `${slide.index}:${slide.item.url}`,
        flying,
        // Out of sight while a picture flies home. On the way out they wait off the stage, and a
        // page turned mid-air slides the next one in.
        hidden: shown !== null && !flying && closing,
        style: flying ? undefined : slideStyle(slide),
        frame: styles.frame,
        picture: styles.image,
        standIn,
        loaded,
        failed: pictures.isFailed(slide.item.url),
        placeholder: pictures.skeletonShown.value && !loaded && !standIn ? placeholderStyle(slide) : null,
      }
    })
  })

  const boxStyle = computed<CSSProperties>(() => {
    const box = options.fitBox()
    return {
      left: `${box.x}px`,
      top: `${box.y}px`,
      width: `${box.width}px`,
      height: `${box.height}px`,
    }
  })

  return { drawnSlides, boxStyle, drawnPose, holdOutgoing }
}
