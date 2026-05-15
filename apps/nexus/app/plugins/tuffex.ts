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

const fromAgents = () => import('@tuffex-components/agents')
const fromAlert = () => import('@tuffex-components/alert')
const fromAutoSizer = () => import('@tuffex-components/auto-sizer')
const fromAvatar = () => import('@tuffex-components/avatar')
const fromBadge = () => import('@tuffex-components/badge')
const fromBaseAnchor = () => import('@tuffex-components/base-anchor')
const fromBaseSurface = () => import('@tuffex-components/base-surface')
const fromBlankSlate = () => import('@tuffex-components/blank-slate')
const fromBreadcrumb = () => import('@tuffex-components/breadcrumb')
const fromButton = () => import('@tuffex-components/button')
const fromCard = () => import('@tuffex-components/card')
const fromCardItem = () => import('@tuffex-components/card-item')
const fromCascader = () => import('@tuffex-components/cascader')
const fromChat = () => import('@tuffex-components/chat')
const fromCheckbox = () => import('@tuffex-components/checkbox')
const fromCodeEditor = () => import('@tuffex-components/code-editor')
const fromCollapse = () => import('@tuffex-components/collapse')
const fromCommandPalette = () => import('@tuffex-components/command-palette')
const fromContainer = () => import('@tuffex-components/container')
const fromContextMenu = () => import('@tuffex-components/context-menu')
const fromCornerOverlay = () => import('@tuffex-components/corner-overlay')
const fromDataTable = () => import('@tuffex-components/data-table')
const fromDatePicker = () => import('@tuffex-components/date-picker')
const fromDialog = () => import('@tuffex-components/dialog')
const fromDrawer = () => import('@tuffex-components/drawer')
const fromDropdownMenu = () => import('@tuffex-components/dropdown-menu')
const fromEdgeFadeMask = () => import('@tuffex-components/edge-fade-mask')
const fromEmpty = () => import('@tuffex-components/empty')
const fromEmptyState = () => import('@tuffex-components/empty-state')
const fromErrorState = () => import('@tuffex-components/error-state')
const fromFileUploader = () => import('@tuffex-components/file-uploader')
const fromFlatButton = () => import('@tuffex-components/flat-button')
const fromFlatRadio = () => import('@tuffex-components/flat-radio')
const fromFlatSelect = () => import('@tuffex-components/flat-select')
const fromFlex = () => import('@tuffex-components/flex')
const fromFlipOverlay = () => import('@tuffex-components/flip-overlay')
const fromFloating = () => import('@tuffex-components/floating')
const fromForm = () => import('@tuffex-components/form')
const fromFusion = () => import('@tuffex-components/fusion')
const fromGlassSurface = () => import('@tuffex-components/glass-surface')
const fromGlowText = () => import('@tuffex-components/glow-text')
const fromGradientBorder = () => import('@tuffex-components/gradient-border')
const fromGradualBlur = () => import('@tuffex-components/gradual-blur')
const fromGrid = () => import('@tuffex-components/grid')
const fromGridLayout = () => import('@tuffex-components/grid-layout')
const fromGroupBlock = () => import('@tuffex-components/group-block')
const fromGuideState = () => import('@tuffex-components/guide-state')
const fromIcon = () => import('@tuffex-components/icon')
const fromImageGallery = () => import('@tuffex-components/image-gallery')
const fromImageUploader = () => import('@tuffex-components/image-uploader')
const fromInput = () => import('@tuffex-components/input')
const fromKeyframeStrokeText = () => import('@tuffex-components/keyframe-stroke-text')
const fromLayoutSkeleton = () => import('@tuffex-components/layout-skeleton')
const fromLoadingOverlay = () => import('@tuffex-components/loading-overlay')
const fromLoadingState = () => import('@tuffex-components/loading-state')
const fromMarkdownView = () => import('@tuffex-components/markdown-view')
const fromModal = () => import('@tuffex-components/modal')
const fromNavBar = () => import('@tuffex-components/nav-bar')
const fromNoData = () => import('@tuffex-components/no-data')
const fromNoSelection = () => import('@tuffex-components/no-selection')
const fromOfflineState = () => import('@tuffex-components/offline-state')
const fromOutlineBorder = () => import('@tuffex-components/outline-border')
const fromPagination = () => import('@tuffex-components/pagination')
const fromPermissionState = () => import('@tuffex-components/permission-state')
const fromPicker = () => import('@tuffex-components/picker')
const fromPopover = () => import('@tuffex-components/popover')
const fromProgress = () => import('@tuffex-components/progress')
const fromProgressBar = () => import('@tuffex-components/progress-bar')
const fromRadio = () => import('@tuffex-components/radio')
const fromRating = () => import('@tuffex-components/rating')
const fromScroll = () => import('@tuffex-components/scroll')
const fromSearchEmpty = () => import('@tuffex-components/search-empty')
const fromSearchInput = () => import('@tuffex-components/search-input')
const fromSearchSelect = () => import('@tuffex-components/search-select')
const fromSegmentedSlider = () => import('@tuffex-components/segmented-slider')
const fromSelect = () => import('@tuffex-components/select')
const fromSkeleton = () => import('@tuffex-components/skeleton')
const fromSlider = () => import('@tuffex-components/slider')
const fromSortableList = () => import('@tuffex-components/sortable-list')
const fromSpinner = () => import('@tuffex-components/spinner')
const fromSplitter = () => import('@tuffex-components/splitter')
const fromStack = () => import('@tuffex-components/stack')
const fromStagger = () => import('@tuffex-components/stagger')
const fromStatCard = () => import('@tuffex-components/stat-card')
const fromStatusBadge = () => import('@tuffex-components/status-badge')
const fromSteps = () => import('@tuffex-components/steps')
const fromSwitch = () => import('@tuffex-components/switch')
const fromTabBar = () => import('@tuffex-components/tab-bar')
const fromTabs = () => import('@tuffex-components/tabs')
const fromTag = () => import('@tuffex-components/tag')
const fromTagInput = () => import('@tuffex-components/tag-input')
const fromTextTransformer = () => import('@tuffex-components/text-transformer')
const fromTimeline = () => import('@tuffex-components/timeline')
const fromToast = () => import('@tuffex-components/toast')
const fromTooltip = () => import('@tuffex-components/tooltip')
const fromTransfer = () => import('@tuffex-components/transfer')
const fromTransition = () => import('@tuffex-components/transition')
const fromTree = () => import('@tuffex-components/tree')
const fromTreeSelect = () => import('@tuffex-components/tree-select')
const fromTuffLogoStroke = () => import('@tuffex-components/tuff-logo-stroke')
const fromVirtualList = () => import('@tuffex-components/virtual-list')

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
