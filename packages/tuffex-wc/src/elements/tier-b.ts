import type { VNode } from 'vue'
import TxCheckbox from '@tuffex-src/checkbox/src/TxCheckbox.vue'
import TxCollapse from '@tuffex-src/collapse/src/TxCollapse.vue'
import TxCollapseItem from '@tuffex-src/collapse/src/TxCollapseItem.vue'
import TxBlowDialog from '@tuffex-src/dialog/src/TxBlowDialog.vue'
import TxBottomDialog from '@tuffex-src/dialog/src/TxBottomDialog.vue'
import TxPopperDialog from '@tuffex-src/dialog/src/TxPopperDialog.vue'
import TxTouchTip from '@tuffex-src/dialog/src/TxTouchTip.vue'
import TxDrawer from '@tuffex-src/drawer/src/TxDrawer.vue'
import TxInput from '@tuffex-src/input/src/TxInput.vue'
import TxModal from '@tuffex-src/modal/src/TxModal.vue'
import TxPopover from '@tuffex-src/popover/src/TxPopover.vue'
import TxRadio from '@tuffex-src/radio/src/TxRadio.vue'
import TxRadioGroup from '@tuffex-src/radio/src/TxRadioGroup.vue'
import TxSelect from '@tuffex-src/select/src/TxSelect.vue'
import TxSelectItem from '@tuffex-src/select/src/TxSelectItem.vue'
import TxSlider from '@tuffex-src/slider/src/TxSlider.vue'
import TxTabItem from '@tuffex-src/tabs/src/TxTabItem.vue'
import TxTabs from '@tuffex-src/tabs/src/TxTabs.vue'
import TxTextarea from '@tuffex-src/textarea/src/TxTextarea.vue'
import TxTooltip from '@tuffex-src/tooltip/src/TxTooltip.vue'
import { computed, defineComponent, getCurrentInstance, h, onBeforeUnmount, ref, useHost, watch } from 'vue'
import type { PropSchema } from '../runtime/coerce'
import type { TxBaseSurfaceMode, TxDialogButtonWc, TxSelectOptionGroupWc, TxSelectOptionWc } from '../types'
import { coerceBoolean, coercePropsBySchema } from '../runtime/coerce'
import { dispatchHostEvent } from '../runtime/events'
import {
  buildRawVueProps,
  createSlotVNode,
  createTxCustomElement,
  createTxCustomElementFromComponent,
  getHostSlotNodes,
  hasHostSlotContent,
  promoteChildProvides,
  useNativeAttrProps,
} from '../runtime/factory'

// 19. tx-input (input)
export const inputBundle = createTxCustomElement({
  tag: 'tx-input',
  component: TxInput,
  props: {
    modelValue: 'string-or-number',
    value: 'string-or-number',
    placeholder: 'string',
    type: 'string',
    disabled: 'boolean',
    readonly: 'boolean',
    clearable: 'boolean',
    rows: 'number',
    prefixIcon: 'string',
    suffixIcon: 'string',
    capsLockText: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'input', 'focus', 'blur', 'clear'],
  suppressNativeEvents: ['input'],
  slots: ['prefix', 'suffix'],
})

// 20. tx-textarea (textarea)
export const textareaBundle = createTxCustomElement({
  tag: 'tx-textarea',
  component: TxTextarea,
  props: {
    modelValue: 'string',
    value: 'string',
    placeholder: 'string',
    rows: 'number',
    disabled: 'boolean',
    readonly: 'boolean',
    maxLength: 'number',
    showCount: 'boolean',
    resize: 'string',
    status: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'input', 'focus', 'blur'],
  suppressNativeEvents: ['input'],
})

