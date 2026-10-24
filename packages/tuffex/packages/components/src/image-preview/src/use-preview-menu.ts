import type { Ref } from 'vue'
import type { PreviewMenuItem, PreviewMenuPlace, PreviewMenuPlacer } from './menu'
import type { ImagePreviewAction } from './types'
import type { PreviewBox, PreviewPoint, PreviewSize } from './zoom'
import { computed, onBeforeUnmount, ref, shallowRef } from 'vue'
import { hasDocument } from '../../../../utils/env'
import { useVibrate } from '../../../../utils/vibrate'
import { ACTION_ICONS } from './icons'
import { MENU_MARGIN } from './menu'

// The actions' menu: a long press on the picture, a right-click, or the context-menu key. The
// preview draws its own (ImagePreviewMenu) rather than using TxContextMenu, which teleports to
// <body>: there it would sit outside the preview's focus trap, and answer Escape alongside it.
// This says when it opens, where, and what it holds; the menu does the rest.

export type PreviewMenuKind = 'touch' | 'pointer' | 'keyboard'

/** A finger's menu opens this far above it (px), clear of the fingertip. */
const MENU_FINGER_GAP = 16

/** Over a finger, above it; at a pointer, beside it, turned back from the edges; from the keyboard, on the picture. */
function placeAt({ x, y }: PreviewPoint, kind: PreviewMenuKind, size: PreviewSize, room: PreviewSize): PreviewMenuPlace {
  let left = x
  let top = y
  if (kind === 'touch') {
    left = x - size.width / 2
    top = y - MENU_FINGER_GAP - size.height
    if (top < MENU_MARGIN)
      top = y + MENU_FINGER_GAP
  }
  else if (kind === 'pointer') {
    if (x + size.width > room.width - MENU_MARGIN)
      left = x - size.width
    if (y + size.height > room.height - MENU_MARGIN)
      top = y - size.height
  }
  else {
    left = x - size.width / 2
    top = y - size.height / 2
  }
  return { left, top, x, y }
}

export interface PreviewMenuOptions {
  /** The host asked for the menu. */
  enabled: () => boolean
  /** The preview is up and not leaving. */
  live: () => boolean
  overlay: Readonly<Ref<HTMLElement | null>>
  /** The menu holds focus. */
  holdsFocus: () => boolean
  actions: () => readonly ImagePreviewAction[]
  label: (action: ImagePreviewAction) => string
  disabled: (action: ImagePreviewAction) => boolean
  run: (action: ImagePreviewAction, reverse: boolean) => void
  /** Where the picture is fitted, in the overlay's pixels: the keyboard opens the menu on it. */
  fitBox: () => PreviewBox
  isPicture: (target: EventTarget | null) => boolean
  /** A point in the overlay's pixels. */
  point: (event: { clientX: number, clientY: number }) => PreviewPoint
  /** Lands a picture still flying out. */
  settle: () => void
  /** Ends the press the gestures hold. */
  endPress: () => void
  /** A fade of the preview's own transition. */
  level: (shown: () => boolean, ms: number) => Ref<number>
}

export interface PreviewMenu {
  menuOpen: Readonly<Ref<boolean>>
  /** Takes the pointer, once the press that opened it is let go. */
  menuArmed: Readonly<Ref<boolean>>
  menuLevel: Readonly<Ref<number>>
  /** The actions on offer, as the menu's items. */
  menuItems: Readonly<Ref<PreviewMenuItem[]>>
  /** Where it goes: where it was opened. */
  menuPlace: Readonly<Ref<PreviewMenuPlacer>>
  /**
   * Opens the menu at `point`, in the overlay's pixels. `waitForRelease` keeps it from taking the
   * press that opened it: it takes the pointer only once that press is let go.
   */
  openMenu: (point: PreviewPoint, kind: PreviewMenuKind, waitForRelease: boolean) => boolean
  /** Closes it, putting focus back where it was when `restore`, or when the menu held it. */
  closeMenu: (restore: boolean) => void
  chooseFromMenu: (key: string, reverse: boolean) => void
  openMenuFromKeyboard: () => boolean
  onContextMenu: (event: MouseEvent) => void
  onMouseDown: (event: MouseEvent) => void
}

