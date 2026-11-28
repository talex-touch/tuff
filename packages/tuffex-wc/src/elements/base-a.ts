import type { VNode } from 'vue'
import type { PropSchema } from '../runtime/coerce'
import TxBlankSlate from '@tuffex-src/blank-slate/src/TxBlankSlate.vue'
import TxBreadcrumb from '@tuffex-src/breadcrumb/src/TxBreadcrumb.vue'
import TxCardItem from '@tuffex-src/card-item/src/TxCardItem.vue'
import TxCellLink from '@tuffex-src/cell-link/src/TxCellLink.vue'
import TxContainer from '@tuffex-src/container/src/TxContainer.vue'
import TxEmptyState from '@tuffex-src/empty-state/src/TxEmptyState.vue'
import TxErrorState from '@tuffex-src/error-state/src/TxErrorState.vue'
import TxFlex from '@tuffex-src/flex/src/TxFlex.vue'
import TxGridLayout from '@tuffex-src/grid-layout/src/TxGridLayout.vue'
import TxGrid from '@tuffex-src/grid/src/TxGrid.vue'
import TxGridItem from '@tuffex-src/grid/src/TxGridItem.vue'
import TxBlockLine from '@tuffex-src/group-block/src/TxBlockLine.vue'
import TxBlockSlot from '@tuffex-src/group-block/src/TxBlockSlot.vue'
import TxBlockSwitch from '@tuffex-src/group-block/src/TxBlockSwitch.vue'
import TxGroupBlock from '@tuffex-src/group-block/src/TxGroupBlock.vue'
import TxGuideState from '@tuffex-src/guide-state/src/TxGuideState.vue'
import TxIconChip from '@tuffex-src/icon-chip/src/TxIconChip.vue'
import TxIcon from '@tuffex-src/icon/src/TxIcon.vue'
import TxLayoutSkeleton from '@tuffex-src/layout-skeleton/src/TxLayoutSkeleton.vue'
import TxLoadingOverlay from '@tuffex-src/loading-overlay/src/TxLoadingOverlay.vue'
import TxLoadingState from '@tuffex-src/loading-state/src/TxLoadingState.vue'
import TxModal from '@tuffex-src/modal/src/TxModal.vue'
import TxNavBar from '@tuffex-src/nav-bar/src/TxNavBar.vue'
import TxNoData from '@tuffex-src/no-data/src/TxNoData.vue'
import TxNoSelection from '@tuffex-src/no-selection/src/TxNoSelection.vue'
import TxOfflineState from '@tuffex-src/offline-state/src/TxOfflineState.vue'
import TxPagination from '@tuffex-src/pagination/src/TxPagination.vue'
import TxPermissionState from '@tuffex-src/permission-state/src/TxPermissionState.vue'
import TxScroll from '@tuffex-src/scroll/src/TxScroll.vue'
import TxSearchEmpty from '@tuffex-src/search-empty/src/TxSearchEmpty.vue'
import TxSidebarNav from '@tuffex-src/sidebar-nav/src/TxSidebarNav.vue'
import TxSplitter from '@tuffex-src/splitter/src/TxSplitter.vue'
import TxStack from '@tuffex-src/stack/src/TxStack.vue'
import TxStep from '@tuffex-src/steps/src/TxStep.vue'
import TxSteps from '@tuffex-src/steps/src/TxSteps.vue'
import TxTabBar from '@tuffex-src/tab-bar/src/TxTabBar.vue'
import TxText from '@tuffex-src/text/src/TxText.vue'
import TxTimeline from '@tuffex-src/timeline/src/TxTimeline.vue'
import TxTimelineItem from '@tuffex-src/timeline/src/TxTimelineItem.vue'
import TxToastPanel from '@tuffex-src/toast-panel/src/TxToastPanel.vue'
import TxToastHost from '@tuffex-src/toast/src/TxToastHost.vue'
import { computed, defineComponent, h, onBeforeUnmount, ref, useHost, watch } from 'vue'
import { clearToasts, dismissToast, pauseToasts, resumeToasts, toast as triggerToast } from '../../../tuffex/packages/utils/toast'
import { coerceBoolean, coercePropsBySchema, coerceStringOrJson, coerceStringOrNumber } from '../runtime/coerce'
import { dispatchHostEvent } from '../runtime/events'
import {
  buildRawVueProps,
  createSlotVNode,
  createTxCustomElement,
  createTxCustomElementFromComponent,
  getHostSlotNodes,
  hasHostSlotContent,
  useNativeAttrProps,
} from '../runtime/factory'

export interface TxBreadcrumbItemSpec {
  label: string
  href?: string
  icon?: string
  disabled?: boolean
}

function coerceNumberOrStringOrJson(raw: unknown): unknown {
  if (raw === undefined || raw === null)
    return undefined
  if (typeof raw !== 'string')
    return raw
  const trimmed = raw.trim()
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']')))
    return coerceStringOrJson(trimmed)
  return coerceStringOrNumber(trimmed)
}

function toCssLength(val: unknown): string | undefined {
  if (typeof val === 'number' && Number.isFinite(val))
    return `${val}px`
  if (typeof val === 'string' && val.trim().length > 0)
    return val.trim()
  return undefined
}