// 21. tx-checkbox (checkbox)
export const checkboxBundle = createTxCustomElement({
  tag: 'tx-checkbox',
  component: TxCheckbox,
  props: {
    modelValue: 'boolean',
    checked: 'boolean',
    disabled: 'boolean',
    loading: 'boolean',
    label: 'string',
    labelPlacement: 'string',
    variant: 'string',
    ariaLabel: 'string',
    indeterminate: 'boolean',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'checked',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
  slots: ['default'],
})

// 22a. tx-radio (radio)
export const radioBundle = createTxCustomElement({
  tag: 'tx-radio',
  component: TxRadio,
  props: {
    value: 'string-or-number',
    disabled: 'boolean',
    label: 'string',
    type: 'string',
    modelValue: 'boolean',
  },
  transformProps: (coerced) => ({
    value: '',
    ...coerced,
  }),
  emits: ['click', 'update:modelValue'],
  suppressNativeEvents: ['click'],
  slots: ['default'],
})

// 22b. tx-radio-group (radio)
export const radioGroupBundle = createTxCustomElement({
  tag: 'tx-radio-group',
  component: TxRadioGroup,
  props: {
    modelValue: 'string-or-number',
    value: 'string-or-number',
    disabled: 'boolean',
    type: 'string',
    direction: 'string',
    indicatorVariant: 'string',
    glass: 'boolean',
    blur: 'boolean',
    updateOnSettled: 'boolean',
    stiffness: 'number',
    damping: 'number',
    blurAmount: 'number',
    elastic: 'boolean',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
  promoteProvides: true,
  slots: ['default'],
})

// 23. tx-slider (slider)
export const sliderBundle = createTxCustomElement({
  tag: 'tx-slider',
  component: TxSlider,
  props: {
    modelValue: 'number',
    value: 'number',
    min: 'number',
    max: 'number',
    step: 'number',
    disabled: 'boolean',
    active: 'boolean',
    overdrag: 'boolean',
    ariaLabel: 'string',
    ariaLabelledby: 'string',
    showValue: 'boolean',
    formatValue: 'any',
    thumbSurface: 'boolean',
    thumbVariant: 'string',
    showTooltip: 'boolean',
    tooltipTrigger: 'string',
    tooltipFormatter: 'any',
    tooltipPlacement: 'string',
    tooltipTilt: 'boolean',
    tooltipTiltMaxDeg: 'number',
    tooltipOffsetMaxPx: 'number',
    tooltipAccelBoost: 'number',
    tooltipSpringStiffness: 'number',
    tooltipSpringDamping: 'number',
    tooltipMotion: 'string',
    tooltipMotionDuration: 'number',
    tooltipMotionBlurPx: 'number',
    tooltipDistortSkewDeg: 'number',
    tooltipJelly: 'boolean',
    tooltipJellyFrequency: 'number',
    tooltipJellyDecay: 'number',
    tooltipJellyRotateDeg: 'number',
    tooltipJellySkewDeg: 'number',
    tooltipJellySquash: 'number',
    tooltipJellyTriggerAccel: 'number',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
  suppressNativeEvents: ['input', 'change'],
})

// 24a. tx-tab-item (tabs)
export const tabItemBundle = createTxCustomElement({
  tag: 'tx-tab-item',
  component: TxTabItem,
  props: {
    name: 'string',
    label: 'string',
    iconClass: 'string',
    disabled: 'boolean',
    activation: 'boolean',
    active: 'boolean',
  },
  transformProps: (coerced) => {
    const { label: _label, ...rest } = coerced
    return {
      name: '',
      ...rest,
    }
  },
  emits: ['click'],
  suppressNativeEvents: ['click'],
  slots: ['icon', 'name'],
})

// 24b. tx-tabs (tabs)
// Bridges light-DOM <tx-tab-item> children (or JSON `items`) into genuine TxTabItem VNodes
// so TxTabs renders its native nav, indicator, keyboard navigation, and active panel.
export interface TxTabItemSpec {
  name: string
  label?: string
  iconClass?: string
  disabled?: boolean
  activation?: boolean
  content?: string
  panelNodes?: Node[]
}

const TABS_PROP_SCHEMA: PropSchema = {
  modelValue: 'string',
  value: 'string',
  defaultValue: 'string',
  placement: 'string',
  offset: 'number',
  navMinWidth: 'number',
  navMaxWidth: 'number',
  contentPadding: 'number',
  contentScrollable: 'boolean',
  borderless: 'boolean',
  autoHeight: 'boolean',
  autoWidth: 'boolean',
  showIndicator: 'boolean',
  indicatorVariant: 'string',
  indicatorMotion: 'string',
  indicatorMotionStrength: 'number',
  autoHeightDurationMs: 'number',
  autoHeightEasing: 'string',
  animation: 'json',
  items: 'json',
}

function extractTabSpecsFromHost(host: HTMLElement | null): TxTabItemSpec[] {
  const nodes = getHostSlotNodes(host, 'default')
  const specs: TxTabItemSpec[] = []

  for (const node of nodes) {
    if (node.nodeType !== 1)
      continue
    const el = node as HTMLElement & {
      _slots?: Record<string, Node[]>
      name?: string
      label?: string
      iconClass?: string
      disabled?: unknown
      activation?: unknown
    }
    if (el.tagName.toLowerCase() !== 'tx-tab-item')
      continue

    const name = el.getAttribute('name') ?? (typeof el.name === 'string' ? el.name : '')
    if (!name)
      continue

    const labelAttr = el.getAttribute('label') ?? (typeof el.label === 'string' ? el.label : undefined)
    const iconClass = el.getAttribute('icon-class') ?? (typeof el.iconClass === 'string' ? el.iconClass : '')
    const disabled = coerceBoolean(el.hasAttribute('disabled') ? el.getAttribute('disabled') : el.disabled) ?? false
    const activation = coerceBoolean(el.hasAttribute('activation') ? el.getAttribute('activation') : el.activation) ?? false

    const rawPanelNodes = el._slots?.default ? [...el._slots.default] : Array.from(el.childNodes)
    // Detach panel nodes so they can be cleanly mounted into the active TxTabs content wrapper.
    for (const child of rawPanelNodes) {
      if (child.parentNode === el)
        el.removeChild(child)
    }

    specs.push({
      name,
      label: labelAttr || undefined,
      iconClass,
      disabled,
      activation,
      panelNodes: rawPanelNodes,
    })
  }

  return specs
}

const TxTabsWcWrapper = defineComponent({
  name: 'Wc_tx-tabs',
  props: buildRawVueProps(TABS_PROP_SCHEMA),
  setup(rawProps) {
    const host = useHost()
    const slottedTabs = ref<TxTabItemSpec[]>(extractTabSpecsFromHost(host))
    const coercedProps = computed(() => coercePropsBySchema(rawProps as Record<string, unknown>, TABS_PROP_SCHEMA))

    const hasLocalModel = ref(false)
    const localModel = ref<string | undefined>(undefined)

    watch(
      () => (coercedProps.value.modelValue ?? coercedProps.value.value) as string | undefined,
      (next) => {
        if (next !== undefined) {
          hasLocalModel.value = true
          localModel.value = next
        }
      },
      { immediate: true },
    )

    const resolvedTabs = computed<TxTabItemSpec[]>(() => {
      const propItems = coercedProps.value.items
      if (Array.isArray(propItems) && propItems.length > 0)
        return propItems as TxTabItemSpec[]
      return slottedTabs.value
    })

    function handleModelUpdate(next: string): void {
      hasLocalModel.value = true
      localModel.value = next
      if (host) {
        const hostObj = host as unknown as Record<string, unknown>
        if (hostObj.modelValue !== next)
          hostObj.modelValue = next
      }
      dispatchHostEvent(host, 'update:modelValue', next)
    }

    function handleChange(next: string): void {
      dispatchHostEvent(host, 'change', next)
    }

    function mountPanelNodes(nodes: Node[]) {
      return (el: unknown) => {
        if (!(el instanceof HTMLElement))
          return
        for (const node of nodes) {
          if (node.parentNode !== el)
            el.appendChild(node)
        }
      }
    }

    return () => {
      const { items: _items, value: _value, ...restProps } = coercedProps.value
      const forwarded: Record<string, unknown> = {
        ...restProps,
        'onUpdate:modelValue': handleModelUpdate,
        'onChange': handleChange,
      }
      if (hasLocalModel.value)
        forwarded.modelValue = localModel.value

      const tabs = resolvedTabs.value
      const tabVNodes: VNode[] = tabs.map((tab) => {
        const slots: Record<string, () => unknown> = {}
        if (tab.label)
          slots.name = () => tab.label
        if (tab.panelNodes && tab.panelNodes.length > 0) {
          slots.default = () => h('div', {
            class: 'tx-wc-tab-panel',
            key: `panel-${tab.name}`,
            ref: mountPanelNodes(tab.panelNodes!),
          })
        }
        else if (tab.content !== undefined) {
          slots.default = () => tab.content
        }

        return h(TxTabItem, {
          key: tab.name,
          name: tab.name,
          iconClass: tab.iconClass ?? '',
          disabled: Boolean(tab.disabled),
          activation: Boolean(tab.activation),
        }, slots)
      })

      return h(TxTabs, forwarded, {
        default: () => tabVNodes,
      })
    }
  },
})

export const tabsBundle = createTxCustomElementFromComponent('tx-tabs', TxTabsWcWrapper)

// 25a. tx-collapse (collapse)
export const collapseBundle = createTxCustomElement({
  tag: 'tx-collapse',
  component: TxCollapse,
  props: {
    accordion: 'boolean',
    modelValue: 'string-or-json',
    value: 'string-or-json',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
  promoteProvides: true,
  slots: ['default'],
})

// 25b. tx-collapse-item (collapse)
export const collapseItemBundle = createTxCustomElement({
  tag: 'tx-collapse-item',
  component: TxCollapseItem,
  props: {
    title: 'string',
    name: 'string',
    disabled: 'boolean',
    arrowIcon: 'string',
  },
  slots: ['title', 'default'],
})

// 26. tx-tooltip (tooltip)
export const tooltipBundle = createTxCustomElement({
  tag: 'tx-tooltip',
  component: TxTooltip,
  props: {
    modelValue: 'boolean',
    content: 'string',
    disabled: 'boolean',
    trigger: 'string',
    openDelay: 'number',
    closeDelay: 'number',
    maxHeight: 'number',
    referenceFullWidth: 'boolean',
    interactive: 'boolean',
    keepAliveContent: 'boolean',
    closeOnClickOutside: 'boolean',
    toggleOnReferenceClick: 'boolean',
    layer: 'string',
    role: 'string',
    unstyled: 'boolean',
    anchor: 'json',
  },
  emits: ['update:modelValue', 'open', 'close'],
  teleportSlots: true,
  slots: ['default', 'content'],
})

// 27. tx-popover (popover)
export const popoverBundle = createTxCustomElement({
  tag: 'tx-popover',
  component: TxPopover,
  props: {
    modelValue: 'boolean',
    disabled: 'boolean',
    eager: 'boolean',
    placement: 'string',
    offset: 'number',
    width: 'number',
    minWidth: 'number',
    maxWidth: 'number',
    maxHeight: 'number',
    unlimitedHeight: 'boolean',
    referenceFullWidth: 'boolean',
    referenceClass: 'any',
    showArrow: 'boolean',
    arrowSize: 'number',
    trigger: 'string',
    openDelay: 'number',
    closeDelay: 'number',
    animation: 'json',
    virtualReference: 'any',
    matchReferenceWidth: 'boolean',
    keepAliveContent: 'boolean',
    toggleOnReferenceClick: 'boolean',
    panelVariant: 'string',
    panelBackground: 'string',
    panelShadow: 'string',
    panelRadius: 'number',
    panelPadding: 'number',
    panelCard: 'json',
    closeOnClickOutside: 'boolean',
    closeOnEsc: 'boolean',
  },
  emits: ['update:modelValue', 'open', 'close'],
  teleportSlots: true,
  slots: ['reference', 'default'],
})

// 28. tx-dialog (dialog)
// Controlled open/visible/model-value wrapper supporting modal (default with slot ergonomics)
// plus all four TuffEx dialog variants: bottom (TxBottomDialog), blow (TxBlowDialog),
// popper (TxPopperDialog), and tip (TxTouchTip).
const DIALOG_PROP_SCHEMA: PropSchema = {
  open: 'boolean',
  modelValue: 'boolean',
  visible: 'boolean',
  variant: 'string',
  title: 'string',
  message: 'string',
  confirmText: 'string',
  width: 'string',
  fullscreen: 'boolean',
  closeLabel: 'string',
  stay: 'number',
  index: 'number',
  icon: 'string',
  btns: 'json',
  buttons: 'json',
  surface: 'string',
  surfaceColor: 'string',
  surfaceOpacity: 'number',
  beforeClose: 'any',
}

const TxDialogWcWrapper = defineComponent({
  name: 'Wc_tx-dialog',
  props: buildRawVueProps(DIALOG_PROP_SCHEMA),
  setup(rawProps) {
    const host = useHost()
    const nativeAttrs = useNativeAttrProps(host, DIALOG_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())
    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, DIALOG_PROP_SCHEMA),
    }))
    const isOpen = ref(false)

    watch(
      () => {
        const p = coercedProps.value
        if (typeof p.open === 'boolean')
          return p.open
        if (typeof p.modelValue === 'boolean')
          return p.modelValue
        if (typeof p.visible === 'boolean')
          return p.visible
        return false
      },
      (next) => {
        isOpen.value = next
      },
      { immediate: true },
    )

    function emitClosed(): void {
      isOpen.value = false
      if (host) {
        const hostObj = host as unknown as Record<string, unknown>
        if (coerceBoolean(hostObj.open) === true)
          hostObj.open = false
        if (coerceBoolean(hostObj.modelValue) === true)
          hostObj.modelValue = false
        if (coerceBoolean(hostObj.visible) === true)
          hostObj.visible = false
      }
      dispatchHostEvent(host, 'update:open', false)
      dispatchHostEvent(host, 'update:modelValue', false)
      dispatchHostEvent(host, 'close')
    }

    function normalizeDialogButtons(rawList: unknown): Array<TxDialogButtonWc & { onClick: () => Promise<boolean> | boolean }> {
      if (!Array.isArray(rawList))
        return []
      return rawList.map((entry, idx) => {
        const btn = (entry && typeof entry === 'object' ? entry : {}) as Partial<TxDialogButtonWc>
        const userOnClick = typeof btn.onClick === 'function' ? btn.onClick : undefined
        return {
          content: String(btn.content ?? ''),
          type: btn.type,
          icon: btn.icon,
          time: btn.time,
          onClick: async () => {
            dispatchHostEvent(host, 'action', { button: btn, index: idx })
            if (userOnClick)
              return await userOnClick()
            return true
          },
        }
      })
    }

    function normalizeTipButtons(rawList: unknown): Array<TxDialogButtonWc & { onClick: () => Promise<boolean> | boolean }> {
      if (!Array.isArray(rawList))
        return []
      return rawList.map((entry, idx) => {
        const btn = (entry && typeof entry === 'object' ? entry : {}) as Partial<TxDialogButtonWc>
        const userOnClick = typeof btn.onClick === 'function' ? btn.onClick : undefined
        return {
          content: String(btn.content ?? ''),
          type: btn.type,
          onClick: async () => {
            dispatchHostEvent(host, 'action', { button: btn, index: idx })
            if (userOnClick)
              return await userOnClick()
            return true
          },
        }
      })
    }

    const resolvedVariant = computed<'modal' | 'bottom' | 'blow' | 'popper' | 'tip'>(() => {
      const explicit = coercedProps.value.variant
      if (explicit === 'modal' || explicit === 'bottom' || explicit === 'blow' || explicit === 'popper' || explicit === 'tip')
        return explicit
      if (Array.isArray(coercedProps.value.btns) && coercedProps.value.btns.length > 0)
        return 'bottom'
      if (Array.isArray(coercedProps.value.buttons) && coercedProps.value.buttons.length > 0)
        return 'tip'
      return 'modal'
    })

    return () => {
      const p = coercedProps.value
      const variant = resolvedVariant.value

      const surfaceMode = (p.surface as TxBaseSurfaceMode | undefined) ?? 'refraction'

      if (variant === 'modal') {
        const modalSlots: Record<string, () => unknown> = {}
        if (hasHostSlotContent(host, 'header'))
          modalSlots.header = () => createSlotVNode(host, 'header', true)
        if (hasHostSlotContent(host, 'default'))
          modalSlots.default = () => createSlotVNode(host, 'default', true)
        else if (typeof p.message === 'string' && p.message.length > 0)
          modalSlots.default = () => h('p', { class: 'tx-dialog__message' }, p.message as string)
        if (hasHostSlotContent(host, 'footer'))
          modalSlots.footer = () => createSlotVNode(host, 'footer', true)

        return h(TxModal, {
          modelValue: isOpen.value,
          title: (p.title as string | undefined) ?? '',
          width: (p.width as string | undefined) ?? '480px',
          fullscreen: Boolean(p.fullscreen),
          closeLabel: (p.closeLabel as string | undefined) ?? 'Close',
          surface: surfaceMode,
          surfaceColor: (p.surfaceColor as string | undefined) ?? '',
          surfaceOpacity: p.surfaceOpacity as number | undefined,
          beforeClose: p.beforeClose as any,
          'onUpdate:modelValue': (next: boolean) => {
            if (!next)
              emitClosed()
            else
              isOpen.value = true
          },
        }, modalSlots)
      }

      if (!isOpen.value)
        return null

      if (variant === 'bottom') {
        return h(TxBottomDialog, {
          title: (p.title as string | undefined) ?? '',
          message: (p.message as string | undefined) ?? '',
          stay: (p.stay as number | undefined) ?? 0,
          btns: normalizeDialogButtons(p.btns),
          icon: (p.icon as string | undefined) ?? '',
          index: (p.index as number | undefined) ?? 0,
          closeLabel: (p.closeLabel as string | undefined) ?? 'Close',
          surface: surfaceMode,
          surfaceColor: (p.surfaceColor as string | undefined) ?? '',
          surfaceOpacity: p.surfaceOpacity as number | undefined,
          close: emitClosed,
        })
      }

      if (variant === 'blow') {
        return h(TxBlowDialog, {
          title: (p.title as string | undefined) ?? '',
          message: (p.message as string | undefined) ?? '',
          confirmText: (p.confirmText as string | undefined) ?? 'Confirm',
          surface: surfaceMode,
          surfaceColor: (p.surfaceColor as string | undefined) ?? '',
          surfaceOpacity: p.surfaceOpacity as number | undefined,
          ...(hasHostSlotContent(host, 'default') ? { render: () => createSlotVNode(host, 'default', true) } : {}),
          close: emitClosed,
        })
      }

      if (variant === 'popper') {
        return h(TxPopperDialog, {
          title: (p.title as string | undefined) ?? '',
          message: (p.message as string | undefined) ?? '',
          confirmText: (p.confirmText as string | undefined) ?? 'Confirm',
          surface: surfaceMode,
          surfaceColor: (p.surfaceColor as string | undefined) ?? '',
          surfaceOpacity: p.surfaceOpacity as number | undefined,
          ...(hasHostSlotContent(host, 'default') ? { render: () => createSlotVNode(host, 'default', true) } : {}),
          close: emitClosed,
        })
      }

      return h(TxTouchTip, {
        title: (p.title as string | undefined) ?? '',
        message: (p.message as string | undefined) ?? '',
        buttons: normalizeTipButtons(p.buttons ?? p.btns),
        surface: surfaceMode,
        surfaceColor: (p.surfaceColor as string | undefined) ?? '',
        surfaceOpacity: p.surfaceOpacity as number | undefined,
        close: emitClosed,
      })
    }
  },
})

