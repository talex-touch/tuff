import { Component, createApp, App } from 'vue'
import TDialogMention from '@comp/base/dialog/TDialogMention.vue'
import TBottomDialog from '@comp/base/dialog/TBottomDialog.vue'
import TBlowDialog from '@comp/base/dialog/TBlowDialog.vue'
import TPopperDialog from '@comp/base/dialog/TPopperDialog.vue'
import TouchTip from '@comp/base/dialog/TouchTip.vue'
import VWave from 'v-wave'

/**
 * Type definition for dialog button click handler
 */
type DialogButtonClickHandler = (...args: any[]) => any

/**
 * Interface for dialog button configuration
 */
export interface DialogBtn {
  content: string
  type: string
  onClick: DialogButtonClickHandler
}

/**
 * Interface for bottom dialog button configuration
 */
export interface BottomDialogBtn extends DialogBtn {
  time?: number
}

/**
 * Create and mount a touch tip dialog
 * @param title - Dialog title
 * @param message - Dialog message
 * @param buttons - Array of dialog buttons
 * @returns Promise that resolves when dialog is closed
 */
export async function forTouchTip(
  title: string,
  message: string,
  buttons: DialogBtn[] = [{ content: 'Sure', type: 'info', onClick: async () => true }]
): Promise<void> {
  return new Promise<void>((resolve) => {
    const root: HTMLDivElement = document.createElement('div')

    let index: number = 0

    while (document.getElementById('new-touch-tip-' + index)) {
      index++
    }

    root.id = 'new-touch-tip-' + index
    root.style.zIndex = `${100000 + index}`

    const app: App<Element> = createApp(TouchTip, {
      message,
      title,
      buttons,
      close: async () => {
        app.unmount()
        document.body.removeChild(root)
        resolve()
      }
    })

    document.body.appendChild(root)
    app.use(VWave, {})
    app.mount(root)
  })
}

/**
 * Create and mount a dialog mention
 * @param title - Dialog title
 * @param message - Dialog message
 * @param icon - Dialog icon
 * @param btns - Array of dialog buttons
 * @returns Promise that resolves when dialog is closed
 */
export async function forDialogMention(
  title: string,
  message: string,
  icon: any = null,
  btns: DialogBtn[] = [{ content: 'Sure', type: 'info', onClick: async () => true }]
): Promise<void> {
  return new Promise<void>((resolve) => {
    const root: HTMLDivElement = document.createElement('div')

    let index: number = 0

    while (document.getElementById('touch-dialog-tip-' + index)) {
      index++
    }

    root.id = 'touch-dialog-tip-' + index
    root.style.zIndex = `${10000 + index}`

    const app: App<Element> = createApp(TDialogMention, {
      message,
      index,
      title,
      btns,
      icon,
      loading: false,
      close: async () => {
        app.unmount()
        document.body.removeChild(root)
        resolve()
      }
    })

    document.body.appendChild(root)
    app.use(VWave, {})
    app.mount(root)
  })
}

/**
 * Create and mount an apply mention dialog
 * @param title - Dialog title
 * @param message - Dialog message
 * @param btns - Array of dialog buttons
 */
export async function forApplyMention(
  title: string,
  message: string,
  btns: BottomDialogBtn[] = [{ content: 'Sure', type: 'info', onClick: async () => true, time: 0 }]
): Promise<void> {
  const root: HTMLDivElement = document.createElement('div')

  let index: number = 0

  while (document.getElementById('touch-bottom-dialog-tip-' + index)) {
    index++
  }

  root.id = 'touch-bottom-dialog-tip-' + index

  const app: App<Element> = createApp(TBottomDialog, {
    message,
    index,
    title,
    btns,
    close: async () => {
      app.unmount()
      document.body.removeChild(root)
    }
  })

  document.body.appendChild(root)
  app.use(VWave, {})
  app.mount(root)
}

/**
 * Create and mount a blow mention dialog
 * @param title - Dialog title
 * @param message - Dialog message (string, component, or function)
 * @returns Promise that resolves with the property name used
 */
export async function blowMention(
  title: string,
  message: string | Component | DialogButtonClickHandler
): Promise<string> {
  return new Promise((resolve) => {
    const root: HTMLDivElement = document.createElement('div')

    if (document.getElementById('touch-blow-dialog-tip')) {
      return
    }

    root.id = 'touch-bottom-dialog-tip'

    const propName: string =
      message instanceof String || typeof message === 'string'
        ? 'message'
        : message instanceof Function
          ? 'render'
          : 'component'

    const app: App<Element> = createApp(TBlowDialog, {
      [propName]: message,
      title,
      close: async () => {
        resolve(propName)
        app.unmount()
        document.body.removeChild(root)
      }
    })

    document.body.appendChild(root)
    app.use(VWave, {})
    app.mount(root)
  })
}

/**
 * Create and mount a popper mention dialog
 * @param title - Dialog title
 * @param message - Dialog message (string, component, or function)
 */
export async function popperMention(
  title: string,
  message: string | Component | DialogButtonClickHandler
): Promise<void> {
  const root: HTMLDivElement = document.createElement('div')

  if (document.getElementById('touch-popper-dialog-tip')) {
    return
  }

  root.id = 'touch-popper-dialog-tip'

  const propName: string =
    message instanceof String || typeof message === 'string'
      ? 'message'
      : message instanceof Function
        ? 'render'
        : 'component'

  const app: App<Element> = createApp(TPopperDialog, {
    [propName]: message,
    title,
    close: async () => {
      app.unmount()
      document.body.removeChild(root)
    }
  })

  document.body.appendChild(root)
  app.use(VWave, {})
  app.mount(root)
}
