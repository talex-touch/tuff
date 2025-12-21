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

export class DialogManager {
  private stack: DialogConfig[] = []

  register(config: DialogConfig): void {
    const existingIndex = this.stack.findIndex(d => d.id === config.id)
    if (existingIndex !== -1) {
      this.unregister(config.id)
    }

    const currentVisible = this.getVisibleDialog()
    if (currentVisible) {
      this.hideDialog(currentVisible)
    }

    this.stack.push(config)
    this.showDialog(config)
  }

  unregister(id: string): void {
    const index = this.stack.findIndex(d => d.id === id)
    if (index === -1) return

    const [dialog] = this.stack.splice(index, 1)
    const wasVisible = index === this.stack.length

    dialog.onDestroy?.()

    if (wasVisible && this.stack.length > 0) {
      const nextVisible = this.getVisibleDialog()
      if (nextVisible) {
        this.showDialog(nextVisible)
      }
    }
  }

  getVisibleDialog(): DialogConfig | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null
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

let singleton: DialogManager | null = null

export function getDialogManager(): DialogManager {
  if (!singleton) singleton = new DialogManager()
  return singleton
}