export const dialogBundle = createTxCustomElementFromComponent('tx-dialog', TxDialogWcWrapper)

// 29. tx-drawer (drawer)
export const drawerBundle = createTxCustomElement({
  tag: 'tx-drawer',
  component: TxDrawer,
  props: {
    visible: 'boolean',
    modelValue: 'boolean',
    open: 'boolean',
    title: 'string',
    size: 'string-or-number',
    full: 'boolean',
    width: 'string-or-number',
    direction: 'string',
    showHeader: 'boolean',
    showFooter: 'boolean',
    showClose: 'boolean',
    closeLabel: 'string',
    closeOnClickMask: 'boolean',
    closeOnPressEscape: 'boolean',
    beforeClose: 'any',
    maskEffect: 'string',
    panelTransparent: 'boolean',
    surface: 'string',
    surfaceColor: 'string',
    surfaceOpacity: 'number',
    mobileAdapt: 'boolean',
    zIndex: 'number',
    lazy: 'boolean',
  },
  transformProps: (coerced) => {
    const { open, ...rest } = coerced
    const resolvedVisible = typeof rest.visible === 'boolean'
      ? rest.visible
      : typeof rest.modelValue === 'boolean'
        ? rest.modelValue
        : typeof open === 'boolean'
          ? open
          : false
    return {
      ...rest,
      visible: resolvedVisible,
    }
  },
  model: {
    prop: 'visible',
    aliasProp: 'modelValue',
    event: 'update:visible',
    extraDomEvents: ['update:model-value'],
  },
  emits: ['update:visible', 'open', 'close'],
  teleportSlots: true,
  slots: ['header', 'default', 'footer'],
})

