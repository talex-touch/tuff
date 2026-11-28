import type { VNode } from 'vue'
import type { PropSchema } from '../runtime/coerce'
import TxCascader from '@tuffex-src/cascader/src/TxCascader.vue'
import TxContextMenu from '@tuffex-src/context-menu/src/TxContextMenu.vue'
import TxContextMenuItem from '@tuffex-src/context-menu/src/TxContextMenuItem.vue'
import { TX_CONTEXT_MENU_INJECTION_KEY } from '@tuffex-src/context-menu/src/types'
import TxDataTable from '@tuffex-src/data-table/src/TxDataTable.vue'
import TxDatePicker from '@tuffex-src/date-picker/src/TxDatePicker.vue'
import TxDescriptions from '@tuffex-src/descriptions/src/TxDescriptions.vue'
import TxDescriptionsItem from '@tuffex-src/descriptions/src/TxDescriptionsItem.vue'
import TxDrawerForm from '@tuffex-src/drawer-form/src/TxDrawerForm.vue'
import TxDropdownItem from '@tuffex-src/dropdown-menu/src/TxDropdownItem.vue'
import TxDropdownMenu from '@tuffex-src/dropdown-menu/src/TxDropdownMenu.vue'
import TxFileUploader from '@tuffex-src/file-uploader/src/TxFileUploader.vue'
import TxFilterChips from '@tuffex-src/filter-chips/src/TxFilterChips.vue'
import TxFlatDropdown from '@tuffex-src/flat-dropdown/src/TxFlatDropdown.vue'
import TxFlatRadio from '@tuffex-src/flat-radio/src/TxFlatRadio.vue'
import TxFlatRadioItem from '@tuffex-src/flat-radio/src/TxFlatRadioItem.vue'
import TxFlatSelect from '@tuffex-src/flat-select/src/TxFlatSelect.vue'
import TxFlatSelectItem from '@tuffex-src/flat-select/src/TxFlatSelectItem.vue'
import TxForm from '@tuffex-src/form/src/TxForm.vue'
import TxFormErrorSummary from '@tuffex-src/form/src/TxFormErrorSummary.vue'
import TxFormItem from '@tuffex-src/form/src/TxFormItem.vue'
import TxFormRow from '@tuffex-src/form/src/TxFormRow.vue'
import TxIconPicker from '@tuffex-src/icon-picker/src/TxIconPicker.vue'
import TxImageGallery from '@tuffex-src/image-gallery/src/TxImageGallery.vue'
import TxImagePreview from '@tuffex-src/image-preview/src/TxImagePreview.vue'
import TxImageUploader from '@tuffex-src/image-uploader/src/TxImageUploader.vue'
import TxModalForm from '@tuffex-src/modal-form/src/TxModalForm.vue'
import TxNumberInput from '@tuffex-src/number-input/src/TxNumberInput.vue'
import TxPicker from '@tuffex-src/picker/src/TxPicker.vue'
import TxRating from '@tuffex-src/rating/src/TxRating.vue'
import TxScrubField from '@tuffex-src/scrub-field/src/TxScrubField.vue'
import TxSearchInput from '@tuffex-src/search-input/src/TxSearchInput.vue'
import TxSearchSelect from '@tuffex-src/search-select/src/TxSearchSelect.vue'
import TxSegmentedSlider from '@tuffex-src/segmented-slider/src/TxSegmentedSlider.vue'
import TxSelectionActions from '@tuffex-src/selection-actions/src/TxSelectionActions.vue'
import TxSensitiveInput from '@tuffex-src/sensitive-input/src/TxSensitiveInput.vue'
import TxSortableList from '@tuffex-src/sortable-list/src/TxSortableList.vue'
import TxFormStep from '@tuffex-src/steps-form/src/TxFormStep.vue'
import TxStepsForm from '@tuffex-src/steps-form/src/TxStepsForm.vue'
import TxTagInput from '@tuffex-src/tag-input/src/TxTagInput.vue'
import TxTransfer from '@tuffex-src/transfer/src/TxTransfer.vue'
import TxTreeSelect from '@tuffex-src/tree-select/src/TxTreeSelect.vue'
import TxTree from '@tuffex-src/tree/src/TxTree.vue'
import { computed, defineComponent, getCurrentInstance, h, onBeforeUnmount, provide, reactive, ref, useHost, watch } from 'vue'
import { coercePropsBySchema } from '../runtime/coerce'
import { dispatchHostEvent } from '../runtime/events'
import {
  buildRawVueProps,
  createSlotVNode,
  createTxCustomElement,
  createTxCustomElementFromComponent,
  hasHostSlotContent,
  promoteChildProvides,
  useNativeAttrProps,
} from '../runtime/factory'

export interface TxStepsFormStepSpec {
  title: string
  description?: string
  content?: string
}

// 1. number-input (tx-number-input)
export const numberInputBundle = createTxCustomElement({
  tag: 'tx-number-input',
  component: TxNumberInput,
  props: {
    modelValue: 'number',
    value: 'number',
    min: 'number',
    max: 'number',
    step: 'number',
    precision: 'number',
    placeholder: 'string',
    disabled: 'boolean',
    readonly: 'boolean',
    controls: 'boolean',
    decreaseLabel: 'string',
    increaseLabel: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'focus', 'blur'],
  suppressNativeEvents: ['input', 'change'],
  exposeMethods: ['focus', 'blur'],
})

// 2. search-input (tx-search-input)
export const searchInputBundle = createTxCustomElement({
  tag: 'tx-search-input',
  component: TxSearchInput,
  props: {
    modelValue: 'string',
    value: 'string',
    placeholder: 'string',
    disabled: 'boolean',
    clearable: 'boolean',
    remote: 'boolean',
    searchDebounce: 'number',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'input', 'focus', 'blur', 'clear', 'search'],
  suppressNativeEvents: ['input'],
  exposeMethods: ['focus', 'blur', 'clear', 'setValue'],
})

// 3. sensitive-input (tx-sensitive-input)
export const sensitiveInputBundle = createTxCustomElement({
  tag: 'tx-sensitive-input',
  component: TxSensitiveInput,
  props: {
    modelValue: 'string',
    value: 'string',
    placeholder: 'string',
    size: 'string',
    status: 'string',
    label: 'string',
    description: 'string',
    error: 'string',
    disabled: 'boolean',
    readonly: 'boolean',
    required: 'boolean',
    copyable: 'boolean',
    mask: 'string',
    copiedDuration: 'number',
    labels: 'json',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'copy', 'copyError', 'reveal', 'mask'],
  suppressNativeEvents: ['input'],
  exposeMethods: ['focus', 'blur', 'reveal', 'copy'],
})