const TxHeaderRegion = defineComponent({
  name: 'TxHeader',
  props: {
    height: { type: [String, Number], default: undefined },
  },
  setup(props, { slots }) {
    return () => {
      const height = toCssLength(props.height)
      return h('header', {
        class: 'tx-header',
        style: height ? { height } : undefined,
      }, slots.default?.())
    }
  },
})

const TxAsideRegion = defineComponent({
  name: 'TxAside',
  props: {
    width: { type: [String, Number], default: undefined },
  },
  setup(props, { slots }) {
    return () => {
      const width = toCssLength(props.width)
      return h('aside', {
        class: 'tx-aside',
        style: width ? { width } : undefined,
      }, slots.default?.())
    }
  },
})

const TxMainRegion = defineComponent({
  name: 'TxMain',
  setup(_, { slots }) {
    return () => h('main', { class: 'tx-main' }, slots.default?.())
  },
})

const TxFooterRegion = defineComponent({
  name: 'TxFooter',
  props: {
    height: { type: [String, Number], default: undefined },
  },
  setup(props, { slots }) {
    return () => {
      const height = toCssLength(props.height)
      return h('footer', {
        class: 'tx-footer',
        style: height ? { height } : undefined,
      }, slots.default?.())
    }
  },
})

// 1. container (tx-container + tx-header / tx-aside / tx-main / tx-footer)
export const containerBundle = createTxCustomElement({
  tag: 'tx-container',
  component: TxContainer,
  props: {
    fluid: 'boolean',
    responsive: 'boolean',
    maxWidth: 'string',
    padding: 'string-or-number',
    margin: 'string-or-number',
  },
  slots: ['default'],
})

export const headerBundle = createTxCustomElement({
  tag: 'tx-header',
  component: TxHeaderRegion,
  props: {
    height: 'string-or-number',
  },
  slots: ['default'],
})

export const asideBundle = createTxCustomElement({
  tag: 'tx-aside',
  component: TxAsideRegion,
  props: {
    width: 'string-or-number',
  },
  slots: ['default'],
})

export const mainBundle = createTxCustomElement({
  tag: 'tx-main',
  component: TxMainRegion,
  props: {},
  slots: ['default'],
})

export const footerBundle = createTxCustomElement({
  tag: 'tx-footer',
  component: TxFooterRegion,
  props: {
    height: 'string-or-number',
  },
  slots: ['default'],
})

// 2. flex (tx-flex)
export const flexBundle = createTxCustomElement({
  tag: 'tx-flex',
  component: TxFlex,
  props: {
    direction: 'string',
    gap: 'string-or-number',
    align: 'string',
    justify: 'string',
    wrap: 'string',
    inline: 'boolean',
  },
  slots: ['default'],
})

// 3. grid (tx-grid + tx-grid-item)
export const gridBundle = createTxCustomElement({
  tag: 'tx-grid',
  component: TxGrid,
  props: {
    cols: coerceNumberOrStringOrJson,
    rows: 'number',
    gap: coerceNumberOrStringOrJson,
    minItemWidth: 'string',
    justify: 'string',
    align: 'string',
  },
  slots: ['default'],
})

export const gridItemBundle = createTxCustomElement({
  tag: 'tx-grid-item',
  component: TxGridItem,
  props: {
    colSpan: 'number',
    rowSpan: 'number',
    justifySelf: 'string',
    alignSelf: 'string',
  },
  slots: ['default'],
})

// 4. grid-layout (tx-grid-layout)
export const gridLayoutBundle = createTxCustomElement({
  tag: 'tx-grid-layout',
  component: TxGridLayout,
  props: {
    minItemWidth: 'string',
    gap: 'string',
    maxColumns: 'number',
    interactive: 'boolean',
  },
  slots: ['default'],
})

// 5. stack (tx-stack)
export const stackBundle = createTxCustomElement({
  tag: 'tx-stack',
  component: TxStack,
  props: {
    direction: 'string',
    gap: 'string-or-number',
    align: 'string',
    justify: 'string',
    wrap: 'boolean',
    inline: 'boolean',
  },
  slots: ['default'],
})

// 6. splitter (tx-splitter)
export const splitterBundle = createTxCustomElement({
  tag: 'tx-splitter',
  component: TxSplitter,
  props: {
    modelValue: 'number',
    value: 'number',
    direction: 'string',
    min: 'number',
    max: 'number',
    disabled: 'boolean',
    barSize: 'number',
    snap: 'number',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'drag-start', 'drag-end'],
  slots: ['a', 'b'],
})

// 7. scroll (tx-scroll)
export const scrollBundle = createTxCustomElement({
  tag: 'tx-scroll',
  component: TxScroll,
  props: {
    noPadding: 'boolean',
    native: 'boolean',
    unified: 'boolean',
    nativeAutoFallback: 'boolean',
    scrollChaining: 'boolean',
    direction: 'string',
    scrollbar: 'boolean',
    scrollbarFade: 'boolean',
    scrollbarInteractive: 'boolean',
    scrollbarAlwaysVisible: 'boolean',
    scrollbarMinSize: 'number',
    probeType: 'number',
    bounce: 'boolean',
    click: 'boolean',
    wheel: 'boolean',
    refreshOnContentChange: 'boolean',
    pullDownRefresh: 'boolean-or-json',
    pullDownThreshold: 'number',
    pullDownStop: 'number',
    pullUpLoad: 'boolean-or-json',
    pullUpThreshold: 'number',
    options: 'json',
  },
  emits: ['scroll', 'pulling-down', 'pulling-up'],
  exposeMethods: ['scrollTo', 'refresh', 'getScrollInfo'],
  slots: ['header', 'default', 'footer'],
})