// 30a. tx-select-item (select)
export const selectItemBundle = createTxCustomElement({
  tag: 'tx-select-item',
  component: TxSelectItem,
  props: {
    value: 'string-or-number',
    label: 'string',
    disabled: 'boolean',
    icon: 'string',
    description: 'string',
  },
  transformProps: (coerced) => ({
    value: '',
    ...coerced,
  }),
  slots: ['default'],
})

// 30b. tx-select (select)
// Supports both JSON/property `options` AND slot-friendly `<tx-select-item>` children!
const SELECT_PROP_SCHEMA: PropSchema = {
  modelValue: 'string-or-json',
  value: 'string-or-json',
  placeholder: 'string',
  disabled: 'boolean',
  multiple: 'boolean',
  status: 'string',
  eager: 'boolean',
  options: 'json',
  maxTagCount: 'number',
  maxTagTextLength: 'number',
  searchable: 'boolean',
  searchThreshold: 'number',
  searchPlaceholder: 'string',
  editable: 'boolean',
  remote: 'boolean',
  allowCreate: 'boolean',
  createText: 'string',
  loading: 'boolean',
  loadingText: 'string',
  emptyText: 'string',
  searchDebounce: 'number',
  dropdownMaxHeight: 'number',
  dropdownOffset: 'number',
  contentPadding: 'number',
  optionPadding: 'number',
  animation: 'json',
  panelVariant: 'string',
  panelBackground: 'string',
  panelShadow: 'string',
  panelRadius: 'number',
  panelPadding: 'number',
  panelCard: 'json',
}

