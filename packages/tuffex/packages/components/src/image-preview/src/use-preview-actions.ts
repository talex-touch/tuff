import type { Ref } from 'vue'
import type { ImagePreviewAction, ImagePreviewActionEvent, ImagePreviewItem, ImagePreviewProps } from './types'
import type { PreviewSize } from './zoom'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { canShare, copyImage, downloadImage, shareImage } from './preview-actions'

// The actions, in the toolbar and the menu, and the status that says what one did. The host
// hears of each first and may take it over; preview-actions does the rest.

const KNOWN_ACTIONS: readonly ImagePreviewAction[] = ['rotate', 'copy', 'share', 'download']

/** A status stays this long (ms). */
const STATUS_MS = 1600

export type PreviewActionProps = Readonly<Required<Pick<
  ImagePreviewProps,
  'actions' | 'rotateLabel' | 'copyLabel' | 'shareLabel' | 'downloadLabel' | 'copiedText' | 'linkCopiedText' | 'copyFailedText'
>>>

export interface PreviewActionsOptions {
  /** The picture on show, and where it is in the list. */
  item: () => ImagePreviewItem | null
  index: () => number
  isFailed: (url: string) => boolean
  /** The pictures' own sizes, once loaded: a copy draws the picture at its own. */
  sizes: () => ReadonlyMap<string, PreviewSize>
  /** The picture has a size to turn. */
  canRotate: () => boolean
  rotate: (direction: 1 | -1) => void
  /** The preview is up and not leaving: only then does the status speak. */
  live: () => boolean
  /** Tells the host, which may take the action over. */
  emit: (event: ImagePreviewActionEvent) => void
  /** A fade of the preview's own transition. */
  level: (shown: () => boolean, ms: number) => Ref<number>
}

export interface PreviewActions {
  /** The actions on offer, in the host's order: known ones once each, share only where the browser shares. */
  actionList: Readonly<Ref<ImagePreviewAction[]>>
  actionLabel: (action: ImagePreviewAction) => string
  actionDisabled: (action: ImagePreviewAction) => boolean
  /** Runs `action` on the current picture, inside the click or key press that chose it. */
  runAction: (action: ImagePreviewAction, reverse?: boolean) => void
  /** What the last action did, while it shows and fades. */
  statusText: Readonly<Ref<string>>
  statusLevel: Readonly<Ref<number>>
  clearStatus: () => void
}

export function usePreviewActions(props: PreviewActionProps, options: PreviewActionsOptions): PreviewActions {
  // Known only in the browser: the server draws the actions without share.
  const shareSupported = ref(false)

  const actionList = computed<ImagePreviewAction[]>(() => {
    const list: ImagePreviewAction[] = []
    for (const action of props.actions ?? []) {
      if (KNOWN_ACTIONS.includes(action) && !list.includes(action) && (action !== 'share' || shareSupported.value))
        list.push(action)
    }
    return list
  })

  function actionLabel(action: ImagePreviewAction): string {
    switch (action) {
      case 'rotate':
        return props.rotateLabel
      case 'copy':
        return props.copyLabel
      case 'share':
        return props.shareLabel
      default:
        return props.downloadLabel
    }
  }

  function actionDisabled(action: ImagePreviewAction): boolean {
    const item = options.item()
    if (!item || options.isFailed(item.url))
      return true
    // A picture turns once it has a size to turn.
    return action === 'rotate' && !options.canRotate()
  }

  function runAction(action: ImagePreviewAction, reverse = false): void {
    const item = options.item()
    if (!item || actionDisabled(action))
      return
    let prevented = false
    const payload: ImagePreviewActionEvent = {
      action,
      index: options.index(),
      item,
      preventDefault: () => {
        prevented = true
      },
      get defaultPrevented() {
        return prevented
      },
    }
    options.emit(payload)
    if (prevented)
      return
    switch (action) {
      case 'rotate':
        options.rotate(reverse ? -1 : 1)
        break
      case 'copy':
        void copyImage(item.url, options.sizes().get(item.url)).then((outcome) => {
          say(outcome === 'image' ? props.copiedText : outcome === 'link' ? props.linkCopiedText : props.copyFailedText)
        })
        break
      case 'share':
        void shareImage(item)
        break
      default:
        downloadImage(item)
    }
  }

  // -- The status: a word on what an action did, for a moment.

  const statusText = ref('')
  const statusShown = ref(false)
  let statusTimer: ReturnType<typeof setTimeout> | undefined
  const statusLevel = options.level(() => statusShown.value, 160)

  function clearStatus(): void {
    if (statusTimer !== undefined)
      clearTimeout(statusTimer)
    statusTimer = undefined
    statusShown.value = false
    statusText.value = ''
  }

  function say(text: string): void {
    if (!options.live() || !text)
      return
    if (statusTimer !== undefined)
      clearTimeout(statusTimer)
    statusText.value = text
    statusShown.value = true
    statusTimer = setTimeout(() => {
      statusTimer = undefined
      statusShown.value = false
    }, STATUS_MS)
  }

  // The words go once they have faded.
  watch(statusLevel, (level) => {
    if (level === 0 && !statusShown.value)
      statusText.value = ''
  })

  onMounted(() => {
    shareSupported.value = canShare()
  })

  onBeforeUnmount(clearStatus)

  return { actionList, actionLabel, actionDisabled, runAction, statusText, statusLevel, clearStatus }
}