// 4. tag-input (tx-tag-input)
export const tagInputBundle = createTxCustomElement({
  tag: 'tx-tag-input',
  component: TxTagInput,
  props: {
    modelValue: 'json',
    value: 'json',
    placeholder: 'string',
    disabled: 'boolean',
    max: 'number',
    allowDuplicates: 'boolean',
    separators: 'json',
    confirmOnBlur: 'boolean',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'add', 'remove', 'focus', 'blur'],
  suppressNativeEvents: ['input'],
})

// 5. scrub-field (tx-scrub-field)
export const scrubFieldBundle = createTxCustomElement({
  tag: 'tx-scrub-field',
  component: TxScrubField,
  props: {
    modelValue: 'number',
    value: 'number',
    label: 'string',
    min: 'number',
    max: 'number',
    step: 'number',
    suffix: 'string',
    active: 'boolean',
    disabled: 'boolean',
    pixelsPerStep: 'number',
    shiftMultiplier: 'number',
    clampOn: 'string',
    ariaLabel: 'string',
    valueLabel: 'string',
  },
  transformProps: coerced => ({
    modelValue: 0,
    label: '',
    min: 0,
    max: 100,
    ...coerced,
  }),
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'scrubStart', 'scrubEnd'],
  suppressNativeEvents: ['input', 'change'],
  exposeMethods: ['focus', 'focusInput'],
})