function extractSelectOptionsFromHost(host: HTMLElement | null): TxSelectOptionWc[] {
  const nodes = getHostSlotNodes(host, 'default')
  const options: TxSelectOptionWc[] = []

  for (const node of nodes) {
    if (node.nodeType !== 1)
      continue
    const el = node as HTMLElement & {
      _slots?: Record<string, Node[]>
      value?: string | number
      label?: string
      disabled?: unknown
      icon?: string
      description?: string
    }
    if (el.tagName.toLowerCase() !== 'tx-select-item')
      continue

    const attrVal = el.getAttribute('value')
    const rawVal = attrVal ?? el.value
    if (rawVal === undefined || rawVal === null)
      continue

    const slotText = el._slots?.default
      ? el._slots.default.map(n => n.textContent ?? '').join('').trim()
      : (el.textContent ?? '').trim()

    const label = el.getAttribute('label') ?? (typeof el.label === 'string' && el.label ? el.label : slotText || String(rawVal))
    const disabled = coerceBoolean(el.hasAttribute('disabled') ? el.getAttribute('disabled') : el.disabled) ?? false
    const icon = el.getAttribute('icon') ?? (typeof el.icon === 'string' ? el.icon : undefined)
    const description = el.getAttribute('description') ?? (typeof el.description === 'string' ? el.description : undefined)

    options.push({
      value: rawVal,
      label,
      disabled: disabled || undefined,
      icon: icon || undefined,
      description: description || undefined,
    })
  }

  return options
}