// 8. group-block (tx-group-block + tx-block-line / tx-block-slot / tx-block-switch)
export const groupBlockBundle = createTxCustomElement({
  tag: 'tx-group-block',
  component: TxGroupBlock,
  props: {
    name: 'string',
    description: 'string',
    defaultIcon: 'string-or-json',
    activeIcon: 'string-or-json',
    iconSize: 'number',
    collapsible: 'boolean',
    collapsed: 'boolean',
    defaultExpand: 'boolean',
    memoryName: 'string',
  },
  transformProps: coerced => ({
    name: '',
    ...coerced,
  }),
  emits: ['update:expanded', 'toggle'],
  slots: ['icon', 'header-extra', 'default'],
})

export const blockLineBundle = createTxCustomElement({
  tag: 'tx-block-line',
  component: TxBlockLine,
  props: {
    title: 'string',
    description: 'string',
    link: 'boolean',
  },
  emits: ['click'],
  suppressNativeEvents: ['click'],
  slots: ['description'],
})

export const blockSlotBundle = createTxCustomElement({
  tag: 'tx-block-slot',
  component: TxBlockSlot,
  props: {
    title: 'string',
    description: 'string',
    defaultIcon: 'string-or-json',
    activeIcon: 'string-or-json',
    iconSize: 'number',
    active: 'boolean',
    disabled: 'boolean',
    prop: 'string',
    rules: 'json',
    required: 'boolean',
  },
  emits: ['click'],
  suppressNativeEvents: ['click'],
  promoteProvides: true,
  slots: ['icon', 'label', 'tags', 'default'],
})