export function usePreviewMenu(options: PreviewMenuOptions): PreviewMenu {
  const menuOpen = ref(false)
  const menuArmed = ref(false)
  const menuLevel = options.level(() => menuOpen.value, 150)
  const menuPlace = shallowRef<PreviewMenuPlacer>((size, room) => placeAt({ x: 0, y: 0 }, 'pointer', size, room))
  let menuReturnFocus: HTMLElement | null = null
  let releaseWait: (() => void) | null = null
  let armTimer: ReturnType<typeof setTimeout> | undefined

  const menuItems = computed<PreviewMenuItem[]>(() => options.actions().map(action => ({
    key: action,
    label: options.label(action),
    icon: ACTION_ICONS[action],
    disabled: options.disabled(action),
  })))

  function stopWaiting(): void {
    if (releaseWait && hasDocument()) {
      window.removeEventListener('pointerup', releaseWait, true)
      window.removeEventListener('pointercancel', releaseWait, true)
    }
    releaseWait = null
    if (armTimer !== undefined)
      clearTimeout(armTimer)
    armTimer = undefined
  }

  function openMenu(point: PreviewPoint, kind: PreviewMenuKind, waitForRelease: boolean): boolean {
    if (!options.enabled() || !options.live() || !options.actions().some(action => !options.disabled(action)))
      return false
    options.settle()
    stopWaiting()
    if (kind === 'touch')
      useVibrate('light', { silent: true })
    if (!menuOpen.value) {
      const active = hasDocument() ? document.activeElement : null
      menuReturnFocus = active instanceof HTMLElement && options.overlay.value?.contains(active) ? active : null
    }
    // A new one, so a menu open already moves to the new point.
    menuPlace.value = (size, room) => placeAt(point, kind, size, room)
    menuOpen.value = true
    menuArmed.value = false
    if (waitForRelease && hasDocument()) {
      const release = (): void => {
        stopWaiting()
        // After the release's own click, which would otherwise land on the menu.
        armTimer = setTimeout(() => {
          armTimer = undefined
          if (menuOpen.value)
            menuArmed.value = true
        }, 0)
      }
      releaseWait = release
      window.addEventListener('pointerup', release, true)
      window.addEventListener('pointercancel', release, true)
    }
    else {
      menuArmed.value = true
    }
    return true
  }

  function closeMenu(restore: boolean): void {
    stopWaiting()
    if (!menuOpen.value)
      return
    menuOpen.value = false
    menuArmed.value = false
    const target = menuReturnFocus
    menuReturnFocus = null
    // Focus leaves with the menu: back where it was, or onto the dialog.
    if (options.live() && (restore || options.holdsFocus()))
      (target?.isConnected ? target : options.overlay.value)?.focus({ preventScroll: true })
  }

  function chooseFromMenu(key: string, reverse: boolean): void {
    const action = options.actions().find(candidate => candidate === key)
    if (!action || options.disabled(action))
      return
    // Closed first: the gestures, rotate's among them, wait while it is open.
    closeMenu(true)
    options.run(action, reverse)
  }

  function openMenuFromKeyboard(): boolean {
    const box = options.fitBox()
    return openMenu({ x: box.x + box.width / 2, y: box.y + box.height / 2 }, 'keyboard', false)
  }

  function onContextMenu(event: MouseEvent): void {
    const target = event.target
    if (menuOpen.value || (target instanceof Element && target.closest('.tx-image-preview__menu-layer') !== null)) {
      event.preventDefault()
      return
    }
    // Shift lets the browser's own menu through, as pages with a menu of their own do.
    if (!options.enabled() || event.shiftKey || !options.isPicture(target))
      return
    const pointerType = 'pointerType' in event ? (event as PointerEvent).pointerType : 'mouse'
    const touch = pointerType === 'touch' || pointerType === 'pen'
    // A touch held still asks the gestures for the menu too; the press is the menu's now.
    if (touch)
      options.endPress()
    if (openMenu(options.point(event), touch ? 'touch' : 'pointer', touch || event.buttons !== 0))
      event.preventDefault()
  }

  // The mouse events a touch sends once it lifts land where it began: on the picture, under the
  // menu its long press opened. Focus stays in the menu.
  function onMouseDown(event: MouseEvent): void {
    if (menuOpen.value && !(event.target instanceof Element && event.target.closest('.tx-image-preview__menu')))
      event.preventDefault()
  }

  onBeforeUnmount(stopWaiting)

  return {
    menuOpen,
    menuArmed,
    menuLevel,
    menuItems,
    menuPlace,
    openMenu,
    closeMenu,
    chooseFromMenu,
    openMenuFromKeyboard,
    onContextMenu,
    onMouseDown,
  }
}