// 6. segmented-slider (tx-segmented-slider)
export const segmentedSliderBundle = createTxCustomElement({
  tag: 'tx-segmented-slider',
  component: TxSegmentedSlider,
  props: {
    modelValue: 'string-or-number',
    value: 'string-or-number',
    segments: 'json',
    disabled: 'boolean',
    showLabels: 'boolean',
    vertical: 'boolean',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
})

// 7. rating (tx-rating)
export const ratingBundle = createTxCustomElement({
  tag: 'tx-rating',
  component: TxRating,
  props: {
    modelValue: 'number',
    value: 'number',
    maxStars: 'number',
    precision: 'number',
    disabled: 'boolean',
    readonly: 'boolean',
    showText: 'boolean',
    icon: 'string-or-json',
    filledIcon: 'string-or-json',
    emptyIcon: 'string-or-json',
    halfIcon: 'string-or-json',
    filledColor: 'string',
    emptyColor: 'string',
    hoverColor: 'string',
    textColor: 'string',
    size: 'string-or-number',
    gap: 'string-or-number',
    animated: 'boolean',
    starLabel: 'any',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
  slots: ['text'],
})

// 8. filter-chips (tx-filter-chips)
export const filterChipsBundle = createTxCustomElement({
  tag: 'tx-filter-chips',
  component: TxFilterChips,
  props: {
    modelValue: 'string-or-number',
    value: 'string-or-number',
    items: 'json',
    disabled: 'boolean',
    role: 'string',
    indicator: 'boolean',
    iconOnly: 'boolean',
    ariaLabel: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
})

// 9. flat-radio (tx-flat-radio + tx-flat-radio-item)
export const flatRadioBundle = createTxCustomElement({
  tag: 'tx-flat-radio',
  component: TxFlatRadio,
  props: {
    modelValue: 'string-or-json',
    value: 'string-or-json',
    multiple: 'boolean',
    disabled: 'boolean',
    size: 'string',
    bordered: 'boolean',
  },
  transformProps: coerced => ({
    modelValue: coerced.multiple ? [] : '',
    ...coerced,
  }),
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
  promoteProvides: true,
  slots: ['default'],
})

export const flatRadioItemBundle = createTxCustomElement({
  tag: 'tx-flat-radio-item',
  component: TxFlatRadioItem,
  props: {
    value: 'string-or-number',
    label: 'string',
    icon: 'string',
    disabled: 'boolean',
  },
  transformProps: coerced => ({
    value: '',
    ...coerced,
  }),
  slots: ['icon', 'default'],
})

// 10. flat-select (tx-flat-select + tx-flat-select-item)
export const flatSelectBundle = createTxCustomElement({
  tag: 'tx-flat-select',
  component: TxFlatSelect,
  props: {
    modelValue: 'string-or-number',
    value: 'string-or-number',
    placeholder: 'string',
    disabled: 'boolean',
    ariaLabel: 'string',
    ariaLabelledby: 'string',
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

export const flatSelectItemBundle = createTxCustomElement({
  tag: 'tx-flat-select-item',
  component: TxFlatSelectItem,
  props: {
    value: 'string-or-number',
    label: 'string',
    disabled: 'boolean',
  },
  transformProps: coerced => ({
    value: '',
    ...coerced,
  }),
  slots: ['default'],
})

// 11. search-select (tx-search-select)
export const searchSelectBundle = createTxCustomElement({
  tag: 'tx-search-select',
  component: TxSearchSelect,
  props: {
    modelValue: 'string-or-number',
    value: 'string-or-number',
    placeholder: 'string',
    disabled: 'boolean',
    clearable: 'boolean',
    options: 'json',
    loading: 'boolean',
    remote: 'boolean',
    searchDebounce: 'number',
    dropdownMaxHeight: 'number',
    dropdownOffset: 'number',
    panelVariant: 'string',
    panelBackground: 'string',
    panelShadow: 'string',
    panelRadius: 'number',
    panelPadding: 'number',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'search', 'select', 'open', 'close'],
  exposeMethods: ['open', 'close', 'focus', 'blur', 'clear'],
})

// 12. cascader (tx-cascader)
export const cascaderBundle = createTxCustomElement({
  tag: 'tx-cascader',
  component: TxCascader,
  props: {
    modelValue: 'json',
    value: 'json',
    options: 'json',
    multiple: 'boolean',
    disabled: 'boolean',
    placeholder: 'string',
    searchable: 'boolean',
    clearable: 'boolean',
    placement: 'string',
    dropdownOffset: 'number',
    dropdownWidth: 'number',
    dropdownMaxWidth: 'number',
    dropdownMaxHeight: 'number',
    expandTrigger: 'string',
    load: 'any',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'open', 'close', 'load-error'],
  exposeMethods: ['open', 'close', 'toggle', 'focus', 'blur', 'clear', 'setValue', 'getValue'],
})

// 13. tree (tx-tree)
export const treeBundle = createTxCustomElement({
  tag: 'tx-tree',
  component: TxTree,
  props: {
    nodes: 'json',
    modelValue: 'string-or-json',
    value: 'string-or-json',
    multiple: 'boolean',
    selectable: 'boolean',
    checkable: 'boolean',
    disabled: 'boolean',
    defaultExpandedKeys: 'json',
    defaultSelectedKeys: 'json',
    expandedKeys: 'json',
    indent: 'number',
    filterText: 'string',
    filterMethod: 'any',
    emptyText: 'string',
    expandLabel: 'string',
    collapseLabel: 'string',
    selectLabel: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'select', 'toggle', 'update:expandedKeys'],
  slots: ['empty'],
})

// 14. tree-select (tx-tree-select)
export const treeSelectBundle = createTxCustomElement({
  tag: 'tx-tree-select',
  component: TxTreeSelect,
  props: {
    modelValue: 'string-or-json',
    value: 'string-or-json',
    nodes: 'json',
    multiple: 'boolean',
    disabled: 'boolean',
    placeholder: 'string',
    searchable: 'boolean',
    clearable: 'boolean',
    placement: 'string',
    dropdownOffset: 'number',
    dropdownWidth: 'number',
    dropdownMaxWidth: 'number',
    dropdownMaxHeight: 'number',
    defaultExpandedKeys: 'json',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'open', 'close'],
  exposeMethods: ['open', 'close', 'toggle', 'focus', 'blur', 'clear', 'setValue', 'getValue', 'getCheckedKeys'],
})

// 15. date-picker (tx-date-picker)
const DATE_PICKER_PROP_SCHEMA: PropSchema = {
  modelValue: 'string-or-json',
  value: 'string-or-json',
  visible: 'boolean',
  open: 'boolean',
  popup: 'boolean',
  variant: 'string',
  title: 'string',
  placeholder: 'string',
  min: 'string',
  max: 'string',
  disabled: 'boolean',
  showToolbar: 'boolean',
  confirmText: 'string',
  cancelText: 'string',
  closeOnClickMask: 'boolean',
  adaptiveBreakpoint: 'number',
  weekStartsOn: 'number',
  range: 'boolean',
  rangeSeparator: 'string',
}

const TxDatePickerWcWrapper = defineComponent({
  name: 'Wc_tx-date-picker',
  props: buildRawVueProps(DATE_PICKER_PROP_SCHEMA),
  setup(rawProps) {
    const host = useHost()
    const nativeAttrs = useNativeAttrProps(host, DATE_PICKER_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, DATE_PICKER_PROP_SCHEMA),
    }))

    const hasLocalModel = ref(false)
    const localModel = ref<unknown>(undefined)
    const hasLocalVisible = ref(false)
    const localVisible = ref(false)

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

    watch(
      () => {
        const p = coercedProps.value
        if (typeof p.visible === 'boolean')
          return p.visible
        if (typeof p.open === 'boolean')
          return p.open
        return undefined
      },
      (next) => {
        if (typeof next === 'boolean') {
          hasLocalVisible.value = true
          localVisible.value = next
        }
      },
      { immediate: true },
    )

    return () => {
      const { value: _val, open: _open, ...rest } = coercedProps.value
      const forwarded: Record<string, unknown> = {
        ...rest,
        'onUpdate:modelValue': (val: unknown) => {
          hasLocalModel.value = true
          localModel.value = val
          if (host)
            (host as unknown as Record<string, unknown>).modelValue = val
          dispatchHostEvent(host, 'update:modelValue', val)
        },
        'onChange': (val: unknown) => dispatchHostEvent(host, 'change', val),
        'onUpdate:visible': (vis: boolean) => {
          hasLocalVisible.value = true
          localVisible.value = vis
          if (host)
            (host as unknown as Record<string, unknown>).visible = vis
          dispatchHostEvent(host, 'update:visible', vis)
        },
        'onConfirm': (val: unknown) => dispatchHostEvent(host, 'confirm', val),
        'onCancel': () => dispatchHostEvent(host, 'cancel'),
        'onOpen': () => dispatchHostEvent(host, 'open'),
        'onClose': () => dispatchHostEvent(host, 'close'),
      }
      if (hasLocalModel.value)
        forwarded.modelValue = localModel.value
      if (hasLocalVisible.value)
        forwarded.visible = localVisible.value

      return h(TxDatePicker, forwarded)
    }
  },
})

export const datePickerBundle = createTxCustomElementFromComponent('tx-date-picker', TxDatePickerWcWrapper)

// 16. picker (tx-picker)
const PICKER_PROP_SCHEMA: PropSchema = {
  modelValue: 'json',
  value: 'json',
  columns: 'json',
  visible: 'boolean',
  popup: 'boolean',
  title: 'string',
  showToolbar: 'boolean',
  confirmText: 'string',
  cancelText: 'string',
  disabled: 'boolean',
  itemHeight: 'number',
  visibleItemCount: 'number',
  closeOnClickMask: 'boolean',
  lazyMount: 'boolean',
}

const TxPickerWcWrapper = defineComponent({
  name: 'Wc_tx-picker',
  props: buildRawVueProps(PICKER_PROP_SCHEMA),
  setup(rawProps, { expose }) {
    const host = useHost()
    const innerRef = ref<Record<string, unknown> | null>(null)
    const nativeAttrs = useNativeAttrProps(host, PICKER_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, PICKER_PROP_SCHEMA),
    }))

    const hasLocalModel = ref(false)
    const localModel = ref<unknown>(undefined)
    const hasLocalVisible = ref(false)
    const localVisible = ref(false)

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

    watch(
      () => coercedProps.value.visible as boolean | undefined,
      (next) => {
        if (typeof next === 'boolean') {
          hasLocalVisible.value = true
          localVisible.value = next
        }
      },
      { immediate: true },
    )

    expose({
      open: () => (innerRef.value?.open as (() => void) | undefined)?.(),
      close: () => (innerRef.value?.close as (() => void) | undefined)?.(),
      toggle: () => (innerRef.value?.toggle as (() => void) | undefined)?.(),
    })

    return () => {
      const { value: _val, ...rest } = coercedProps.value
      const forwarded: Record<string, unknown> = {
        ...rest,
        'ref': innerRef,
        'onUpdate:modelValue': (val: unknown) => {
          hasLocalModel.value = true
          localModel.value = val
          if (host)
            (host as unknown as Record<string, unknown>).modelValue = val
          dispatchHostEvent(host, 'update:modelValue', val)
        },
        'onChange': (val: unknown) => dispatchHostEvent(host, 'change', val),
        'onUpdate:visible': (vis: boolean) => {
          hasLocalVisible.value = true
          localVisible.value = vis
          if (host)
            (host as unknown as Record<string, unknown>).visible = vis
          dispatchHostEvent(host, 'update:visible', vis)
        },
        'onConfirm': (val: unknown) => dispatchHostEvent(host, 'confirm', val),
        'onCancel': () => dispatchHostEvent(host, 'cancel'),
        'onOpen': () => dispatchHostEvent(host, 'open'),
        'onClose': () => dispatchHostEvent(host, 'close'),
      }
      if (hasLocalModel.value)
        forwarded.modelValue = localModel.value
      if (hasLocalVisible.value)
        forwarded.visible = localVisible.value

      return h(TxPicker, forwarded)
    }
  },
})

