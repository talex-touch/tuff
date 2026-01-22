import type { ITuffIcon } from '@talex-touch/utils'
import type { AppContext, Component } from 'vue'
import { createVNode, getCurrentInstance, render } from 'vue'
import TBlowDialog from '~/components/base/dialog/TBlowDialog.vue'
import TBottomDialog from '~/components/base/dialog/TBottomDialog.vue'
import TDialogMention from '~/components/base/dialog/TDialogMention.vue'
import TouchTip from '~/components/base/dialog/TouchTip.vue'
import TPopperDialog from '~/components/base/dialog/TPopperDialog.vue'
import { useDialogManager } from './dialog-manager'

/**
 * Type definition for dialog button click handler
 */
type DialogButtonClickHandler = (...args: unknown[]) => unknown

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
 * Counter for generating unique dialog IDs
 */
let dialogIdCounter = 0

/**
 * Generate a unique dialog ID
 *
 * @param prefix - ID prefix
 * @returns Unique dialog ID
 */
function generateDialogId(prefix: string): string {
  return `${prefix}-${Date.now()}-${dialogIdCounter++}`
}

/**
 * 渲染 Vue 组件到 DOM 节点并注册到 DialogManager
 *
 * 优先使用当前组件实例的 appContext（如果在 Vue 上下文中调用）。
 * 如果不在 Vue 上下文中，则使用之前通过 captureAppContext() 捕获的全局上下文。
 *
 * @param component - Vue 组件
 * @param props - 组件属性
 * @param container - 挂载容器
 * @param dialogId - Dialog ID for manager registration
 * @param allowInCoreBox - Whether dialog can show in CoreBox window
 * @returns Object with cleanup function and dialog ID
 * @throws {Error} 如果既不在 Vue 上下文中，也没有捕获过全局上下文
 *
 * @example
 * ```ts
 * // 在 Vue 组件中
 * const { cleanup, id } = renderComponent(MyDialog, { title: 'Hello' }, container, 'my-dialog', true)
 *
 * // 在 DOM 事件监听器中（需要先调用 captureAppContext）
 * document.addEventListener('drop', () => {
 *   const { cleanup, id } = renderComponent(MyDialog, { title: 'Dropped!' }, container, 'drop-dialog', true)
 * })
 * ```
 */
function renderComponent(
  component: Component,
  props: Record<string, unknown>,
  container: HTMLElement,
  dialogId: string,
  allowInCoreBox = true
): { cleanup: () => void; id: string } {
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

  const cleanup = () => {
    render(null, container)
  }

  // Register with dialog manager
  const dialogManager = useDialogManager()
  dialogManager.register({
    id: dialogId,
    component,
    props,
    container,
    cleanup,
    allowInCoreBox
  })

  return { cleanup, id: dialogId }
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
    const dialogId = generateDialogId('touch-tip')
    const dialogManager = useDialogManager()

    root.id = dialogId
    root.style.zIndex = `${10000 + dialogManager.getStackSize()}`

    document.body.appendChild(root)

    const { cleanup, id } = renderComponent(
      TouchTip,
      {
        message,
        title,
        buttons,
        close: async () => {
          dialogManager.unregister(id)
          cleanup()
          document.body.removeChild(root)
          resolve()
        }
      },
      root,
      dialogId,
      true
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
  icon: ITuffIcon | string | null = null,
  btns: DialogBtn[] = [{ content: 'Sure', type: 'info', onClick: async () => true }]
): Promise<void> {
  return new Promise<void>((resolve) => {
    const root = document.createElement('div')
    const dialogId = generateDialogId('dialog-mention')
    const dialogManager = useDialogManager()

    root.id = dialogId
    root.style.zIndex = `${10000 + dialogManager.getStackSize()}`

    document.body.appendChild(root)

    const { cleanup, id } = renderComponent(
      TDialogMention,
      {
        message,
        index: dialogManager.getStackSize(),
        title,
        btns,
        icon,
        loading: false,
        close: async () => {
          dialogManager.unregister(id)
          cleanup()
          document.body.removeChild(root)
          resolve()
        }
      },
      root,
      dialogId,
      true
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
  const dialogId = generateDialogId('bottom-dialog')
  const dialogManager = useDialogManager()

  root.id = dialogId

  document.body.appendChild(root)

  const { cleanup, id } = renderComponent(
    TBottomDialog,
    {
      message,
      index: dialogManager.getStackSize(),
      title,
      btns,
      close: async () => {
        dialogManager.unregister(id)
        cleanup()
        document.body.removeChild(root)
      }
    },
    root,
    dialogId,
    true
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
    const dialogId = generateDialogId('blow-dialog')
    const dialogManager = useDialogManager()

    root.id = dialogId

    const propName =
      message instanceof String || typeof message === 'string'
        ? 'message'
        : typeof message === 'function'
          ? 'render'
          : 'component'

    document.body.appendChild(root)

    const { cleanup, id } = renderComponent(
      TBlowDialog,
      {
        [propName]: message,
        title,
        close: async () => {
          resolve(propName)
          dialogManager.unregister(id)
          cleanup()
          document.body.removeChild(root)
        }
      },
      root,
      dialogId,
      true
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
  const dialogId = generateDialogId('popper-dialog')
  const dialogManager = useDialogManager()

  root.id = dialogId

  const propName =
    message instanceof String || typeof message === 'string'
      ? 'message'
      : typeof message === 'function'
        ? 'render'
        : 'component'

  document.body.appendChild(root)

  const { cleanup, id } = renderComponent(
    TPopperDialog,
    {
      [propName]: message,
      title,
      close: async () => {
        dialogManager.unregister(id)
        cleanup()
        document.body.removeChild(root)
      }
    },
    root,
    dialogId,
    true
  )
}
