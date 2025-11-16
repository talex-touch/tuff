import { Component, createVNode, render, getCurrentInstance, type AppContext } from 'vue'
import TDialogMention from '~/components/base/dialog/TDialogMention.vue'
import TBottomDialog from '~/components/base/dialog/TBottomDialog.vue'
import TBlowDialog from '~/components/base/dialog/TBlowDialog.vue'
import TPopperDialog from '~/components/base/dialog/TPopperDialog.vue'
import TouchTip from '~/components/base/dialog/TouchTip.vue'

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
 * 全局应用上下文缓存
 *
 * 用于在非 Vue 上下文中（如 DOM 事件监听器、IPC 回调等）渲染组件。
 * 需要在 Vue 组件的 setup 中调用 captureAppContext() 来捕获上下文。
 */
let globalAppContext: AppContext | null = null

/**
 * 捕获当前 Vue 应用上下文
 *
 * 必须在 Vue 组件的 setup 函数或生命周期钩子中调用此函数。
 * 捕获后的上下文可用于在非 Vue 上下文中渲染对话框组件。
 *
 * @throws {Error} 如果不在 Vue 组件上下文中调用
 *
 * @example
 * ```ts
 * // 在 App.vue 的 setup 中
 * import { captureAppContext } from '~/modules/mention/dialog-mention'
 *
 * onMounted(() => {
 *   captureAppContext()
 * })
 * ```
 */
export function captureAppContext(): void {
  const instance = getCurrentInstance()

  if (!instance) {
    throw new Error(
      '[captureAppContext] Must be called within a Vue component context (setup or lifecycle hooks)'
    )
  }

  globalAppContext = instance.appContext

}

/**
 * 渲染 Vue 组件到 DOM 节点
 *
 * 优先使用当前组件实例的 appContext（如果在 Vue 上下文中调用）。
 * 如果不在 Vue 上下文中，则使用之前通过 captureAppContext() 捕获的全局上下文。
 *
 * @param component - Vue 组件
 * @param props - 组件属性
 * @param container - 挂载容器
 * @returns 清理函数
 * @throws {Error} 如果既不在 Vue 上下文中，也没有捕获过全局上下文
 *
 * @example
 * ```ts
 * // 在 Vue 组件中
 * const cleanup = renderComponent(MyDialog, { title: 'Hello' }, container)
 *
 * // 在 DOM 事件监听器中（需要先调用 captureAppContext）
 * document.addEventListener('drop', () => {
 *   const cleanup = renderComponent(MyDialog, { title: 'Dropped!' }, container)
 * })
 * ```
 */
function renderComponent(
  component: Component,
  props: Record<string, unknown>,
  container: HTMLElement
): () => void {
  const vnode = createVNode(component, props)

  // 尝试获取当前组件实例的上下文（如果在 Vue 组件中调用）
  const currentInstance = getCurrentInstance()
  const appContext = currentInstance?.appContext || globalAppContext

  if (!appContext) {
    throw new Error(
      '[renderComponent] No app context available. ' +
        'Please call captureAppContext() in a Vue component setup before using dialog functions outside of Vue context.'
    )
  }

  // 使用应用上下文，确保继承所有全局插件
  vnode.appContext = appContext

  render(vnode, container)

  return () => {
    render(null, container)
  }
}

/**
 * Create and mount a touch tip dialog
 *
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
    const root = document.createElement('div')

    let index = 0
    while (document.getElementById('new-touch-tip-' + index)) {
      index++
    }

    root.id = 'new-touch-tip-' + index
    root.style.zIndex = `${100000 + index}`

    document.body.appendChild(root)

    const cleanup = renderComponent(
      TouchTip,
      {
        message,
        title,
        buttons,
        close: async () => {
          cleanup()
          document.body.removeChild(root)
          resolve()
        }
      },
      root
    )
  })
}

/**
 * Create and mount a dialog mention
 *
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
    const root = document.createElement('div')

    let index = 0
    while (document.getElementById('touch-dialog-tip-' + index)) {
      index++
    }

    root.id = 'touch-dialog-tip-' + index
    root.style.zIndex = `${10000 + index}`

    document.body.appendChild(root)

    const cleanup = renderComponent(
      TDialogMention,
      {
        message,
        index,
        title,
        btns,
        icon,
        loading: false,
        close: async () => {
          cleanup()
          document.body.removeChild(root)
          resolve()
        }
      },
      root
    )
  })
}

/**
 * Create and mount an apply mention dialog
 *
 * @param title - Dialog title
 * @param message - Dialog message
 * @param btns - Array of dialog buttons
 */
export async function forApplyMention(
  title: string,
  message: string,
  btns: BottomDialogBtn[] = [{ content: 'Sure', type: 'info', onClick: async () => true, time: 0 }]
): Promise<void> {
  const root = document.createElement('div')

  let index = 0
  while (document.getElementById('touch-bottom-dialog-tip-' + index)) {
    index++
  }

  root.id = 'touch-bottom-dialog-tip-' + index

  document.body.appendChild(root)

  const cleanup = renderComponent(
    TBottomDialog,
    {
      message,
      index,
      title,
      btns,
      close: async () => {
        cleanup()
        document.body.removeChild(root)
      }
    },
    root
  )
}

/**
 * Create and mount a blow mention dialog
 *
 * @param title - Dialog title
 * @param message - Dialog message (string, component, or function)
 * @returns Promise that resolves with the property name used
 */
export async function blowMention(
  title: string,
  message: string | Component | DialogButtonClickHandler
): Promise<string> {
  return new Promise((resolve) => {
    const root = document.createElement('div')

    if (document.getElementById('touch-blow-dialog-tip')) {
      return
    }

    root.id = 'touch-blow-dialog-tip'

    const propName =
      message instanceof String || typeof message === 'string'
        ? 'message'
        : message instanceof Function
          ? 'render'
          : 'component'

    document.body.appendChild(root)

    const cleanup = renderComponent(
      TBlowDialog,
      {
        [propName]: message,
        title,
        close: async () => {
          resolve(propName)
          cleanup()
          document.body.removeChild(root)
        }
      },
      root
    )
  })
}

/**
 * Create and mount a popper mention dialog
 *
 * @param title - Dialog title
 * @param message - Dialog message (string, component, or function)
 */
export async function popperMention(
  title: string,
  message: string | Component | DialogButtonClickHandler
): Promise<void> {
  const root = document.createElement('div')

  if (document.getElementById('touch-popper-dialog-tip')) {
    return
  }

  root.id = 'touch-popper-dialog-tip'

  const propName =
    message instanceof String || typeof message === 'string'
      ? 'message'
      : message instanceof Function
        ? 'render'
        : 'component'

  document.body.appendChild(root)

  const cleanup = renderComponent(
    TPopperDialog,
    {
      [propName]: message,
      title,
      close: async () => {
        cleanup()
        document.body.removeChild(root)
      }
    },
    root
  )
}