export const pickerBundle = createTxCustomElementFromComponent('tx-picker', TxPickerWcWrapper)

// 17. form (tx-form + tx-form-item + tx-form-row + tx-form-error-summary)
const SHARED_FORM_PROPS: PropSchema = {
  id: 'string',
  rules: 'json',
  schema: 'any',
  layout: 'string',
  labelPosition: 'string',
  labelAlign: 'string',
  labelWidth: 'string-or-number',
  requiredMark: 'string',
  validateOn: 'string',
  messages: 'json',
  size: 'string',
  disabled: 'boolean',
  readonly: 'boolean',
  reconcile: 'any',
  persist: 'boolean-or-json',
  leaveConfirm: 'any',
  onSubmit: 'any',
}

export const formBundle = createTxCustomElement({
  tag: 'tx-form',
  component: TxForm,
  props: {
    ...SHARED_FORM_PROPS,
    model: 'json',
    autosave: 'boolean-or-json',
  },
  emits: ['validate', 'submit-success', 'persist-error'],
  promoteProvides: true,
  exposeMethods: [
    'validate',
    'validateField',
    'submit',
    'reset',
    'resetFields',
    'setBaseline',
    'setErrors',
    'setRootError',
    'clearValidate',
    'flush',
    'confirmLeave',
    'restoreDraft',
    'discardDraft',
  ],
  slots: ['draft', 'default'],
})

export const formItemBundle = createTxCustomElement({
  tag: 'tx-form-item',
  component: TxFormItem,
  props: {
    label: 'string',
    prop: 'string',
    rules: 'json',
    required: 'boolean',
    help: 'string',
    hint: 'string',
    width: 'string',
    showMessage: 'boolean',
    inline: 'boolean',
    persist: 'boolean',
  },
  emits: ['validate'],
  promoteProvides: true,
  slots: ['default'],
})

export const formRowBundle = createTxCustomElement({
  tag: 'tx-form-row',
  component: TxFormRow,
  props: {
    label: 'string',
    condensed: 'boolean',
  },
  promoteProvides: true,
  slots: ['default'],
})

export const formErrorSummaryBundle = createTxCustomElement({
  tag: 'tx-form-error-summary',
  component: TxFormErrorSummary,
  props: {
    title: 'string',
  },
})

// 18. modal-form (tx-modal-form)
export const modalFormBundle = createTxCustomElement({
  tag: 'tx-modal-form',
  component: TxModalForm,
  props: {
    ...SHARED_FORM_PROPS,
    modelValue: 'boolean',
    open: 'boolean',
    visible: 'boolean',
    title: 'string',
    width: 'string',
    initialValues: 'json',
    submitText: 'string',
    cancelText: 'string',
    modalProps: 'json',
  },
  transformProps: (coerced) => {
    const { open, visible, ...rest } = coerced
    const resolved = typeof rest.modelValue === 'boolean'
      ? rest.modelValue
      : typeof open === 'boolean'
        ? open
        : typeof visible === 'boolean'
          ? visible
          : false
    return {
      ...rest,
      modelValue: resolved,
    }
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'open',
    event: 'update:modelValue',
    extraDomEvents: ['update:open'],
  },
  emits: ['update:modelValue', 'validate', 'submit-success', 'persist-error'],
  promoteProvides: true,
  teleportSlots: true,
  exposeMethods: ['cancel'],
  slots: ['default', 'footer'],
})

// 19. drawer-form (tx-drawer-form)
export const drawerFormBundle = createTxCustomElement({
  tag: 'tx-drawer-form',
  component: TxDrawerForm,
  props: {
    ...SHARED_FORM_PROPS,
    visible: 'boolean',
    modelValue: 'boolean',
    open: 'boolean',
    title: 'string',
    initialValues: 'json',
    submitText: 'string',
    cancelText: 'string',
    drawerProps: 'json',
  },
  transformProps: (coerced) => {
    const { open, ...rest } = coerced
    const resolved = typeof rest.visible === 'boolean'
      ? rest.visible
      : typeof rest.modelValue === 'boolean'
        ? rest.modelValue
        : typeof open === 'boolean'
          ? open
          : false
    return {
      ...rest,
      visible: resolved,
    }
  },
  model: {
    prop: 'visible',
    aliasProp: 'modelValue',
    event: 'update:visible',
    extraDomEvents: ['update:model-value'],
  },
  emits: ['update:visible', 'validate', 'submit-success', 'persist-error'],
  promoteProvides: true,
  teleportSlots: true,
  exposeMethods: ['cancel'],
  slots: ['default', 'footer'],
})

// 20. steps-form (tx-steps-form)
const STEPS_FORM_PROP_SCHEMA: PropSchema = {
  ...SHARED_FORM_PROPS,
  model: 'json',
  active: 'number',
  prevText: 'string',
  nextText: 'string',
  submitText: 'string',
  steps: 'json',
}

const TxStepsFormWcWrapper = defineComponent({
  name: 'Wc_tx-steps-form',
  props: buildRawVueProps(STEPS_FORM_PROP_SCHEMA),
  setup(rawProps, { expose }) {
    const host = useHost()
    const wrapperInstance = getCurrentInstance()
    const innerRef = ref<Record<string, unknown> | null>(null)
    const nativeAttrs = useNativeAttrProps(host, STEPS_FORM_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, STEPS_FORM_PROP_SCHEMA),
    }))

    const hasLocalActive = ref(false)
    const localActive = ref(0)

    watch(
      () => coercedProps.value.active as number | undefined,
      (next) => {
        if (typeof next === 'number') {
          hasLocalActive.value = true
          localActive.value = next
        }
      },
      { immediate: true },
    )

    expose({
      back: () => (innerRef.value?.back as (() => void) | undefined)?.(),
    })

    return () => {
      const { steps: rawSteps, ...rest } = coercedProps.value
      const stepList = Array.isArray(rawSteps) ? (rawSteps as TxStepsFormStepSpec[]) : []
      const forwarded: Record<string, unknown> = {
        ...rest,
        'ref': innerRef,
        'onUpdate:active': (step: number) => {
          hasLocalActive.value = true
          localActive.value = step
          if (host)
            (host as unknown as Record<string, unknown>).active = step
          dispatchHostEvent(host, 'update:active', step)
        },
        'onValidate': (valid: boolean) => dispatchHostEvent(host, 'validate', valid),
        'onSubmit-success': (values: unknown) => dispatchHostEvent(host, 'submit-success', values),
        'onPersist-error': (error: unknown) => dispatchHostEvent(host, 'persist-error', error),
        'onVnodeBeforeMount': (vnode: VNode) => promoteChildProvides(wrapperInstance, vnode.component),
        'onVnodeMounted': (vnode: VNode) => promoteChildProvides(wrapperInstance, vnode.component),
      }
      if (hasLocalActive.value)
        forwarded.active = localActive.value

      const slotMap: Record<string, () => unknown> = {}
      if (stepList.length > 0) {
        slotMap.default = () => stepList.map((step, idx) =>
          h(TxFormStep, {
            key: idx,
            title: step.title ?? `Step ${idx + 1}`,
            description: step.description,
          }, step.content ? { default: () => h('div', { class: 'tx-steps-form__step-body' }, step.content) } : undefined),
        )
      }
      else if (hasHostSlotContent(host, 'default')) {
        slotMap.default = () => createSlotVNode(host, 'default', false)
      }
      if (hasHostSlotContent(host, 'actions'))
        slotMap.actions = () => createSlotVNode(host, 'actions', false)

      return h(TxStepsForm, forwarded, Object.keys(slotMap).length > 0 ? slotMap : undefined)
    }
  },
})

