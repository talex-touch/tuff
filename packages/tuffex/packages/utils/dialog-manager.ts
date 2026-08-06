export type DialogPriority = 'low' | 'normal' | 'high'

export interface DialogLifecycleCallbacks {
  onShow?: () => void
  onHide?: () => void
  onDestroy?: () => void
}

export interface DialogConfig extends DialogLifecycleCallbacks {
  id: string
  priority?: DialogPriority
  container?: HTMLElement
  setVisible?: (visible: boolean) => void
  cleanup?: () => void
}

const PRIORITY_WEIGHT: Record<DialogPriority, number> = {
  low: 0,
  normal: 1,
  high: 2,
}

export class DialogManager {
  private stack: DialogConfig[] = []

  register(config: DialogConfig): void {
    const existingIndex = this.stack.findIndex(d => d.id === config.id)
    if (existingIndex !== -1) {
      this.unregister(config.id)
    }

    // Insert above every dialog of equal or lower priority: a high-priority
    // dialog jumps ahead of queued lower-priority ones, while dialogs of the
    // same priority keep plain LIFO order. Callers that pass no priority are
    // all 'normal', so they land on top exactly as before.
    const weight = weightOf(config)
    let index = this.stack.length
    while (index > 0 && weightOf(this.stack[index - 1]!) > weight) {
      index--
    }

    const previousVisible = this.getVisibleDialog()
    this.stack.splice(index, 0, config)
    const nextVisible = this.getVisibleDialog()

    if (previousVisible === nextVisible)
      return

    if (previousVisible) {
      this.hideDialog(previousVisible)
    }
    if (nextVisible) {
      this.showDialog(nextVisible)
    }
  }

  unregister(id: string): void {
    const index = this.stack.findIndex(d => d.id === id)
    if (index === -1)
      return

    const [dialog] = this.stack.splice(index, 1)
    if (!dialog)
      return
    const wasVisible = index === this.stack.length

    dialog.onDestroy?.()
    // clearAll() runs both hooks; unregister() used to skip cleanup, so a
    // dialog torn down individually leaked whatever cleanup released.
    dialog.cleanup?.()

    if (wasVisible && this.stack.length > 0) {
      const nextVisible = this.getVisibleDialog()
      if (nextVisible) {
        this.showDialog(nextVisible)
      }
    }
  }

  getVisibleDialog(): DialogConfig | null {
    return this.stack.at(-1) ?? null
  }

  getAllDialogs(): DialogConfig[] {
    return [...this.stack]
  }

  getStackSize(): number {
    return this.stack.length
  }

  clearAll(): void {
    const dialogs = this.stack
    this.stack = []

    for (const dialog of dialogs) {
      dialog.onDestroy?.()
      dialog.cleanup?.()
    }
  }

  private showDialog(dialog: DialogConfig): void {
    if (dialog.setVisible) {
      dialog.setVisible(true)
    }
    else if (dialog.container) {
      dialog.container.style.display = ''
    }

    dialog.onShow?.()
  }

  private hideDialog(dialog: DialogConfig): void {
    if (dialog.setVisible) {
      dialog.setVisible(false)
    }
    else if (dialog.container) {
      dialog.container.style.display = 'none'
    }

    dialog.onHide?.()
  }
}

function weightOf(dialog: DialogConfig): number {
  return PRIORITY_WEIGHT[dialog.priority ?? 'normal']
}

let singleton: DialogManager | null = null

export function getDialogManager(): DialogManager {
  if (!singleton)
    singleton = new DialogManager()
  return singleton
}
