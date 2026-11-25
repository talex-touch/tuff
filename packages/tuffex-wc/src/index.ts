import './styles/index.scss'

export {
  ALL_TUFFEX_ELEMENT_BUNDLES,
  TIER_A_BUNDLES,
  TIER_B_BUNDLES,
  TIER_C_BUNDLES,
  // Tier A (18)
  TxAlertElement,
  TxAvatarElement,
  TxBadgeElement,
  TxButtonElement,
  TxCardElement,
  TxDividerElement,
  TxDotIndicatorElement,
  TxEmptyElement,
  TxKbdElement,
  TxProgressBarElement,
  TxProgressElement,
  TxSkeletonElement,
  TxSpinnerElement,
  TxStatCardElement,
  TxStatusBadgeElement,
  TxStatusHintElement,
  TxSwitchElement,
  TxTagElement,
  // Tier B (12 modules / 16 tags)
  TxCheckboxElement,
  TxCollapseElement,
  TxCollapseItemElement,
  TxDialogElement,
  TxDrawerElement,
  TxInputElement,
  TxPopoverElement,
  TxRadioElement,
  TxRadioGroupElement,
  TxSelectElement,
  TxSelectItemElement,
  TxSliderElement,
  TxTabItemElement,
  TxTabsElement,
  TxTextareaElement,
  TxTooltipElement,
  // Tier C (2)
  TxMarkdownViewElement,
  TxStreamTextElement,
  // Individual defineTx* helpers
  defineTxAlert,
  defineTxAvatar,
  defineTxBadge,
  defineTxButton,
  defineTxCard,
  defineTxCheckbox,
  defineTxCollapse,
  defineTxCollapseItem,
  defineTxDialog,
  defineTxDivider,
  defineTxDotIndicator,
  defineTxDrawer,
  defineTxEmpty,
  defineTxInput,
  defineTxKbd,
  defineTxMarkdownView,
  defineTxPopover,
  defineTxProgress,
  defineTxProgressBar,
  defineTxRadio,
  defineTxRadioGroup,
  defineTxSelect,
  defineTxSelectItem,
  defineTxSkeleton,
  defineTxSlider,
  defineTxSpinner,
  defineTxStatCard,
  defineTxStatusBadge,
  defineTxStatusHint,
  defineTxStreamText,
  defineTxSwitch,
  defineTxTabItem,
  defineTxTabs,
  defineTxTag,
  defineTxTextarea,
  defineTxTooltip,
  // Bulk registration
  registerTuffexElements,
} from './elements'

export type { RegisterTuffexElementsOptions, TxTabItemSpec } from './elements'

export {
  WC_ELEMENTS_MANIFEST,
  WC_ELEMENT_TAGS,
  WC_READY_COMPONENT_IDS,
} from './manifest'

export type {
  TuffexElementTagName,
  WcComponentId,
  WcElementManifestEntry,
  WcTier,
} from './manifest'

export {
  coerceBoolean,
  coerceBooleanOrString,
  coerceJson,
  coerceNumber,
  coercePropValue,
  coercePropsBySchema,
  coerceStringOrJson,
  coerceStringOrNumber,
} from './runtime/coerce'

export type { PropCoerceKind, PropSchema } from './runtime/coerce'

export {
  dispatchHostEvent,
  toDomEventName,
  toVueListenerProp,
} from './runtime/events'

export type { HostEventOptions } from './runtime/events'

export {
  createTxCustomElement,
  createTxCustomElementFromComponent,
  getHostSlotNodes,
  hasHostSlotContent,
} from './runtime/factory'

export type {
  DefineTxElementOptions,
  ModelSyncConfig,
  TxCustomElementConstructor,
  TxElementBundle,
  TxWrapperConfig,
} from './runtime/factory'

export {
  DEFAULT_SHADOW_HOST_CSS,
  getTuffexShadowStyles,
  injectShadowStyles,
  registerTuffexShadowStyles,
  setTuffexShadowStyles,
} from './runtime/styles'

export type {
  TuffexIntrinsicElements,
  TuffexVueCustomElements,
  TxAlertWcProps,
  TxAvatarWcProps,
  TxBadgeWcProps,
  TxBaseSurfaceMode,
  TxButtonWcProps,
  TxCardWcProps,
  TxCheckboxWcProps,
  TxCollapseItemWcProps,
  TxCollapseWcProps,
  TxCustomElement,
  TxCustomElementJSXProps,
  TxCustomElementPropsMap,
  TxDialogButtonWc,
  TxDialogWcProps,
  TxDividerWcProps,
  TxDotIndicatorWcProps,
  TxDrawerWcProps,
  TxEmptyWcProps,
  TxInputWcProps,
  TxKbdWcProps,
  TxMarkdownViewWcProps,
  TxPopoverPlacement,
  TxPopoverWcProps,
  TxProgressBarWcProps,
  TxProgressSegmentWc,
  TxProgressWcProps,
  TxRadioGroupWcProps,
  TxRadioWcProps,
  TxSelectItemWcProps,
  TxSelectOptionGroupWc,
  TxSelectOptionWc,
  TxSelectWcProps,
  TxSkeletonWcProps,
  TxSliderWcProps,
  TxSpinnerWcProps,
  TxStatCardInsightWc,
  TxStatCardWcProps,
  TxStatusBadgeWcProps,
  TxStatusHintWcProps,
  TxStreamTextWcProps,
  TxSwitchWcProps,
  TxTabItemWcProps,
  TxTabsWcProps,
  TxTagWcProps,
  TxTextareaWcProps,
  TxTooltipWcProps,
  WcAttrProps,
} from './types'