export const stepsFormBundle = createTxCustomElementFromComponent('tx-steps-form', TxStepsFormWcWrapper)

// 21. context-menu (tx-context-menu + tx-context-menu-item)
const CONTEXT_MENU_PROP_SCHEMA: PropSchema = {
  modelValue: 'boolean',
  x: 'number',
  y: 'number',
  width: 'number',
  minWidth: 'number',
  maxWidth: 'number',
  maxHeight: 'number',
  unlimitedHeight: 'boolean',
  disabled: 'boolean',
  eager: 'boolean',
  trigger: 'string',
  anchorMode: 'string',
  preventDefault: 'boolean',
  placement: 'string',
  offset: 'number',
  closeOnEsc: 'boolean',
  closeOnClickOutside: 'boolean',
  closeOnTriggerPointerDown: 'boolean',
  closeOnAnyPointerDown: 'boolean',
  closeOnSelect: 'boolean',
  activationFeedback: 'boolean',
  showArrow: 'boolean',
  arrowSize: 'number',
  animation: 'json',
  keepAliveContent: 'boolean',
  panelVariant: 'string',
  panelBackground: 'string',
  panelShadow: 'string',
  panelRadius: 'number',
  panelPadding: 'number',
  panelCard: 'json',
}

const TxContextMenuWcWrapper = defineComponent({
  name: 'Wc_tx-context-menu',
  props: buildRawVueProps(CONTEXT_MENU_PROP_SCHEMA),
  setup(rawProps, { expose }) {
    const host = useHost()
    const innerRef = ref<Record<string, unknown> | null>(null)
    const nativeAttrs = useNativeAttrProps(host, CONTEXT_MENU_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, CONTEXT_MENU_PROP_SCHEMA),
    }))

    const hasLocalModel = ref(false)
    const localModel = ref(false)

    watch(
      () => coercedProps.value.modelValue as boolean | undefined,
      (next) => {
        if (typeof next === 'boolean') {
          hasLocalModel.value = true
          localModel.value = next
        }
      },
      { immediate: true },
    )

    // Provide menu context directly from the CE wrapper so slotted `<tx-context-menu-item>`
    // custom elements receive `close`, `closeOnSelect`, and `activationFeedback` via Vue 3.5 context inheritance.
    provide(TX_CONTEXT_MENU_INJECTION_KEY, reactive({
      close: () => {
        const fn = innerRef.value?.close as (() => void) | undefined
        fn?.()
      },
      closeOnSelect: computed(() => coercedProps.value.closeOnSelect !== false),
      activationFeedback: computed(() => coercedProps.value.activationFeedback !== false),
    }))

    expose({
      close: () => (innerRef.value?.close as (() => void) | undefined)?.(),
      openAt: (target?: unknown) => (innerRef.value?.openAt as ((t?: unknown) => void) | undefined)?.(target),
      openFromEvent: (event: Event) => (innerRef.value?.openFromEvent as ((e: Event) => void) | undefined)?.(event),
      updatePosition: () => (innerRef.value?.updatePosition as (() => void) | undefined)?.(),
    })

    return () => {
      const forwarded: Record<string, unknown> = {
        ...coercedProps.value,
        'ref': innerRef,
        'onUpdate:modelValue': (val: boolean) => {
          hasLocalModel.value = true
          localModel.value = val
          if (host)
            (host as unknown as Record<string, unknown>).modelValue = val
          dispatchHostEvent(host, 'update:modelValue', val)
        },
        'onOpen': (payload: unknown) => dispatchHostEvent(host, 'open', payload),
        'onClose': () => dispatchHostEvent(host, 'close'),
      }
      if (hasLocalModel.value)
        forwarded.modelValue = localModel.value

      const slotMap: Record<string, () => VNode> = {}
      if (hasHostSlotContent(host, 'trigger'))
        slotMap.trigger = () => createSlotVNode(host, 'trigger', false)
      if (hasHostSlotContent(host, 'default'))
        slotMap.default = () => createSlotVNode(host, 'default', false)
      if (hasHostSlotContent(host, 'menu'))
        slotMap.menu = () => createSlotVNode(host, 'menu', true)

      return h(TxContextMenu, forwarded, Object.keys(slotMap).length > 0 ? slotMap : undefined)
    }
  },
})

export const contextMenuBundle = createTxCustomElementFromComponent('tx-context-menu', TxContextMenuWcWrapper)

export const contextMenuItemBundle = createTxCustomElement({
  tag: 'tx-context-menu-item',
  component: TxContextMenuItem,
  props: {
    disabled: 'boolean',
    danger: 'boolean',
    color: 'string',
    shortcut: 'string',
    submenu: 'boolean',
    closeOnSelect: 'boolean',
    activationFeedback: 'boolean',
  },
  emits: ['select'],
  slots: ['avatar', 'default', 'description', 'right'],
})

// 22. dropdown-menu (tx-dropdown-menu + tx-dropdown-item)
export const dropdownMenuBundle = createTxCustomElement({
  tag: 'tx-dropdown-menu',
  component: TxDropdownMenu,
  props: {
    modelValue: 'boolean',
    placement: 'string',
    trigger: 'string',
    offset: 'number',
    closeOnSelect: 'boolean',
    activationFeedback: 'boolean',
    initialFocus: 'string',
    animation: 'json',
    minWidth: 'number',
    maxHeight: 'number',
    unlimitedHeight: 'boolean',
    referenceClass: 'any',
    panelCard: 'json',
    panelVariant: 'string',
    panelBackground: 'string',
    panelShadow: 'string',
    panelRadius: 'number',
    panelPadding: 'number',
  },
  model: {
    prop: 'modelValue',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'open', 'close'],
  promoteProvides: true,
  teleportSlots: true,
  slots: ['trigger', 'default'],
})

