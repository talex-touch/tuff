import type { ComputedRef, Ref } from '@vue/reactivity'
import type { TxZIndexAllocator } from '../utils/z-index-manager'
import { computed, readonly, shallowRef } from '@vue/reactivity'
import { lockBodyScroll, unlockBodyScroll } from '../utils/body-scroll-lock'
import { isFormFieldTarget } from '../utils/escape-key'
import { createFocusReturn, trapTab } from '../utils/focus-trap'
import { getDefaultZIndexAllocator } from '../utils/z-index-manager'

export interface DialogMachineOptions {
  defaultOpen?: boolean
  open?: () => boolean | undefined
  modal?: boolean
  closeOnEsc?: boolean
  closeOnBackdrop?: boolean
  lockScroll?: boolean
  restoreFocus?: boolean
  ignoreFormFieldEsc?: boolean
  zIndexAllocator?: TxZIndexAllocator
  onOpenChange?: (open: boolean) => void
  onOpen?: () => void
  onClose?: () => void
}

export interface DialogMachine {
  isOpen: ComputedRef<boolean>
  zIndex: Readonly<Ref<number>>
  open: (container?: Element | null) => void
  close: () => void
  toggle: (container?: Element | null) => void
  handleKeydown: (event: KeyboardEvent, root?: HTMLElement | null) => boolean
  handleBackdropClick: () => boolean
  destroy: () => void
}

export function createDialogMachine(options: DialogMachineOptions = {}): DialogMachine {
  const allocator = options.zIndexAllocator ?? getDefaultZIndexAllocator()
  const focusReturn = createFocusReturn()
  const internalOpen = shallowRef(Boolean(options.defaultOpen))
  const zIndex = shallowRef(allocator.get())
  let scrollLocked = false

  const isOpen = computed<boolean>(() => {
    const controlled = options.open?.()
    return controlled !== undefined ? controlled : internalOpen.value
  })

  function releaseScroll(): void {
    if (!scrollLocked)
      return
    scrollLocked = false
    unlockBodyScroll()
  }

  function applyOpenEffects(container?: Element | null): void {
    zIndex.value = allocator.next()
    if (options.restoreFocus !== false)
      focusReturn.save(container)
    if (options.lockScroll !== false && !scrollLocked) {
      scrollLocked = true
      lockBodyScroll()
    }
  }

  function applyCloseEffects(): void {
    releaseScroll()
    if (options.restoreFocus !== false)
      focusReturn.restore()
  }

  function setOpen(next: boolean, container?: Element | null): void {
    if (isOpen.value === next)
      return
    if (options.open?.() === undefined)
      internalOpen.value = next

    if (next) {
      applyOpenEffects(container)
      options.onOpenChange?.(true)
      options.onOpen?.()
    }
    else {
      applyCloseEffects()
      options.onOpenChange?.(false)
      options.onClose?.()
    }
  }

  if (options.defaultOpen)
    applyOpenEffects()

  function open(container?: Element | null): void {
    setOpen(true, container)
  }

  function close(): void {
    setOpen(false)
  }

  function toggle(container?: Element | null): void {
    setOpen(!isOpen.value, container)
  }

  function handleKeydown(event: KeyboardEvent, root?: HTMLElement | null): boolean {
    if (!isOpen.value)
      return false

    if (event.key === 'Tab' && options.modal !== false && root) {
      trapTab(event, root)
      return true
    }

    if (event.key === 'Escape' && options.closeOnEsc !== false) {
      if (options.ignoreFormFieldEsc && isFormFieldTarget(event.target))
        return false
      event.preventDefault()
      close()
      return true
    }

    return false
  }

  function handleBackdropClick(): boolean {
    if (!isOpen.value || options.closeOnBackdrop === false)
      return false
    close()
    return true
  }

  function destroy(): void {
    releaseScroll()
  }

  return {
    isOpen,
    zIndex: readonly(zIndex),
    open,
    close,
    toggle,
    handleKeydown,
    handleBackdropClick,
    destroy,
  }
}