export const blockSwitchBundle = createTxCustomElement({
  tag: 'tx-block-switch',
  component: TxBlockSwitch,
  props: {
    title: 'string',
    description: 'string',
    modelValue: 'boolean',
    checked: 'boolean',
    defaultIcon: 'string-or-json',
    activeIcon: 'string-or-json',
    disabled: 'boolean',
    guidance: 'boolean',
    loading: 'boolean',
    prop: 'string',
    rules: 'json',
    required: 'boolean',
  },
  transformProps: coerced => ({
    title: '',
    description: '',
    modelValue: false,
    ...coerced,
  }),
  model: {
    prop: 'modelValue',
    aliasProp: 'checked',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change', 'click'],
  slots: ['tags'],
})

// 9. card-item (tx-card-item)
export const cardItemBundle = createTxCustomElement({
  tag: 'tx-card-item',
  component: TxCardItem,
  props: {
    role: 'string',
    title: 'string',
    subtitle: 'string',
    description: 'string',
    iconClass: 'string',
    avatarText: 'string',
    avatarUrl: 'string',
    avatarSize: 'number',
    avatarShape: 'string',
    clickable: 'boolean',
    active: 'boolean',
    disabled: 'boolean',
    tabindex: 'number',
    align: 'string',
  },
  emits: ['click'],
  suppressNativeEvents: ['click'],
  slots: ['avatar', 'title', 'subtitle', 'right', 'description'],
})

// 10. layout-skeleton (tx-layout-skeleton)
export const layoutSkeletonBundle = createTxCustomElement({
  tag: 'tx-layout-skeleton',
  component: TxLayoutSkeleton,
  props: {},
})

// 11. text (tx-text)
export const textBundle = createTxCustomElement({
  tag: 'tx-text',
  component: TxText,
  props: {
    text: 'string',
    overflow: 'string',
    scroll: 'string',
    loopEdge: 'string',
  },
  transformProps: (coerced, { host }) => {
    if (typeof coerced.text === 'string')
      return coerced
    const fallbackText = getHostSlotNodes(host, 'default')
      .map(n => n.textContent ?? '')
      .join('')
      .trim()
    return {
      ...coerced,
      text: fallbackText,
    }
  },
})

// 12. icon (tx-icon)
export const iconBundle = createTxCustomElement({
  tag: 'tx-icon',
  component: TxIcon,
  props: {
    icon: 'string-or-json',
    name: 'string',
    alt: 'string',
    size: 'number',
    empty: 'string',
    colorful: 'boolean',
    urlResolver: 'any',
    svgFetcher: 'any',
  },
  transformProps: (coerced) => {
    if (typeof coerced.icon === 'string') {
      const rawIcon = coerced.icon
      const { icon: _ignored, ...rest } = coerced
      return {
        ...rest,
        name: typeof rest.name === 'string' && rest.name.length > 0 ? rest.name : rawIcon,
      }
    }
    return coerced
  },
  slots: ['empty'],
})

// 13. icon-chip (tx-icon-chip)
export const iconChipBundle = createTxCustomElement({
  tag: 'tx-icon-chip',
  component: TxIconChip,
  props: {
    size: 'number',
    radius: 'string-or-number',
    tone: 'string',
    variant: 'string',
    shape: 'string',
    label: 'string',
    fontSize: 'number',
    ariaLabel: 'string',
  },
  slots: ['default'],
})

// 14. cell-link (tx-cell-link)
export const cellLinkBundle = createTxCustomElement({
  tag: 'tx-cell-link',
  component: TxCellLink,
  props: {
    href: 'string',
    label: 'string',
    external: 'boolean',
    muted: 'boolean',
    underline: 'string',
    ariaLabel: 'string',
  },
  transformProps: coerced => ({
    href: '',
    ...coerced,
  }),
  emits: ['open'],
  slots: ['default'],
})

// 15-24. EmptyState family (10 modules)
const EMPTY_STATE_BASE_SCHEMA: PropSchema = {
  title: 'string',
  description: 'string',
  icon: 'string-or-json',
  iconSize: 'number',
  layout: 'string',
  align: 'string',
  size: 'string',
  surface: 'string',
  primaryAction: 'json',
  secondaryAction: 'json',
  actionSize: 'string',
  loading: 'boolean',
}

const EMPTY_STATE_SLOTS = ['icon', 'title', 'description', 'actions']
const EMPTY_STATE_EMITS = ['primary', 'secondary']

// 15. blank-slate (tx-blank-slate)
export const blankSlateBundle = createTxCustomElement({
  tag: 'tx-blank-slate',
  component: TxBlankSlate,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 16. empty-state (tx-empty-state)
export const emptyStateBundle = createTxCustomElement({
  tag: 'tx-empty-state',
  component: TxEmptyState,
  props: {
    variant: 'string',
    ...EMPTY_STATE_BASE_SCHEMA,
  },
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 17. error-state (tx-error-state)
export const errorStateBundle = createTxCustomElement({
  tag: 'tx-error-state',
  component: TxErrorState,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 18. guide-state (tx-guide-state)
export const guideStateBundle = createTxCustomElement({
  tag: 'tx-guide-state',
  component: TxGuideState,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 19. loading-state (tx-loading-state)
export const loadingStateBundle = createTxCustomElement({
  tag: 'tx-loading-state',
  component: TxLoadingState,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 20. no-data (tx-no-data)
export const noDataBundle = createTxCustomElement({
  tag: 'tx-no-data',
  component: TxNoData,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 21. no-selection (tx-no-selection)
export const noSelectionBundle = createTxCustomElement({
  tag: 'tx-no-selection',
  component: TxNoSelection,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 22. offline-state (tx-offline-state)
export const offlineStateBundle = createTxCustomElement({
  tag: 'tx-offline-state',
  component: TxOfflineState,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 23. permission-state (tx-permission-state)
export const permissionStateBundle = createTxCustomElement({
  tag: 'tx-permission-state',
  component: TxPermissionState,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 24. search-empty (tx-search-empty)
export const searchEmptyBundle = createTxCustomElement({
  tag: 'tx-search-empty',
  component: TxSearchEmpty,
  props: EMPTY_STATE_BASE_SCHEMA,
  emits: EMPTY_STATE_EMITS,
  slots: EMPTY_STATE_SLOTS,
})

// 25. breadcrumb (tx-breadcrumb + tx-breadcrumb-item)
const TxBreadcrumbItemPlaceholder = defineComponent({
  name: 'TxBreadcrumbItem',
  props: {
    label: { type: String, default: '' },
    href: { type: String, default: undefined },
    icon: { type: String, default: undefined },
    disabled: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    return () => h('span', { class: 'tx-breadcrumb-item-marker' }, slots.default?.() ?? props.label)
  },
})

export const breadcrumbItemBundle = createTxCustomElement({
  tag: 'tx-breadcrumb-item',
  component: TxBreadcrumbItemPlaceholder,
  props: {
    label: 'string',
    href: 'string',
    icon: 'string',
    disabled: 'boolean',
  },
  slots: ['default'],
})

const BREADCRUMB_PROP_SCHEMA: PropSchema = {
  items: 'json',
  separatorIcon: 'string',
  ariaLabel: 'string',
}

function extractBreadcrumbItemsFromHost(host: HTMLElement | null): TxBreadcrumbItemSpec[] {
  const nodes = getHostSlotNodes(host, 'default')
  const items: TxBreadcrumbItemSpec[] = []

  for (const node of nodes) {
    if (node.nodeType !== 1)
      continue
    const el = node as HTMLElement & {
      _slots?: Record<string, Node[]>
      label?: string
      href?: string
      icon?: string
      disabled?: unknown
    }
    if (el.tagName.toLowerCase() !== 'tx-breadcrumb-item')
      continue

    const slotText = el._slots?.default
      ? el._slots.default.map(n => n.textContent ?? '').join('').trim()
      : (el.textContent ?? '').trim()
    const label = el.getAttribute('label') ?? (typeof el.label === 'string' && el.label ? el.label : slotText)
    const href = el.getAttribute('href') ?? (typeof el.href === 'string' ? el.href : undefined)
    const icon = el.getAttribute('icon') ?? (typeof el.icon === 'string' ? el.icon : undefined)
    const disabled = coerceBoolean(el.hasAttribute('disabled') ? el.getAttribute('disabled') : el.disabled) ?? false

    items.push({
      label,
      ...(href ? { href } : {}),
      ...(icon ? { icon } : {}),
      ...(disabled ? { disabled: true } : {}),
    })
  }

  return items
}

const TxBreadcrumbWcWrapper = defineComponent({
  name: 'Wc_tx-breadcrumb',
  props: buildRawVueProps(BREADCRUMB_PROP_SCHEMA),
  setup(rawProps) {
    const host = useHost()
    const nativeAttrs = useNativeAttrProps(host, BREADCRUMB_PROP_SCHEMA)
    const suppressedCleanup: Array<() => void> = []
    function attachNativeClickSuppressor(el: unknown): void {
      while (suppressedCleanup.length)
        suppressedCleanup.pop()?.()
      if (!(el instanceof EventTarget))
        return
      const handler = (event: Event) => {
        if (!(event instanceof CustomEvent))
          event.stopPropagation()
      }
      el.addEventListener('click', handler)
      suppressedCleanup.push(() => el.removeEventListener('click', handler))
    }

    onBeforeUnmount(() => {
      nativeAttrs.cleanup()
      while (suppressedCleanup.length)
        suppressedCleanup.pop()?.()
    })

    const slottedItems = ref<TxBreadcrumbItemSpec[]>(extractBreadcrumbItemsFromHost(host))

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, BREADCRUMB_PROP_SCHEMA),
    }))

    const resolvedItems = computed<TxBreadcrumbItemSpec[]>(() => {
      const propItems = coercedProps.value.items
      if (Array.isArray(propItems))
        return propItems as TxBreadcrumbItemSpec[]
      return slottedItems.value
    })

    return () => {
      const { items: _items, ...rest } = coercedProps.value
      return h(TxBreadcrumb, {
        ...rest,
        items: resolvedItems.value,
        onClick: (item: TxBreadcrumbItemSpec, index: number) => {
          dispatchHostEvent(host, 'click', { item, index })
        },
        onVnodeMounted: (vnode: VNode) => attachNativeClickSuppressor(vnode.el),
        onVnodeUpdated: (vnode: VNode) => attachNativeClickSuppressor(vnode.el),
      })
    }
  },
})

export const breadcrumbBundle = createTxCustomElementFromComponent('tx-breadcrumb', TxBreadcrumbWcWrapper)

// 26. nav-bar (tx-nav-bar)
export const navBarBundle = createTxCustomElement({
  tag: 'tx-nav-bar',
  component: TxNavBar,
  props: {
    title: 'string',
    fixed: 'boolean',
    safeAreaTop: 'boolean',
    showBack: 'boolean',
    disabled: 'boolean',
    zIndex: 'number',
    backLabel: 'string',
    leftLabel: 'string',
    rightLabel: 'string',
  },
  emits: ['back', 'click-left', 'click-right'],
  slots: ['left', 'title', 'right'],
})

// 27. sidebar-nav (tx-sidebar-nav)
export const sidebarNavBundle = createTxCustomElement({
  tag: 'tx-sidebar-nav',
  component: TxSidebarNav,
  props: {
    items: 'json',
    groups: 'json',
    modelValue: 'string-or-number',
    value: 'string-or-number',
    query: 'string',
    workspace: 'json',
    workspaceLabel: 'string',
    searchPlaceholder: 'string',
    searchLabel: 'string',
    searchHint: 'string',
    actionLabel: 'string',
    filter: 'any',
    ariaLabel: 'string',
    indicatorDuration: 'number',
  },
  transformProps: coerced => ({
    items: [],
    ...coerced,
  }),
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'update:query', 'select', 'action', 'itemAction', 'workspaceClick'],
  exposeMethods: ['focusSearch', 'refreshIndicator'],
  slots: ['workspace', 'footer'],
})

// 28. tab-bar (tx-tab-bar)
export const tabBarBundle = createTxCustomElement({
  tag: 'tx-tab-bar',
  component: TxTabBar,
  props: {
    modelValue: 'string-or-number',
    value: 'string-or-number',
    items: 'json',
    fixed: 'boolean',
    safeAreaBottom: 'boolean',
    disabled: 'boolean',
    zIndex: 'number',
    indicator: 'string',
    size: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'value',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
})

// 29. pagination (tx-pagination)
const PAGINATION_PROP_SCHEMA: PropSchema = {
  currentPage: 'number',
  pageSize: 'number',
  pageSizes: 'json',
  pageSizeLabel: 'string',
  total: 'number',
  totalPages: 'number',
  prevIcon: 'string',
  nextIcon: 'string',
  showInfo: 'boolean',
  showFirstLast: 'boolean',
  ariaLabel: 'string',
  firstLabel: 'string',
  prevLabel: 'string',
  nextLabel: 'string',
  lastLabel: 'string',
}

const TxPaginationWcWrapper = defineComponent({
  name: 'Wc_tx-pagination',
  props: buildRawVueProps(PAGINATION_PROP_SCHEMA),
  setup(rawProps) {
    const host = useHost()
    const nativeAttrs = useNativeAttrProps(host, PAGINATION_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, PAGINATION_PROP_SCHEMA),
    }))

    const hasLocalPage = ref(false)
    const localPage = ref<number>(1)
    const hasLocalSize = ref(false)
    const localSize = ref<number>(10)

    watch(
      () => coercedProps.value.currentPage as number | undefined,
      (next) => {
        if (typeof next === 'number') {
          hasLocalPage.value = true
          localPage.value = next
        }
      },
      { immediate: true },
    )

    watch(
      () => coercedProps.value.pageSize as number | undefined,
      (next) => {
        if (typeof next === 'number') {
          hasLocalSize.value = true
          localSize.value = next
        }
      },
      { immediate: true },
    )

    return () => {
      const forwarded: Record<string, unknown> = {
        ...coercedProps.value,
        'onUpdate:currentPage': (page: number) => {
          hasLocalPage.value = true
          localPage.value = page
          if (host) {
            const hostObj = host as unknown as Record<string, unknown>
            if (hostObj.currentPage !== page)
              hostObj.currentPage = page
          }
          dispatchHostEvent(host, 'update:currentPage', page)
        },
        'onPageChange': (page: number) => {
          dispatchHostEvent(host, 'pageChange', page)
        },
        'onUpdate:pageSize': (size: number) => {
          hasLocalSize.value = true
          localSize.value = size
          if (host) {
            const hostObj = host as unknown as Record<string, unknown>
            if (hostObj.pageSize !== size)
              hostObj.pageSize = size
          }
          dispatchHostEvent(host, 'update:pageSize', size)
        },
        'onPageSizeChange': (size: number) => {
          dispatchHostEvent(host, 'pageSizeChange', size)
        },
      }
      if (hasLocalPage.value)
        forwarded.currentPage = localPage.value
      if (hasLocalSize.value)
        forwarded.pageSize = localSize.value

      const slotMap: Record<string, () => VNode> = {}
      if (hasHostSlotContent(host, 'info'))
        slotMap.info = () => createSlotVNode(host, 'info', false)

      return h(TxPagination, forwarded, Object.keys(slotMap).length > 0 ? slotMap : undefined)
    }
  },
})

export const paginationBundle = createTxCustomElementFromComponent('tx-pagination', TxPaginationWcWrapper)

// 30. steps (tx-steps + tx-step)
export const stepsBundle = createTxCustomElement({
  tag: 'tx-steps',
  component: TxSteps,
  props: {
    direction: 'string',
    size: 'string',
    active: 'string-or-number',
  },
  promoteProvides: true,
  slots: ['default'],
})

export const stepBundle = createTxCustomElement({
  tag: 'tx-step',
  component: TxStep,
  props: {
    title: 'string',
    description: 'string',
    icon: 'string',
    status: 'string',
    step: 'string-or-number',
    clickable: 'boolean',
    disabled: 'boolean',
    showLine: 'boolean',
    completedIcon: 'string',
  },
})

// 31. loading-overlay (tx-loading-overlay)
export const loadingOverlayBundle = createTxCustomElement({
  tag: 'tx-loading-overlay',
  component: TxLoadingOverlay,
  props: {
    loading: 'boolean',
    fullscreen: 'boolean',
    text: 'string',
    spinnerSize: 'number',
    background: 'string',
  },
  slots: ['default'],
})

// 32. modal (tx-modal)
export const modalBundle = createTxCustomElement({
  tag: 'tx-modal',
  component: TxModal,
  props: {
    modelValue: 'boolean',
    open: 'boolean',
    visible: 'boolean',
    title: 'string',
    width: 'string',
    fullscreen: 'boolean',
    closeLabel: 'string',
    surface: 'string',
    surfaceColor: 'string',
    surfaceOpacity: 'number',
    beforeClose: 'any',
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
  emits: ['update:modelValue', 'close'],
  teleportSlots: true,
  slots: ['header', 'default', 'footer'],
})

// 33. toast (tx-toast)
// Dual-mode: acts as global TxToastHost when used without inline message props,
// or renders an inline declarative `.tx-toast` card when `title`/`description`/`message` or default slot is provided.
const TOAST_PROP_SCHEMA: PropSchema = {
  position: 'string',
  visibleToasts: 'number',
  expand: 'boolean',
  gap: 'number',
  offset: 'number',
  swipeToDismiss: 'boolean',
  ariaLabel: 'string',
  closeLabel: 'string',
  title: 'string',
  description: 'string',
  message: 'string',
  variant: 'string',
  open: 'boolean',
  closable: 'boolean',
}

const TOAST_GLYPHS: Record<string, string> = {
  default: '',
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  danger: 'x-circle',
}

const TxToastWcWrapper = defineComponent({
  name: 'Wc_tx-toast',
  props: buildRawVueProps(TOAST_PROP_SCHEMA),
  setup(rawProps, { expose }) {
    const host = useHost()
    const nativeAttrs = useNativeAttrProps(host, TOAST_PROP_SCHEMA)
    onBeforeUnmount(() => nativeAttrs.cleanup())

    const coercedProps = computed(() => ({
      ...nativeAttrs.nativeValues,
      ...coercePropsBySchema(rawProps as Record<string, unknown>, TOAST_PROP_SCHEMA),
    }))

    const inlineOpen = ref(true)
    watch(
      () => coercedProps.value.open as boolean | undefined,
      (next) => {
        if (typeof next === 'boolean')
          inlineOpen.value = next
      },
      { immediate: true },
    )

    expose({
      show: triggerToast,
      dismiss: dismissToast,
      clear: clearToasts,
      pause: pauseToasts,
      resume: resumeToasts,
    })

    return () => {
      const p = coercedProps.value
      const hasInlineContent = Boolean(
        p.title !== undefined
        || p.description !== undefined
        || p.message !== undefined
        || hasHostSlotContent(host, 'default'),
      )

      if (!hasInlineContent) {
        return h(TxToastHost, {
          position: p.position as any,
          visibleToasts: p.visibleToasts as number | undefined,
          expand: p.expand as boolean | undefined,
          gap: p.gap as number | undefined,
          offset: p.offset as number | undefined,
          swipeToDismiss: p.swipeToDismiss as boolean | undefined,
          ariaLabel: p.ariaLabel as string | undefined,
          closeLabel: p.closeLabel as string | undefined,
        })
      }

      if (!inlineOpen.value)
        return null

      const variant = (typeof p.variant === 'string' && p.variant in TOAST_GLYPHS) ? p.variant : 'default'
      const glyph = TOAST_GLYPHS[variant]
      const desc = (p.description as string | undefined) ?? (p.message as string | undefined)
      const closable = p.closable !== false
      const closeLabel = (p.closeLabel as string | undefined) ?? 'Dismiss notification'

      return h(
        'div',
        {
          'class': ['tx-toast', `tx-toast--${variant}`, 'tx-toast--inline'],
          'role': variant === 'danger' ? 'alert' : 'status',
          'data-front': 'true',
          'data-visible': 'true',
          'style': { position: 'relative', pointerEvents: 'auto' },
        },
        [
          h('div', { class: 'tx-toast__inner' }, [
            glyph ? h('span', { class: 'tx-toast__icon' }, [h(TxIcon, { name: glyph })]) : null,
            h('div', { class: 'tx-toast__content' }, [
              p.title ? h('div', { class: 'tx-toast__title' }, String(p.title)) : null,
              desc ? h('div', { class: 'tx-toast__desc' }, desc) : null,
              hasHostSlotContent(host, 'default') ? createSlotVNode(host, 'default', false) : null,
            ]),
            closable
              ? h('button', {
                  'type': 'button',
                  'class': 'tx-toast__close',
                  'aria-label': closeLabel,
                  'onClick': () => {
                    inlineOpen.value = false
                    dispatchHostEvent(host, 'update:open', false)
                    dispatchHostEvent(host, 'close')
                    dispatchHostEvent(host, 'dismiss')
                  },
                }, [h(TxIcon, { name: 'close' })])
              : null,
          ]),
        ],
      )
    }
  },
})

export const toastBundle = createTxCustomElementFromComponent('tx-toast', TxToastWcWrapper)

// 34. toast-panel (tx-toast-panel)
export const toastPanelBundle = createTxCustomElement({
  tag: 'tx-toast-panel',
  component: TxToastPanel,
  props: {
    open: 'boolean',
    tether: 'boolean',
    tetherLength: 'number',
    side: 'string',
    stack: 'number',
    ariaLabel: 'string',
    live: 'string',
  },
  slots: ['tether', 'default'],
})

// 35. timeline (tx-timeline + tx-timeline-item)
export const timelineBundle = createTxCustomElement({
  tag: 'tx-timeline',
  component: TxTimeline,
  props: {
    layout: 'string',
  },
  promoteProvides: true,
  slots: ['default'],
})

export const timelineItemBundle = createTxCustomElement({
  tag: 'tx-timeline-item',
  component: TxTimelineItem,
  props: {
    title: 'string',
    time: 'string',
    icon: 'string',
    color: 'string',
    active: 'boolean',
  },
  slots: ['default'],
})

export const TxContainerElement = containerBundle.ElementClass
export const defineTxContainer = containerBundle.define

export const TxHeaderElement = headerBundle.ElementClass
export const defineTxHeader = headerBundle.define

export const TxAsideElement = asideBundle.ElementClass
export const defineTxAside = asideBundle.define

export const TxMainElement = mainBundle.ElementClass
export const defineTxMain = mainBundle.define

export const TxFooterElement = footerBundle.ElementClass
export const defineTxFooter = footerBundle.define

export const TxFlexElement = flexBundle.ElementClass
export const defineTxFlex = flexBundle.define

export const TxGridElement = gridBundle.ElementClass
export const defineTxGrid = gridBundle.define

export const TxGridItemElement = gridItemBundle.ElementClass
export const defineTxGridItem = gridItemBundle.define

export const TxGridLayoutElement = gridLayoutBundle.ElementClass
export const defineTxGridLayout = gridLayoutBundle.define

export const TxStackElement = stackBundle.ElementClass
export const defineTxStack = stackBundle.define

export const TxSplitterElement = splitterBundle.ElementClass
export const defineTxSplitter = splitterBundle.define

export const TxScrollElement = scrollBundle.ElementClass
export const defineTxScroll = scrollBundle.define

export const TxGroupBlockElement = groupBlockBundle.ElementClass
export const defineTxGroupBlock = groupBlockBundle.define

export const TxBlockLineElement = blockLineBundle.ElementClass
export const defineTxBlockLine = blockLineBundle.define

export const TxBlockSlotElement = blockSlotBundle.ElementClass
export const defineTxBlockSlot = blockSlotBundle.define

export const TxBlockSwitchElement = blockSwitchBundle.ElementClass
export const defineTxBlockSwitch = blockSwitchBundle.define

export const TxCardItemElement = cardItemBundle.ElementClass
export const defineTxCardItem = cardItemBundle.define

export const TxLayoutSkeletonElement = layoutSkeletonBundle.ElementClass
export const defineTxLayoutSkeleton = layoutSkeletonBundle.define

export const TxTextElement = textBundle.ElementClass
export const defineTxText = textBundle.define

export const TxIconElement = iconBundle.ElementClass
export const defineTxIcon = iconBundle.define

export const TxIconChipElement = iconChipBundle.ElementClass
export const defineTxIconChip = iconChipBundle.define

export const TxCellLinkElement = cellLinkBundle.ElementClass
export const defineTxCellLink = cellLinkBundle.define

export const TxBlankSlateElement = blankSlateBundle.ElementClass
export const defineTxBlankSlate = blankSlateBundle.define

export const TxEmptyStateElement = emptyStateBundle.ElementClass
export const defineTxEmptyState = emptyStateBundle.define

export const TxErrorStateElement = errorStateBundle.ElementClass
export const defineTxErrorState = errorStateBundle.define

export const TxGuideStateElement = guideStateBundle.ElementClass
export const defineTxGuideState = guideStateBundle.define

export const TxLoadingStateElement = loadingStateBundle.ElementClass
export const defineTxLoadingState = loadingStateBundle.define

export const TxNoDataElement = noDataBundle.ElementClass
export const defineTxNoData = noDataBundle.define

export const TxNoSelectionElement = noSelectionBundle.ElementClass
export const defineTxNoSelection = noSelectionBundle.define

export const TxOfflineStateElement = offlineStateBundle.ElementClass
export const defineTxOfflineState = offlineStateBundle.define

export const TxPermissionStateElement = permissionStateBundle.ElementClass
export const defineTxPermissionState = permissionStateBundle.define

export const TxSearchEmptyElement = searchEmptyBundle.ElementClass
export const defineTxSearchEmpty = searchEmptyBundle.define

export const TxBreadcrumbElement = breadcrumbBundle.ElementClass
export const defineTxBreadcrumb = breadcrumbBundle.define

export const TxBreadcrumbItemElement = breadcrumbItemBundle.ElementClass
export const defineTxBreadcrumbItem = breadcrumbItemBundle.define

export const TxNavBarElement = navBarBundle.ElementClass
export const defineTxNavBar = navBarBundle.define

export const TxSidebarNavElement = sidebarNavBundle.ElementClass
export const defineTxSidebarNav = sidebarNavBundle.define

export const TxTabBarElement = tabBarBundle.ElementClass
export const defineTxTabBar = tabBarBundle.define

export const TxPaginationElement = paginationBundle.ElementClass
export const defineTxPagination = paginationBundle.define

export const TxStepsElement = stepsBundle.ElementClass
export const defineTxSteps = stepsBundle.define

export const TxStepElement = stepBundle.ElementClass
export const defineTxStep = stepBundle.define

export const TxLoadingOverlayElement = loadingOverlayBundle.ElementClass
export const defineTxLoadingOverlay = loadingOverlayBundle.define

export const TxModalElement = modalBundle.ElementClass
export const defineTxModal = modalBundle.define

export const TxToastElement = toastBundle.ElementClass
export const defineTxToast = toastBundle.define

export const TxToastPanelElement = toastPanelBundle.ElementClass
export const defineTxToastPanel = toastPanelBundle.define

export const TxTimelineElement = timelineBundle.ElementClass
export const defineTxTimeline = timelineBundle.define

export const TxTimelineItemElement = timelineItemBundle.ElementClass
export const defineTxTimelineItem = timelineItemBundle.define

export const BASE_A_BUNDLES = [
  containerBundle,
  headerBundle,
  asideBundle,
  mainBundle,
  footerBundle,
  flexBundle,
  gridBundle,
  gridItemBundle,
  gridLayoutBundle,
  stackBundle,
  splitterBundle,
  scrollBundle,
  groupBlockBundle,
  blockLineBundle,
  blockSlotBundle,
  blockSwitchBundle,
  cardItemBundle,
  layoutSkeletonBundle,
  textBundle,
  iconBundle,
  iconChipBundle,
  cellLinkBundle,
  blankSlateBundle,
  emptyStateBundle,
  errorStateBundle,
  guideStateBundle,
  loadingStateBundle,
  noDataBundle,
  noSelectionBundle,
  offlineStateBundle,
  permissionStateBundle,
  searchEmptyBundle,
  breadcrumbBundle,
  breadcrumbItemBundle,
  navBarBundle,
  sidebarNavBundle,
  tabBarBundle,
  paginationBundle,
  stepsBundle,
  stepBundle,
  loadingOverlayBundle,
  modalBundle,
  toastBundle,
  toastPanelBundle,
  timelineBundle,
  timelineItemBundle,
] as const