export const dropdownItemBundle = createTxCustomElement({
  tag: 'tx-dropdown-item',
  component: TxDropdownItem,
  props: {
    disabled: 'boolean',
    danger: 'boolean',
    arrow: 'boolean',
    closeOnSelect: 'boolean',
    activationFeedback: 'boolean',
    checked: 'boolean',
    checkType: 'string',
  },
  emits: ['select'],
  slots: ['default', 'right'],
})

// 23. flat-dropdown (tx-flat-dropdown)
export const flatDropdownBundle = createTxCustomElement({
  tag: 'tx-flat-dropdown',
  component: TxFlatDropdown,
  props: {
    modelValue: 'boolean',
    trigger: 'string',
    placement: 'string',
    offset: 'number',
    openDelay: 'number',
    closeDelay: 'number',
    exitDuration: 'number',
    disabled: 'boolean',
    teleport: 'boolean-or-string',
    matchTriggerWidth: 'boolean',
    width: 'string-or-number',
    closeOnClickOutside: 'boolean',
    closeOnEsc: 'boolean',
    closeOnContentClick: 'boolean',
    panelClass: 'any',
  },
  model: {
    prop: 'modelValue',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'open', 'close'],
  teleportSlots: true,
  slots: ['trigger', 'default'],
})

// 24. selection-actions (tx-selection-actions)
export const selectionActionsBundle = createTxCustomElement({
  tag: 'tx-selection-actions',
  component: TxSelectionActions,
  props: {
    selection: 'json',
    state: 'string',
    actions: 'json',
    activeActionId: 'string',
    expanded: 'boolean',
    prompt: 'string',
    hidePrompt: 'boolean',
    placeholder: 'string',
    ariaLabel: 'string',
    keepLabel: 'string',
    discardLabel: 'string',
    retryLabel: 'string',
    sendLabel: 'string',
    expandLabel: 'string',
    collapseLabel: 'string',
    busyLabel: 'string',
    offset: 'number',
  },
  emits: ['action', 'submit', 'keep', 'discard', 'retry', 'update:expanded', 'update:prompt'],
  exposeMethods: ['updatePosition', 'focusInput'],
  slots: ['busy', 'result'],
})

// 25. data-table (tx-data-table)
export const dataTableBundle = createTxCustomElement({
  tag: 'tx-data-table',
  component: TxDataTable,
  props: {
    columns: 'json',
    data: 'json',
    rowKey: 'any',
    loading: 'boolean',
    loadingVariant: 'string',
    skeletonRows: 'number',
    emptyText: 'string',
    striped: 'boolean',
    bordered: 'boolean',
    hover: 'boolean',
    interactiveRows: 'boolean',
    selectable: 'boolean',
    selectedKeys: 'json',
    selectAllLabel: 'string',
    selectRowLabel: 'string',
    selectRowLabelFormatter: 'any',
    defaultSort: 'json',
    sort: 'json',
    sortOnClient: 'boolean',
    sortCycle: 'string',
    tableLayout: 'string',
    nowrap: 'boolean',
    maxHeight: 'string-or-number',
    scrollX: 'boolean',
    stickyHeader: 'boolean',
    stickyFooter: 'boolean',
    expandable: 'boolean',
    defaultExpandedKeys: 'json',
    expandedKeys: 'json',
    rowExpandable: 'any',
    expandLabel: 'string',
    collapseLabel: 'string',
    rowClass: 'any',
    highlightSelected: 'boolean',
    defaultFilter: 'json',
    filter: 'json',
    filterOnClient: 'boolean',
    autoStickyActions: 'boolean',
    labels: 'json',
  },
  transformProps: coerced => ({
    columns: [],
    data: [],
    ...coerced,
  }),
  emits: [
    'update:selectedKeys',
    'selectionChange',
    'update:expandedKeys',
    'expand',
    'sortChange',
    'update:sort',
    'rowClick',
    'update:filter',
    'filterChange',
  ],
})

// 26. descriptions (tx-descriptions + tx-descriptions-item)
export const descriptionsBundle = createTxCustomElement({
  tag: 'tx-descriptions',
  component: TxDescriptions,
  props: {
    columns: 'number',
    layout: 'string',
    size: 'string',
    emptyText: 'string',
    labelWidth: 'string-or-number',
  },
  promoteProvides: true,
  slots: ['default'],
})

export const descriptionsItemBundle = createTxCustomElement({
  tag: 'tx-descriptions-item',
  component: TxDescriptionsItem,
  props: {
    label: 'string',
    span: 'number',
  },
  slots: ['label', 'default'],
})

// 27. sortable-list (tx-sortable-list)
export const sortableListBundle = createTxCustomElement({
  tag: 'tx-sortable-list',
  component: TxSortableList,
  props: {
    modelValue: 'json',
    value: 'json',
    disabled: 'boolean',
    handle: 'boolean',
    ariaLabel: 'string',
    itemLabel: 'any',
    labels: 'json',
    dragMode: 'string',
  },
  transformProps: coerced => ({
    modelValue: [],
    ...coerced,
  }),
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'reorder'],
})

// 28. transfer (tx-transfer)
export const transferBundle = createTxCustomElement({
  tag: 'tx-transfer',
  component: TxTransfer,
  props: {
    modelValue: 'json',
    value: 'json',
    data: 'json',
    titles: 'json',
    filterable: 'boolean',
    filterPlaceholder: 'string',
    emptyText: 'string-or-json',
    maxHeight: 'string-or-number',
    minHeight: 'string-or-number',
    addAriaLabel: 'string',
    removeAriaLabel: 'string',
    moveUpAriaLabel: 'string',
    moveDownAriaLabel: 'string',
    selectAllAriaLabel: 'string',
    targetOrder: 'string',
    orderable: 'boolean',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
})

// 29. file-uploader (tx-file-uploader)
export const fileUploaderBundle = createTxCustomElement({
  tag: 'tx-file-uploader',
  component: TxFileUploader,
  props: {
    modelValue: 'json',
    value: 'json',
    multiple: 'boolean',
    accept: 'string',
    disabled: 'boolean',
    max: 'number',
    showSize: 'boolean',
    allowDrop: 'boolean',
    buttonText: 'string',
    dropText: 'string',
    hintText: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'add', 'remove'],
  suppressNativeEvents: ['change'],
  exposeMethods: ['pick'],
})

// 30. image-uploader (tx-image-uploader)
export const imageUploaderBundle = createTxCustomElement({
  tag: 'tx-image-uploader',
  component: TxImageUploader,
  props: {
    modelValue: 'json',
    value: 'json',
    multiple: 'boolean',
    accept: 'string',
    disabled: 'boolean',
    max: 'number',
    uploadText: 'string',
    removeLabel: 'any',
  },
  transformProps: coerced => ({
    modelValue: [],
    ...coerced,
  }),
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'remove'],
  suppressNativeEvents: ['change'],
})

