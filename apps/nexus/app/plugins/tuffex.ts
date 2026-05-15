import { defineAsyncComponent, type Component } from 'vue'

type TuffexModule = Record<string, unknown>
type TuffexModuleLoader = () => Promise<TuffexModule>

function asyncTuffexComponent(loader: TuffexModuleLoader, exportName: string) {
  return defineAsyncComponent(async () => {
    const module = await loader()
    const component = module[exportName]
    if (!component)
      throw new Error(`Tuffex component export not found: ${exportName}`)
    return component as Component
  })
}

const fromAgents = () => import('@talex-touch/tuffex/packages/components/src/agents')
const fromAlert = () => import('@talex-touch/tuffex/packages/components/src/alert')
const fromAutoSizer = () => import('@talex-touch/tuffex/packages/components/src/auto-sizer')
const fromAvatar = () => import('@talex-touch/tuffex/packages/components/src/avatar')
const fromBadge = () => import('@talex-touch/tuffex/packages/components/src/badge')
const fromBaseAnchor = () => import('@talex-touch/tuffex/packages/components/src/base-anchor')
const fromBaseSurface = () => import('@talex-touch/tuffex/packages/components/src/base-surface')
const fromBlankSlate = () => import('@talex-touch/tuffex/packages/components/src/blank-slate')
const fromBreadcrumb = () => import('@talex-touch/tuffex/packages/components/src/breadcrumb')
const fromButton = () => import('@talex-touch/tuffex/packages/components/src/button')
const fromCard = () => import('@talex-touch/tuffex/packages/components/src/card')
const fromCardItem = () => import('@talex-touch/tuffex/packages/components/src/card-item')
const fromCascader = () => import('@talex-touch/tuffex/packages/components/src/cascader')
const fromChat = () => import('@talex-touch/tuffex/packages/components/src/chat')
const fromCheckbox = () => import('@talex-touch/tuffex/packages/components/src/checkbox')
const fromCodeEditor = () => import('@talex-touch/tuffex/packages/components/src/code-editor')
const fromCollapse = () => import('@talex-touch/tuffex/packages/components/src/collapse')
const fromCommandPalette = () => import('@talex-touch/tuffex/packages/components/src/command-palette')
const fromContainer = () => import('@talex-touch/tuffex/packages/components/src/container')
const fromContextMenu = () => import('@talex-touch/tuffex/packages/components/src/context-menu')
const fromCornerOverlay = () => import('@talex-touch/tuffex/packages/components/src/corner-overlay')
const fromDataTable = () => import('@talex-touch/tuffex/packages/components/src/data-table')
const fromDatePicker = () => import('@talex-touch/tuffex/packages/components/src/date-picker')
const fromDialog = () => import('@talex-touch/tuffex/packages/components/src/dialog')
const fromDrawer = () => import('@talex-touch/tuffex/packages/components/src/drawer')
const fromDropdownMenu = () => import('@talex-touch/tuffex/packages/components/src/dropdown-menu')
const fromEdgeFadeMask = () => import('@talex-touch/tuffex/packages/components/src/edge-fade-mask')
const fromEmpty = () => import('@talex-touch/tuffex/packages/components/src/empty')
const fromEmptyState = () => import('@talex-touch/tuffex/packages/components/src/empty-state')
const fromErrorState = () => import('@talex-touch/tuffex/packages/components/src/error-state')
const fromFileUploader = () => import('@talex-touch/tuffex/packages/components/src/file-uploader')
const fromFlatButton = () => import('@talex-touch/tuffex/packages/components/src/flat-button')
const fromFlatRadio = () => import('@talex-touch/tuffex/packages/components/src/flat-radio')
const fromFlatSelect = () => import('@talex-touch/tuffex/packages/components/src/flat-select')
const fromFlex = () => import('@talex-touch/tuffex/packages/components/src/flex')
const fromFlipOverlay = () => import('@talex-touch/tuffex/packages/components/src/flip-overlay')
const fromFloating = () => import('@talex-touch/tuffex/packages/components/src/floating')
const fromForm = () => import('@talex-touch/tuffex/packages/components/src/form')
const fromFusion = () => import('@talex-touch/tuffex/packages/components/src/fusion')
const fromGlassSurface = () => import('@talex-touch/tuffex/packages/components/src/glass-surface')
const fromGlowText = () => import('@talex-touch/tuffex/packages/components/src/glow-text')
const fromGradientBorder = () => import('@talex-touch/tuffex/packages/components/src/gradient-border')
const fromGradualBlur = () => import('@talex-touch/tuffex/packages/components/src/gradual-blur')
const fromGrid = () => import('@talex-touch/tuffex/packages/components/src/grid')
const fromGridLayout = () => import('@talex-touch/tuffex/packages/components/src/grid-layout')
const fromGroupBlock = () => import('@talex-touch/tuffex/packages/components/src/group-block')
const fromGuideState = () => import('@talex-touch/tuffex/packages/components/src/guide-state')
const fromIcon = () => import('@talex-touch/tuffex/packages/components/src/icon')
const fromImageGallery = () => import('@talex-touch/tuffex/packages/components/src/image-gallery')
const fromImageUploader = () => import('@talex-touch/tuffex/packages/components/src/image-uploader')
const fromInput = () => import('@talex-touch/tuffex/packages/components/src/input')
const fromKeyframeStrokeText = () => import('@talex-touch/tuffex/packages/components/src/keyframe-stroke-text')
const fromLayoutSkeleton = () => import('@talex-touch/tuffex/packages/components/src/layout-skeleton')
const fromLoadingOverlay = () => import('@talex-touch/tuffex/packages/components/src/loading-overlay')
const fromLoadingState = () => import('@talex-touch/tuffex/packages/components/src/loading-state')
const fromMarkdownView = () => import('@talex-touch/tuffex/packages/components/src/markdown-view')
const fromModal = () => import('@talex-touch/tuffex/packages/components/src/modal')
const fromNavBar = () => import('@talex-touch/tuffex/packages/components/src/nav-bar')
const fromNoData = () => import('@talex-touch/tuffex/packages/components/src/no-data')
const fromNoSelection = () => import('@talex-touch/tuffex/packages/components/src/no-selection')
const fromOfflineState = () => import('@talex-touch/tuffex/packages/components/src/offline-state')
const fromOutlineBorder = () => import('@talex-touch/tuffex/packages/components/src/outline-border')
const fromPagination = () => import('@talex-touch/tuffex/packages/components/src/pagination')
const fromPermissionState = () => import('@talex-touch/tuffex/packages/components/src/permission-state')
const fromPicker = () => import('@talex-touch/tuffex/packages/components/src/picker')
const fromPopover = () => import('@talex-touch/tuffex/packages/components/src/popover')
const fromProgress = () => import('@talex-touch/tuffex/packages/components/src/progress')
const fromProgressBar = () => import('@talex-touch/tuffex/packages/components/src/progress-bar')
const fromRadio = () => import('@talex-touch/tuffex/packages/components/src/radio')
const fromRating = () => import('@talex-touch/tuffex/packages/components/src/rating')
const fromScroll = () => import('@talex-touch/tuffex/packages/components/src/scroll')
const fromSearchEmpty = () => import('@talex-touch/tuffex/packages/components/src/search-empty')
const fromSearchInput = () => import('@talex-touch/tuffex/packages/components/src/search-input')
const fromSearchSelect = () => import('@talex-touch/tuffex/packages/components/src/search-select')
const fromSegmentedSlider = () => import('@talex-touch/tuffex/packages/components/src/segmented-slider')
const fromSelect = () => import('@talex-touch/tuffex/packages/components/src/select')
const fromSkeleton = () => import('@talex-touch/tuffex/packages/components/src/skeleton')
const fromSlider = () => import('@talex-touch/tuffex/packages/components/src/slider')
const fromSortableList = () => import('@talex-touch/tuffex/packages/components/src/sortable-list')
const fromSpinner = () => import('@talex-touch/tuffex/packages/components/src/spinner')
const fromSplitter = () => import('@talex-touch/tuffex/packages/components/src/splitter')
const fromStack = () => import('@talex-touch/tuffex/packages/components/src/stack')
const fromStagger = () => import('@talex-touch/tuffex/packages/components/src/stagger')
const fromStatCard = () => import('@talex-touch/tuffex/packages/components/src/stat-card')
const fromStatusBadge = () => import('@talex-touch/tuffex/packages/components/src/status-badge')
const fromSteps = () => import('@talex-touch/tuffex/packages/components/src/steps')
const fromSwitch = () => import('@talex-touch/tuffex/packages/components/src/switch')
const fromTabBar = () => import('@talex-touch/tuffex/packages/components/src/tab-bar')
const fromTabs = () => import('@talex-touch/tuffex/packages/components/src/tabs')
const fromTag = () => import('@talex-touch/tuffex/packages/components/src/tag')
const fromTagInput = () => import('@talex-touch/tuffex/packages/components/src/tag-input')
const fromTextTransformer = () => import('@talex-touch/tuffex/packages/components/src/text-transformer')
const fromTimeline = () => import('@talex-touch/tuffex/packages/components/src/timeline')
const fromToast = () => import('@talex-touch/tuffex/packages/components/src/toast')
const fromTooltip = () => import('@talex-touch/tuffex/packages/components/src/tooltip')
const fromTransfer = () => import('@talex-touch/tuffex/packages/components/src/transfer')
const fromTransition = () => import('@talex-touch/tuffex/packages/components/src/transition')
const fromTree = () => import('@talex-touch/tuffex/packages/components/src/tree')
const fromTreeSelect = () => import('@talex-touch/tuffex/packages/components/src/tree-select')
const fromTuffLogoStroke = () => import('@talex-touch/tuffex/packages/components/src/tuff-logo-stroke')
const fromVirtualList = () => import('@talex-touch/tuffex/packages/components/src/virtual-list')