const TxSelectWcWrapper = defineComponent({
  name: 'Wc_tx-select',
  props: buildRawVueProps(SELECT_PROP_SCHEMA),
  setup(rawProps, { expose }) {
    const host = useHost()
    const wrapperInstance = getCurrentInstance()
    const innerRef = ref<Record<string, unknown> | null>(null)
    const slottedOptions = ref<TxSelectOptionWc[]>(extractSelectOptionsFromHost(host))
    const coercedProps = computed(() => coercePropsBySchema(rawProps as Record<string, unknown>, SELECT_PROP_SCHEMA))

    const hasLocalModel = ref(false)
    const localModel = ref<unknown>(undefined)

    watch(
      () => coercedProps.value.modelValue ?? coercedProps.value.value,
      (next) => {
        if (next !== undefined) {
          hasLocalModel.value = true
          localModel.value = next
        }
      },
      { immediate: true },
    )

    const resolvedOptions = computed<Array<TxSelectOptionWc | TxSelectOptionGroupWc>>(() => {
      const propOpts = coercedProps.value.options
      if (Array.isArray(propOpts) && propOpts.length > 0)
        return propOpts as Array<TxSelectOptionWc | TxSelectOptionGroupWc>
      return slottedOptions.value
    })

    expose({
      open: () => (innerRef.value?.open as (() => void) | undefined)?.(),
      close: () => (innerRef.value?.close as (() => void) | undefined)?.(),
      toggle: () => (innerRef.value?.toggle as (() => void) | undefined)?.(),
      focus: () => (innerRef.value?.focus as (() => void) | undefined)?.(),
      blur: () => (innerRef.value?.blur as (() => void) | undefined)?.(),
      clear: () => (innerRef.value?.clear as (() => void) | undefined)?.(),
    })

    return () => {
      const { value: _value, options: _options, ...rest } = coercedProps.value
      const forwarded: Record<string, unknown> = {
        ...rest,
        options: resolvedOptions.value,
        ref: innerRef,
        'onUpdate:modelValue': (next: unknown) => {
          hasLocalModel.value = true
          localModel.value = next
          if (host) {
            const hostObj = host as unknown as Record<string, unknown>
            if (hostObj.modelValue !== next)
              hostObj.modelValue = next
          }
          dispatchHostEvent(host, 'update:modelValue', next)
        },
        'onChange': (next: unknown) => dispatchHostEvent(host, 'change', next),
        'onSearch': (query: string) => dispatchHostEvent(host, 'search', query),
        'onCreate': (option: TxSelectOptionWc) => dispatchHostEvent(host, 'create', option),
        onVnodeBeforeMount: (vnode: VNode) => promoteChildProvides(wrapperInstance, vnode.component),
        onVnodeMounted: (vnode: VNode) => promoteChildProvides(wrapperInstance, vnode.component),
      }
      if (hasLocalModel.value)
        forwarded.modelValue = localModel.value

      const slots: Record<string, () => VNode> = {}
      for (const slotName of ['loading', 'empty', 'footer'] as const) {
        if (hasHostSlotContent(host, slotName))
          slots[slotName] = () => createSlotVNode(host, slotName, true)
      }

      return h(TxSelect, forwarded, Object.keys(slots).length > 0 ? slots : undefined)
    }
  },
})