// 31. image-gallery (tx-image-gallery)
export const imageGalleryBundle = createTxCustomElement({
  tag: 'tx-image-gallery',
  component: TxImageGallery,
  props: {
    items: 'json',
    startIndex: 'number',
    previousLabel: 'string',
    nextLabel: 'string',
    previewTitle: 'string',
    closeLabel: 'string',
    zoomInLabel: 'string',
    zoomOutLabel: 'string',
    resetLabel: 'string',
    failedText: 'string',
    itemLabelFormatter: 'any',
    openLabelFormatter: 'any',
    previewProps: 'json',
  },
  transformProps: coerced => ({
    items: [],
    ...coerced,
  }),
  emits: ['open', 'close', 'action'],
})

// 32. image-preview (tx-image-preview)
const IMAGE_PREVIEW_PROP_SCHEMA: PropSchema = {
  open: 'boolean',
  modelValue: 'boolean',
  visible: 'boolean',
  index: 'number',
  images: 'json',
  items: 'json',
  maxScale: 'number',
  failed: 'json',
  loadingEffect: 'string',
  origin: 'any',
  transition: 'string',
  actions: 'json',
  contextMenu: 'boolean',
  indicator: 'string',
  minimap: 'boolean',
  bounce: 'number',
  maskSurface: 'string',
  maskColor: 'string',
  maskOpacity: 'number',
  maskBlur: 'number',
  controlSurface: 'string',
  controlColor: 'string',
  controlOpacity: 'number',
  controlBlur: 'number',
  label: 'string',
  closeLabel: 'string',
  previousLabel: 'string',
  nextLabel: 'string',
  zoomInLabel: 'string',
  zoomOutLabel: 'string',
  zoomLabel: 'string',
  resetLabel: 'string',
  rotateLabel: 'string',
  copyLabel: 'string',
  shareLabel: 'string',
  downloadLabel: 'string',
  menuLabel: 'string',
  indicatorLabel: 'string',
  copiedText: 'string',
  linkCopiedText: 'string',
  copyFailedText: 'string',
  failedText: 'string',
  counterFormatter: 'any',
  scaleFormatter: 'any',
  indicatorItemFormatter: 'any',
  labelFormatter: 'any',
  readoutLabelFormatter: 'any',
}

const TxImagePreviewWcWrapper = defineComponent({
  name: 'Wc_tx-image-preview',
  props: buildRawVueProps(IMAGE_PREVIEW_PROP_SCHEMA),
  setup(rawProps, { expose }) {
    const host = useHost()
    const innerRef = ref<Record<string, unknown> | null>(null)
    const nativeAttrs = useNativeAttrProps(host, IMAGE_PREVIEW_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, IMAGE_PREVIEW_PROP_SCHEMA),
    }))

    const localOpen = ref(false)
    const localIndex = ref(0)

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
        localOpen.value = next
      },
      { immediate: true },
    )

    watch(
      () => coercedProps.value.index as number | undefined,
      (next) => {
        if (typeof next === 'number')
          localIndex.value = next
      },
      { immediate: true },
    )

    expose({
      show: (at?: number) => (innerRef.value?.show as ((i?: number) => void) | undefined)?.(at),
      close: () => (innerRef.value?.close as (() => void) | undefined)?.(),
    })

    return () => {
      const { modelValue: _mv, visible: _vis, ...rest } = coercedProps.value
      return h(TxImagePreview, {
        ...rest,
        'ref': innerRef,
        'open': localOpen.value,
        'index': localIndex.value,
        'onUpdate:open': (val: boolean) => {
          localOpen.value = val
          if (host)
            (host as unknown as Record<string, unknown>).open = val
          dispatchHostEvent(host, 'update:open', val)
        },
        'onUpdate:index': (idx: number) => {
          localIndex.value = idx
          if (host)
            (host as unknown as Record<string, unknown>).index = idx
          dispatchHostEvent(host, 'update:index', idx)
        },
        'onClose': () => dispatchHostEvent(host, 'close'),
        'onError': (url: string, idx: number) => dispatchHostEvent(host, 'error', { url, index: idx }),
        'onAction': (payload: unknown) => dispatchHostEvent(host, 'action', payload),
      })
    }
  },
})

export const imagePreviewBundle = createTxCustomElementFromComponent('tx-image-preview', TxImagePreviewWcWrapper)

// 33. icon-picker (tx-icon-picker)
const ICON_PICKER_PROP_SCHEMA: PropSchema = {
  modelValue: 'string',
  value: 'string',
  shape: 'string',
  sections: 'json',
  catalog: 'json',
  emojiPacks: 'json',
  shapeSelectable: 'boolean',
  fileChooser: 'any',
  accept: 'string',
  disabled: 'boolean',
  size: 'number',
  placeholder: 'string',
  inline: 'boolean',
  labels: 'json',
}

const TxIconPickerWcWrapper = defineComponent({
  name: 'Wc_tx-icon-picker',
  props: buildRawVueProps(ICON_PICKER_PROP_SCHEMA),
  setup(rawProps, { expose }) {
    const host = useHost()
    const innerRef = ref<Record<string, unknown> | null>(null)
    const nativeAttrs = useNativeAttrProps(host, ICON_PICKER_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, ICON_PICKER_PROP_SCHEMA),
    }))

    const hasLocalModel = ref(false)
    const localModel = ref<string>('')
    const hasLocalShape = ref(false)
    const localShape = ref<string>('rounded')

    watch(
      () => (coercedProps.value.modelValue ?? coercedProps.value.value) as string | undefined,
      (next) => {
        if (typeof next === 'string') {
          hasLocalModel.value = true
          localModel.value = next
        }
      },
      { immediate: true },
    )

    watch(
      () => coercedProps.value.shape as string | undefined,
      (next) => {
        if (typeof next === 'string') {
          hasLocalShape.value = true
          localShape.value = next
        }
      },
      { immediate: true },
    )

    expose({
      toggle: (value?: boolean) => (innerRef.value?.toggle as ((v?: boolean) => void) | undefined)?.(value),
    })

    return () => {
      const { value: _val, ...rest } = coercedProps.value
      const forwarded: Record<string, unknown> = {
        ...rest,
        'ref': innerRef,
        'onUpdate:modelValue': (val: string) => {
          hasLocalModel.value = true
          localModel.value = val
          if (host)
            (host as unknown as Record<string, unknown>).modelValue = val
          dispatchHostEvent(host, 'update:modelValue', val)
        },
        'onUpdate:shape': (shape: string) => {
          hasLocalShape.value = true
          localShape.value = shape
          if (host)
            (host as unknown as Record<string, unknown>).shape = shape
          dispatchHostEvent(host, 'update:shape', shape)
        },
        'onChange': (val: string) => dispatchHostEvent(host, 'change', val),
        'onFile-error': (error: unknown) => dispatchHostEvent(host, 'file-error', error),
      }
      if (hasLocalModel.value)
        forwarded.modelValue = localModel.value
      if (hasLocalShape.value)
        forwarded.shape = localShape.value

      return h(TxIconPicker, forwarded)
    }
  },
})