const GLOBAL_TUFFEX_COMPONENTS = {
  TuffFlatButton: asyncTuffexComponent(fromFlatButton, 'TuffFlatButton'),
  TuffIcon: asyncTuffexComponent(fromIcon, 'TuffIcon'),
  TuffInput: asyncTuffexComponent(fromInput, 'TuffInput'),
  TuffProgress: asyncTuffexComponent(fromProgress, 'TuffProgress'),
  TuffSelect: asyncTuffexComponent(fromSelect, 'TuffSelect'),
  TuffSelectItem: asyncTuffexComponent(fromSelect, 'TuffSelectItem'),
  TuffSwitch: asyncTuffexComponent(fromSwitch, 'TuffSwitch'),
  TxAgentsList: asyncTuffexComponent(fromAgents, 'TxAgentsList'),
  TxAlert: asyncTuffexComponent(fromAlert, 'TxAlert'),
  TxAutoSizer: asyncTuffexComponent(fromAutoSizer, 'TxAutoSizer'),
  TxAvatar: asyncTuffexComponent(fromAvatar, 'TxAvatar'),
  TxAvatarGroup: asyncTuffexComponent(fromAvatar, 'TxAvatarGroup'),
  TxBadge: asyncTuffexComponent(fromBadge, 'TxBadge'),
  TxBaseAnchor: asyncTuffexComponent(fromBaseAnchor, 'TxBaseAnchor'),
  TxBaseSurface: asyncTuffexComponent(fromBaseSurface, 'TxBaseSurface'),
  TxBlankSlate: asyncTuffexComponent(fromBlankSlate, 'TxBlankSlate'),
  TxBlockLine: asyncTuffexComponent(fromGroupBlock, 'TxBlockLine'),
  TxBlockSlot: asyncTuffexComponent(fromGroupBlock, 'TxBlockSlot'),
  TxBlockSwitch: asyncTuffexComponent(fromGroupBlock, 'TxBlockSwitch'),
  TxBlowDialog: asyncTuffexComponent(fromDialog, 'TxBlowDialog'),
  TxBottomDialog: asyncTuffexComponent(fromDialog, 'TxBottomDialog'),
  TxBreadcrumb: asyncTuffexComponent(fromBreadcrumb, 'TxBreadcrumb'),
  TxButton: asyncTuffexComponent(fromButton, 'TxButton'),
  TxCard: asyncTuffexComponent(fromCard, 'TxCard'),
  TxCardItem: asyncTuffexComponent(fromCardItem, 'TxCardItem'),
  TxCascader: asyncTuffexComponent(fromCascader, 'TxCascader'),
  TxChatComposer: asyncTuffexComponent(fromChat, 'TxChatComposer'),
  TxChatList: asyncTuffexComponent(fromChat, 'TxChatList'),
  TxCheckbox: asyncTuffexComponent(fromCheckbox, 'TxCheckbox'),
  TxCodeEditor: asyncTuffexComponent(fromCodeEditor, 'TxCodeEditor'),
  TxCodeEditorToolbar: asyncTuffexComponent(fromCodeEditor, 'TxCodeEditorToolbar'),
  TxCol: asyncTuffexComponent(fromContainer, 'TxCol'),
  TxCollapse: asyncTuffexComponent(fromCollapse, 'TxCollapse'),
  TxCollapseItem: asyncTuffexComponent(fromCollapse, 'TxCollapseItem'),
  TxCommandPalette: asyncTuffexComponent(fromCommandPalette, 'TxCommandPalette'),
  TxContainer: asyncTuffexComponent(fromContainer, 'TxContainer'),
  TxContextMenu: asyncTuffexComponent(fromContextMenu, 'TxContextMenu'),
  TxContextMenuItem: asyncTuffexComponent(fromContextMenu, 'TxContextMenuItem'),
  TxCornerOverlay: asyncTuffexComponent(fromCornerOverlay, 'TxCornerOverlay'),
  TxDataTable: asyncTuffexComponent(fromDataTable, 'TxDataTable'),
  TxDatePicker: asyncTuffexComponent(fromDatePicker, 'TxDatePicker'),
  TxDrawer: asyncTuffexComponent(fromDrawer, 'TxDrawer'),
  TxDropdownItem: asyncTuffexComponent(fromDropdownMenu, 'TxDropdownItem'),
  TxDropdownMenu: asyncTuffexComponent(fromDropdownMenu, 'TxDropdownMenu'),
  TxEdgeFadeMask: asyncTuffexComponent(fromEdgeFadeMask, 'TxEdgeFadeMask'),
  TxEmpty: asyncTuffexComponent(fromEmpty, 'TxEmpty'),
  TxEmptyState: asyncTuffexComponent(fromEmptyState, 'TxEmptyState'),
  TxErrorState: asyncTuffexComponent(fromErrorState, 'TxErrorState'),
  TxFileUploader: asyncTuffexComponent(fromFileUploader, 'TxFileUploader'),
  TxFlatRadio: asyncTuffexComponent(fromFlatRadio, 'TxFlatRadio'),
  TxFlatRadioItem: asyncTuffexComponent(fromFlatRadio, 'TxFlatRadioItem'),
  TxFlatSelect: asyncTuffexComponent(fromFlatSelect, 'TxFlatSelect'),
  TxFlatSelectItem: asyncTuffexComponent(fromFlatSelect, 'TxFlatSelectItem'),
  TxFlex: asyncTuffexComponent(fromFlex, 'TxFlex'),
  TxFlipOverlay: asyncTuffexComponent(fromFlipOverlay, 'TxFlipOverlay'),
  TxFloating: asyncTuffexComponent(fromFloating, 'TxFloating'),
  TxFloatingElement: asyncTuffexComponent(fromFloating, 'TxFloatingElement'),
  TxForm: asyncTuffexComponent(fromForm, 'TxForm'),
  TxFormItem: asyncTuffexComponent(fromForm, 'TxFormItem'),
  TxFusion: asyncTuffexComponent(fromFusion, 'TxFusion'),
  TxGlassSurface: asyncTuffexComponent(fromGlassSurface, 'TxGlassSurface'),
  TxGlowText: asyncTuffexComponent(fromGlowText, 'TxGlowText'),
  TxGradientBorder: asyncTuffexComponent(fromGradientBorder, 'TxGradientBorder'),
  TxGradualBlur: asyncTuffexComponent(fromGradualBlur, 'TxGradualBlur'),
  TxGrid: asyncTuffexComponent(fromGrid, 'TxGrid'),
  TxGridItem: asyncTuffexComponent(fromGrid, 'TxGridItem'),
  TxGridLayout: asyncTuffexComponent(fromGridLayout, 'TxGridLayout'),
  TxGroupBlock: asyncTuffexComponent(fromGroupBlock, 'TxGroupBlock'),
  TxGuideState: asyncTuffexComponent(fromGuideState, 'TxGuideState'),
  TxIcon: asyncTuffexComponent(fromIcon, 'TxIcon'),
  TxImageGallery: asyncTuffexComponent(fromImageGallery, 'TxImageGallery'),
  TxImageUploader: asyncTuffexComponent(fromImageUploader, 'TxImageUploader'),
  TxKeyframeStrokeText: asyncTuffexComponent(fromKeyframeStrokeText, 'TxKeyframeStrokeText'),
  TxLayoutSkeleton: asyncTuffexComponent(fromLayoutSkeleton, 'TxLayoutSkeleton'),
  TxLoadingOverlay: asyncTuffexComponent(fromLoadingOverlay, 'TxLoadingOverlay'),
  TxLoadingState: asyncTuffexComponent(fromLoadingState, 'TxLoadingState'),
  TxMarkdownView: asyncTuffexComponent(fromMarkdownView, 'TxMarkdownView'),
  TxModal: asyncTuffexComponent(fromModal, 'TxModal'),
  TxNavBar: asyncTuffexComponent(fromNavBar, 'TxNavBar'),
  TxNoData: asyncTuffexComponent(fromNoData, 'TxNoData'),
  TxNoSelection: asyncTuffexComponent(fromNoSelection, 'TxNoSelection'),
  TxOfflineState: asyncTuffexComponent(fromOfflineState, 'TxOfflineState'),
  TxOutlineBorder: asyncTuffexComponent(fromOutlineBorder, 'TxOutlineBorder'),
  TxPagination: asyncTuffexComponent(fromPagination, 'TxPagination'),
  TxPermissionState: asyncTuffexComponent(fromPermissionState, 'TxPermissionState'),
  TxPicker: asyncTuffexComponent(fromPicker, 'TxPicker'),
  TxPopover: asyncTuffexComponent(fromPopover, 'TxPopover'),
  TxPopperDialog: asyncTuffexComponent(fromDialog, 'TxPopperDialog'),
  TxProgressBar: asyncTuffexComponent(fromProgressBar, 'TxProgressBar'),
  TxRadio: asyncTuffexComponent(fromRadio, 'TxRadio'),
  TxRadioGroup: asyncTuffexComponent(fromRadio, 'TxRadioGroup'),
  TxRating: asyncTuffexComponent(fromRating, 'TxRating'),
  TxRow: asyncTuffexComponent(fromContainer, 'TxRow'),
  TxScroll: asyncTuffexComponent(fromScroll, 'TxScroll'),
  TxSearchEmpty: asyncTuffexComponent(fromSearchEmpty, 'TxSearchEmpty'),
  TxSearchInput: asyncTuffexComponent(fromSearchInput, 'TxSearchInput'),
  TxSearchSelect: asyncTuffexComponent(fromSearchSelect, 'TxSearchSelect'),
  TxSegmentedSlider: asyncTuffexComponent(fromSegmentedSlider, 'TxSegmentedSlider'),
  TxSkeleton: asyncTuffexComponent(fromSkeleton, 'TxSkeleton'),
  TxSlider: asyncTuffexComponent(fromSlider, 'TxSlider'),
  TxSortableList: asyncTuffexComponent(fromSortableList, 'TxSortableList'),
  TxSpinner: asyncTuffexComponent(fromSpinner, 'TxSpinner'),
  TxSplitButton: asyncTuffexComponent(fromButton, 'TxSplitButton'),
  TxSplitter: asyncTuffexComponent(fromSplitter, 'TxSplitter'),
  TxStack: asyncTuffexComponent(fromStack, 'TxStack'),
  TxStagger: asyncTuffexComponent(fromStagger, 'TxStagger'),
  TxStatCard: asyncTuffexComponent(fromStatCard, 'TxStatCard'),
  TxStatusBadge: asyncTuffexComponent(fromStatusBadge, 'TxStatusBadge'),
  TxStatusIcon: asyncTuffexComponent(fromIcon, 'TxStatusIcon'),
  TxStep: asyncTuffexComponent(fromSteps, 'TxStep'),
  TxSteps: asyncTuffexComponent(fromSteps, 'TxSteps'),
  TxSwitch: asyncTuffexComponent(fromSwitch, 'TuffSwitch'),
  TxTabBar: asyncTuffexComponent(fromTabBar, 'TxTabBar'),
  TxTabHeader: asyncTuffexComponent(fromTabs, 'TxTabHeader'),
  TxTabItem: asyncTuffexComponent(fromTabs, 'TxTabItem'),
  TxTabs: asyncTuffexComponent(fromTabs, 'TxTabs'),
  TxTag: asyncTuffexComponent(fromTag, 'TxTag'),
  TxTagInput: asyncTuffexComponent(fromTagInput, 'TxTagInput'),
  TxTextTransformer: asyncTuffexComponent(fromTextTransformer, 'TxTextTransformer'),
  TxTimeline: asyncTuffexComponent(fromTimeline, 'TxTimeline'),
  TxTimelineItem: asyncTuffexComponent(fromTimeline, 'TxTimelineItem'),
  TxToastHost: asyncTuffexComponent(fromToast, 'TxToastHost'),
  TxTooltip: asyncTuffexComponent(fromTooltip, 'TxTooltip'),
  TxTouchTip: asyncTuffexComponent(fromDialog, 'TxTouchTip'),
  TxTransfer: asyncTuffexComponent(fromTransfer, 'TxTransfer'),
  TxTransition: asyncTuffexComponent(fromTransition, 'TxTransition'),
  TxTransitionFade: asyncTuffexComponent(fromTransition, 'TxTransitionFade'),
  TxTransitionRebound: asyncTuffexComponent(fromTransition, 'TxTransitionRebound'),
  TxTransitionSlideFade: asyncTuffexComponent(fromTransition, 'TxTransitionSlideFade'),
  TxTree: asyncTuffexComponent(fromTree, 'TxTree'),
  TxTreeSelect: asyncTuffexComponent(fromTreeSelect, 'TxTreeSelect'),
  TxTuffLogoStroke: asyncTuffexComponent(fromTuffLogoStroke, 'TxTuffLogoStroke'),
  TxTypingIndicator: asyncTuffexComponent(fromChat, 'TxTypingIndicator'),
  TxVirtualList: asyncTuffexComponent(fromVirtualList, 'TxVirtualList'),
} as const

export default defineNuxtPlugin((nuxtApp) => {
  for (const [name, component] of Object.entries(GLOBAL_TUFFEX_COMPONENTS))
    nuxtApp.vueApp.component(name, component)
})