export const selectBundle = createTxCustomElementFromComponent('tx-select', TxSelectWcWrapper)

export const TxInputElement = inputBundle.ElementClass
export const defineTxInput = inputBundle.define

export const TxTextareaElement = textareaBundle.ElementClass
export const defineTxTextarea = textareaBundle.define

export const TxCheckboxElement = checkboxBundle.ElementClass
export const defineTxCheckbox = checkboxBundle.define

export const TxRadioElement = radioBundle.ElementClass
export const defineTxRadio = radioBundle.define

export const TxRadioGroupElement = radioGroupBundle.ElementClass
export const defineTxRadioGroup = radioGroupBundle.define

export const TxSliderElement = sliderBundle.ElementClass
export const defineTxSlider = sliderBundle.define

export const TxTabsElement = tabsBundle.ElementClass
export const defineTxTabs = tabsBundle.define

export const TxTabItemElement = tabItemBundle.ElementClass
export const defineTxTabItem = tabItemBundle.define

export const TxCollapseElement = collapseBundle.ElementClass
export const defineTxCollapse = collapseBundle.define

export const TxCollapseItemElement = collapseItemBundle.ElementClass
export const defineTxCollapseItem = collapseItemBundle.define

export const TxTooltipElement = tooltipBundle.ElementClass
export const defineTxTooltip = tooltipBundle.define

export const TxPopoverElement = popoverBundle.ElementClass
export const defineTxPopover = popoverBundle.define

export const TxDialogElement = dialogBundle.ElementClass
export const defineTxDialog = dialogBundle.define

export const TxDrawerElement = drawerBundle.ElementClass
export const defineTxDrawer = drawerBundle.define

export const TxSelectElement = selectBundle.ElementClass
export const defineTxSelect = selectBundle.define

export const TxSelectItemElement = selectItemBundle.ElementClass
export const defineTxSelectItem = selectItemBundle.define

export const TIER_B_BUNDLES = [
  inputBundle,
  textareaBundle,
  checkboxBundle,
  radioBundle,
  radioGroupBundle,
  sliderBundle,
  tabsBundle,
  tabItemBundle,
  collapseBundle,
  collapseItemBundle,
  tooltipBundle,
  popoverBundle,
  dialogBundle,
  drawerBundle,
  selectBundle,
  selectItemBundle,
] as const