export const iconPickerBundle = createTxCustomElementFromComponent('tx-icon-picker', TxIconPickerWcWrapper)

export const TxNumberInputElement = numberInputBundle.ElementClass
export const defineTxNumberInput = numberInputBundle.define

export const TxSearchInputElement = searchInputBundle.ElementClass
export const defineTxSearchInput = searchInputBundle.define

export const TxSensitiveInputElement = sensitiveInputBundle.ElementClass
export const defineTxSensitiveInput = sensitiveInputBundle.define

export const TxTagInputElement = tagInputBundle.ElementClass
export const defineTxTagInput = tagInputBundle.define

export const TxScrubFieldElement = scrubFieldBundle.ElementClass
export const defineTxScrubField = scrubFieldBundle.define

export const TxSegmentedSliderElement = segmentedSliderBundle.ElementClass
export const defineTxSegmentedSlider = segmentedSliderBundle.define

export const TxRatingElement = ratingBundle.ElementClass
export const defineTxRating = ratingBundle.define

export const TxFilterChipsElement = filterChipsBundle.ElementClass
export const defineTxFilterChips = filterChipsBundle.define

export const TxFlatRadioElement = flatRadioBundle.ElementClass
export const defineTxFlatRadio = flatRadioBundle.define

export const TxFlatRadioItemElement = flatRadioItemBundle.ElementClass
export const defineTxFlatRadioItem = flatRadioItemBundle.define

export const TxFlatSelectElement = flatSelectBundle.ElementClass
export const defineTxFlatSelect = flatSelectBundle.define

export const TxFlatSelectItemElement = flatSelectItemBundle.ElementClass
export const defineTxFlatSelectItem = flatSelectItemBundle.define

export const TxSearchSelectElement = searchSelectBundle.ElementClass
export const defineTxSearchSelect = searchSelectBundle.define

export const TxCascaderElement = cascaderBundle.ElementClass
export const defineTxCascader = cascaderBundle.define

export const TxTreeElement = treeBundle.ElementClass
export const defineTxTree = treeBundle.define

export const TxTreeSelectElement = treeSelectBundle.ElementClass
export const defineTxTreeSelect = treeSelectBundle.define

export const TxDatePickerElement = datePickerBundle.ElementClass
export const defineTxDatePicker = datePickerBundle.define

export const TxPickerElement = pickerBundle.ElementClass
export const defineTxPicker = pickerBundle.define

export const TxFormElement = formBundle.ElementClass
export const defineTxForm = formBundle.define

export const TxFormItemElement = formItemBundle.ElementClass
export const defineTxFormItem = formItemBundle.define

export const TxFormRowElement = formRowBundle.ElementClass
export const defineTxFormRow = formRowBundle.define

export const TxFormErrorSummaryElement = formErrorSummaryBundle.ElementClass
export const defineTxFormErrorSummary = formErrorSummaryBundle.define

export const TxModalFormElement = modalFormBundle.ElementClass
export const defineTxModalForm = modalFormBundle.define

export const TxDrawerFormElement = drawerFormBundle.ElementClass
export const defineTxDrawerForm = drawerFormBundle.define

export const TxStepsFormElement = stepsFormBundle.ElementClass
export const defineTxStepsForm = stepsFormBundle.define

export const TxContextMenuElement = contextMenuBundle.ElementClass
export const defineTxContextMenu = contextMenuBundle.define

export const TxContextMenuItemElement = contextMenuItemBundle.ElementClass
export const defineTxContextMenuItem = contextMenuItemBundle.define

export const TxDropdownMenuElement = dropdownMenuBundle.ElementClass
export const defineTxDropdownMenu = dropdownMenuBundle.define

export const TxDropdownItemElement = dropdownItemBundle.ElementClass
export const defineTxDropdownItem = dropdownItemBundle.define

export const TxFlatDropdownElement = flatDropdownBundle.ElementClass
export const defineTxFlatDropdown = flatDropdownBundle.define

export const TxSelectionActionsElement = selectionActionsBundle.ElementClass
export const defineTxSelectionActions = selectionActionsBundle.define

export const TxDataTableElement = dataTableBundle.ElementClass
export const defineTxDataTable = dataTableBundle.define

export const TxDescriptionsElement = descriptionsBundle.ElementClass
export const defineTxDescriptions = descriptionsBundle.define

export const TxDescriptionsItemElement = descriptionsItemBundle.ElementClass
export const defineTxDescriptionsItem = descriptionsItemBundle.define

export const TxSortableListElement = sortableListBundle.ElementClass
export const defineTxSortableList = sortableListBundle.define

export const TxTransferElement = transferBundle.ElementClass
export const defineTxTransfer = transferBundle.define

export const TxFileUploaderElement = fileUploaderBundle.ElementClass
export const defineTxFileUploader = fileUploaderBundle.define

export const TxImageUploaderElement = imageUploaderBundle.ElementClass
export const defineTxImageUploader = imageUploaderBundle.define

export const TxImageGalleryElement = imageGalleryBundle.ElementClass
export const defineTxImageGallery = imageGalleryBundle.define

export const TxImagePreviewElement = imagePreviewBundle.ElementClass
export const defineTxImagePreview = imagePreviewBundle.define

export const TxIconPickerElement = iconPickerBundle.ElementClass
export const defineTxIconPicker = iconPickerBundle.define

export const BASE_B_BUNDLES = [
  numberInputBundle,
  searchInputBundle,
  sensitiveInputBundle,
  tagInputBundle,
  scrubFieldBundle,
  segmentedSliderBundle,
  ratingBundle,
  filterChipsBundle,
  flatRadioBundle,
  flatRadioItemBundle,
  flatSelectBundle,
  flatSelectItemBundle,
  searchSelectBundle,
  cascaderBundle,
  treeBundle,
  treeSelectBundle,
  datePickerBundle,
  pickerBundle,
  formBundle,
  formItemBundle,
  formRowBundle,
  formErrorSummaryBundle,
  modalFormBundle,
  drawerFormBundle,
  stepsFormBundle,
  contextMenuBundle,
  contextMenuItemBundle,
  dropdownMenuBundle,
  dropdownItemBundle,
  flatDropdownBundle,
  selectionActionsBundle,
  dataTableBundle,
  descriptionsBundle,
  descriptionsItemBundle,
  sortableListBundle,
  transferBundle,
  fileUploaderBundle,
  imageUploaderBundle,
  imageGalleryBundle,
  imagePreviewBundle,
  iconPickerBundle,
] as const
