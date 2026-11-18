import type { DialogButton, DialogButtonType, TouchTipButton } from '@talex-touch/tuffex/dialog'
import type { ITuffIcon } from '@talex-touch/utils'
import type { AppContext, Component } from 'vue'
import {
  TxBlowDialog,
  TxBottomDialog,
  TxPopperDialog,
  TxTouchTip
} from '@talex-touch/tuffex/dialog'
import { nextZIndex } from '@talex-touch/tuffex/utils'
import { createVNode, getCurrentInstance, render } from 'vue'
import TDialogMention from '~/components/base/dialog/TDialogMention.vue'
import { useI18nText } from '~/modules/lang/useI18nText'
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
  icon?: string
  onClick: DialogButtonClickHandler
  loading?: (done: () => void) => void
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
const activeAtomicDialogs = new Map<string, Promise<void>>()

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
 */
function renderComponent(
  component: Component,
  props: Record<string, unknown>,
  container: HTMLElement,
  dialogId: string,
  allowInCoreBox = true
): { cleanup: () => void; id: string } {
  const vnode = createVNode(component, props)

  // 尝试获取当前组件实例的上下文（如果在 Vue 上下文中调用）
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

function normalizeDialogButtonType(type?: string): DialogButtonType {
  if (type === 'danger' || type === 'error') return 'error'
  if (type === 'warning' || type === 'success' || type === 'info') return type
  return 'info'
}

function toTouchTipButtons(buttons: readonly DialogBtn[]): TouchTipButton[] {
  return buttons.map((button) => ({
    content: button.content,
    type: normalizeDialogButtonType(button.type),
    loading: button.loading,
    onClick: async () => Boolean(await button.onClick())
  }))
}

function toBottomDialogButtons(buttons: readonly BottomDialogBtn[]): DialogButton[] {
  return buttons.map((button) => ({
    content: button.content,
    type: normalizeDialogButtonType(button.type),
    icon: button.icon,
    time: button.time,
    loading: button.loading,
    onClick: async () => Boolean(await button.onClick())
  }))
}

function resolveDynamicDialogPropName(
  message: string | Component | DialogButtonClickHandler
): 'message' | 'render' | 'comp' {
  if (message instanceof String || typeof message === 'string') return 'message'
  if (typeof message === 'function') return 'render'
  return 'comp'
}

interface ManagedDialogOptions<T> {
  prefix: string
  component: Component
  allowInCoreBox?: boolean
  setupRoot?: (root: HTMLElement) => void
  buildProps: (context: {
    dialogManager: ReturnType<typeof useDialogManager>
    close: () => Promise<void>
  }) => Record<string, unknown>
  resolveResult: () => T
  onAfterClose?: () => void
}

function mountManagedDialog<T>(options: ManagedDialogOptions<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const root = document.createElement('div')
    const dialogId = generateDialogId(options.prefix)
    let closed = false
    let closeRequested = false
    let cleanupHandle: { cleanup: () => void; id: string } | null = null

    root.id = dialogId
    options.setupRoot?.(root)
    document.body.appendChild(root)

    try {
      const dialogManager = useDialogManager()

      const finalizeClose = (): void => {
        if (!cleanupHandle) return
        const handle = cleanupHandle
        cleanupHandle = null
        dialogManager.unregister(handle.id)
        handle.cleanup()
        root.remove()
        options.onAfterClose?.()
        resolve(options.resolveResult())
      }

      const close = async (): Promise<void> => {
        if (closed) return
        closed = true
        if (!cleanupHandle) {
          closeRequested = true
          return
        }
        finalizeClose()
      }

      const props = options.buildProps({ dialogManager, close })
      cleanupHandle = renderComponent(
        options.component,
        props,
        root,
        dialogId,
        options.allowInCoreBox ?? true
      )

      if (closeRequested) {
        finalizeClose()
      }
    } catch (error) {
      // renderComponent throws when no app context was ever captured (or DialogManager rejects
      // CoreBox). The host node is already in the document by this point, so it has to come back
      // out or every failed attempt leaves one behind.
      root.remove()
      reject(error)
    }
  })
}

/** The single button a dialog gets when its caller passes none. */
function defaultConfirmButtons(): DialogBtn[] {
  return [{ content: useI18nText().t('common.confirm'), type: 'info', onClick: async () => true }]
}

/**
 * Create and mount a touch tip dialog
 *
 * @param title - Dialog title
 * @param message - Dialog message
 * @param buttons - Array of dialog buttons
 * @returns Promise that resolves when dialog is closed
 */
export function forTouchTip(
  title: string,
  message: string,
  buttons: DialogBtn[] = defaultConfirmButtons(),
  atomicKey?: string
): Promise<void> {
  if (atomicKey) {
    const activeDialog = activeAtomicDialogs.get(atomicKey)
    if (activeDialog) return activeDialog
  }

  const pending = mountManagedDialog<void>({
    prefix: 'touch-tip',
    component: TxTouchTip,
    buildProps: ({ close }) => ({
      title,
      message,
      buttons: toTouchTipButtons(buttons),
      close
    }),
    resolveResult: () => undefined,
    onAfterClose: () => {
      if (atomicKey) {
        activeAtomicDialogs.delete(atomicKey)
      }
    }
  })

  if (atomicKey) {
    activeAtomicDialogs.set(atomicKey, pending)
    // The entry was only removed in the dialog's close callback, so a dialog that never rendered
    // left its rejected promise under the key - and every later call with it returned that same
    // rejection instead of showing a dialog (#834). A failure must not become the permanent answer.
    void pending.catch(() => {
      if (activeAtomicDialogs.get(atomicKey) === pending) {
        activeAtomicDialogs.delete(atomicKey)
      }
    })
  }

  return pending
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
  btns: DialogBtn[] = defaultConfirmButtons()
): Promise<void> {
  return mountManagedDialog<void>({
    prefix: 'dialog-mention',
    component: TDialogMention,
    setupRoot: (root) => {
      root.style.zIndex = `${nextZIndex()}`
    },
    buildProps: ({ dialogManager, close }) => ({
      message,
      index: dialogManager.getStackSize(),
      title,
      btns: toBottomDialogButtons(btns),
      icon,
      loading: false,
      close
    }),
    resolveResult: () => undefined
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
  btns: BottomDialogBtn[] = [
    { content: useI18nText().t('common.confirm'), type: 'info', onClick: async () => true, time: 0 }
  ]
): Promise<void> {
  const { t } = useI18nText()
  return mountManagedDialog<void>({
    prefix: 'bottom-dialog',
    component: TxBottomDialog,
    buildProps: ({ dialogManager, close }) => ({
      message,
      index: dialogManager.getStackSize(),
      title,
      btns: toBottomDialogButtons(btns),
      closeLabel: t('common.close'),
      close
    }),
    resolveResult: () => undefined
  })
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
  const propName = resolveDynamicDialogPropName(message)
  const { t } = useI18nText()

  return mountManagedDialog<string>({
    prefix: 'blow-dialog',
    component: TxBlowDialog,
    buildProps: ({ close }) => ({
      [propName]: message,
      title,
      confirmText: t('common.confirm'),
      close
    }),
    resolveResult: () => propName
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
  const propName = resolveDynamicDialogPropName(message)
  const { t } = useI18nText()

  return mountManagedDialog<void>({
    prefix: 'popper-dialog',
    component: TxPopperDialog,
    buildProps: ({ close }) => ({
      [propName]: message,
      title,
      confirmText: t('common.confirm'),
      close
    }),
    resolveResult: () => undefined
  })
}
