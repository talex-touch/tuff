import TxAlert from '@tuffex-src/alert/src/TxAlert.vue'
import TxAvatar from '@tuffex-src/avatar/src/TxAvatar.vue'
import TxBadge from '@tuffex-src/badge/src/TxBadge.vue'
import TxButton from '@tuffex-src/button/src/button.vue'
import '@tuffex-src/button/src/style/index.scss'
import TxCard from '@tuffex-src/card/src/TxCard.vue'
import TxDivider from '@tuffex-src/divider/src/TxDivider.vue'
import TxDotIndicator from '@tuffex-src/dot-indicator/src/TxDotIndicator.vue'
import TxEmpty from '@tuffex-src/empty/src/TxEmpty.vue'
import TxKbd from '@tuffex-src/kbd/src/TxKbd.vue'
import TxProgressBar from '@tuffex-src/progress-bar/src/TxProgressBar.vue'
import TxProgress from '@tuffex-src/progress/src/TxProgress.vue'
import TxSkeleton from '@tuffex-src/skeleton/src/TxSkeleton.vue'
import TxSpinner from '@tuffex-src/spinner/src/TxSpinner.vue'
import TxStatCard from '@tuffex-src/stat-card/src/TxStatCard.vue'
import TxStatusBadge from '@tuffex-src/status-badge/src/TxStatusBadge.vue'
import TxStatusHint from '@tuffex-src/status-hint/src/TxStatusHint.vue'
import TxSwitch from '@tuffex-src/switch/src/TxSwitch.vue'
import '@tuffex-src/switch/style/index.scss'
import TxTag from '@tuffex-src/tag/src/TxTag.vue'
import { createTxCustomElement } from '../runtime/factory'

// 1. tx-button (button)
export const buttonBundle = createTxCustomElement({
  tag: 'tx-button',
  component: TxButton,
  props: {
    variant: 'string',
    size: 'string',
    block: 'boolean',
    type: 'string',
    plain: 'boolean',
    dashed: 'boolean',
    round: 'boolean',
    circle: 'boolean',
    loading: 'boolean',
    loadingVariant: 'string',
    progress: 'number',
    showProgress: 'boolean',
    formatProgress: 'any',
    status: 'string',
    disabled: 'boolean',
    border: 'boolean',
    icon: 'string',
    autofocus: 'boolean',
    nativeType: 'string',
    vibrate: 'boolean',
    vibrateType: 'string',
  },
  emits: ['click'],
  slots: ['default'],
})

// 2. tx-badge (badge)
export const badgeBundle = createTxCustomElement({
  tag: 'tx-badge',
  component: TxBadge,
  props: {
    variant: 'string',
    value: 'string-or-number',
    color: 'string',
    dot: 'boolean',
    open: 'boolean',
  },
  slots: ['default'],
})

// 3. tx-tag (tag)
export const tagBundle = createTxCustomElement({
  tag: 'tx-tag',
  component: TxTag,
  props: {
    label: 'string',
    icon: 'string',
    color: 'string',
    background: 'string',
    border: 'string',
    size: 'string',
    pill: 'boolean',
    variant: 'string',
    dot: 'string',
    dotSize: 'number',
    count: 'number',
    closable: 'boolean',
    closeAriaLabel: 'string',
    disabled: 'boolean',
  },
  emits: ['close', 'click'],
  slots: ['default'],
})

// 4. tx-avatar (avatar)
export const avatarBundle = createTxCustomElement({
  tag: 'tx-avatar',
  component: TxAvatar,
  props: {
    src: 'string',
    alt: 'string',
    name: 'string',
    icon: 'string',
    size: 'string-or-number',
    status: 'string',
    shape: 'string',
    clickable: 'boolean',
    backgroundColor: 'string',
    textColor: 'string',
  },
  emits: ['click'],
  suppressNativeEvents: ['click'],
  slots: ['default'],
})

// 5. tx-spinner (spinner)
export const spinnerBundle = createTxCustomElement({
  tag: 'tx-spinner',
  component: TxSpinner,
  props: {
    size: 'number',
    strokeWidth: 'number',
    fallback: 'boolean',
    visible: 'boolean',
    label: 'string',
  },
})

// 6. tx-divider (divider)
export const dividerBundle = createTxCustomElement({
  tag: 'tx-divider',
  component: TxDivider,
  props: {
    direction: 'string',
    dashed: 'boolean',
    textPlacement: 'string',
    gradient: 'boolean-or-string',
  },
  slots: ['default'],
})

// 7. tx-alert (alert)
export const alertBundle = createTxCustomElement({
  tag: 'tx-alert',
  component: TxAlert,
  props: {
    type: 'string',
    title: 'string',
    message: 'string',
    closable: 'boolean',
    showIcon: 'boolean',
    closeLabel: 'string',
  },
  emits: ['close'],
  slots: ['title', 'default'],
})

// 8. tx-card (card)
export const cardBundle = createTxCustomElement({
  tag: 'tx-card',
  component: TxCard,
  props: {
    variant: 'string',
    background: 'string',
    shadow: 'string',
    size: 'string',
    radius: 'number',
    padding: 'number',
    glassBlur: 'boolean',
    glassBlurAmount: 'number',
    glassOverlay: 'boolean',
    glassOverlayOpacity: 'number',
    maskOpacity: 'number',
    fallbackMaskOpacity: 'number',
    surfaceMoving: 'boolean',
    refractionStrength: 'number',
    refractionProfile: 'string',
    refractionTone: 'string',
    refractionAngle: 'number',
    refractionRenderer: 'string',
    refractionGlassOpacity: 'number',
    refractionLightFollowMouse: 'boolean',
    refractionLightFollowIntensity: 'number',
    refractionLightSpring: 'boolean',
    refractionLightSpringStiffness: 'number',
    refractionLightSpringDamping: 'number',
    flowLight: 'boolean-or-string',
    flowLightIntensity: 'number',
    clickable: 'boolean',
    specular: 'boolean',
    loading: 'boolean',
    loadingSpinnerSize: 'number',
    disabled: 'boolean',
    inertial: 'boolean',
    inertialMaxOffset: 'number',
    inertialRebound: 'number',
  },
  emits: ['click'],
  slots: ['cover', 'header', 'default', 'footer'],
})

// 9. tx-kbd (kbd)
export const kbdBundle = createTxCustomElement({
  tag: 'tx-kbd',
  component: TxKbd,
  props: {
    size: 'string',
    tone: 'string',
  },
  slots: ['default'],
})

// 10. tx-progress (progress)
export const progressBundle = createTxCustomElement({
  tag: 'tx-progress',
  component: TxProgress,
  props: {
    percentage: 'number',
    status: 'string',
    strokeWidth: 'number',
    showText: 'boolean',
    indeterminate: 'boolean',
    format: 'any',
  },
})

// 11. tx-progress-bar (progress-bar)
export const progressBarBundle = createTxCustomElement({
  tag: 'tx-progress-bar',
  component: TxProgressBar,
  props: {
    loading: 'boolean',
    indeterminate: 'boolean',
    indeterminateVariant: 'string',
    error: 'boolean',
    success: 'boolean',
    status: 'string',
    message: 'string',
    detail: 'string',
    ariaLabel: 'string',
    percentage: 'number',
    segments: 'json',
    segmentsTotal: 'number',
    height: 'string',
    showText: 'boolean',
    textPlacement: 'string',
    format: 'any',
    flowEffect: 'string',
    indicatorEffect: 'string',
    hoverEffect: 'string',
    color: 'string',
    maskVariant: 'string',
    maskBackground: 'string',
    tooltip: 'boolean',
    tooltipContent: 'string',
    tooltipProps: 'json',
  },
  emits: ['complete'],
})

// 12. tx-skeleton (skeleton)
export const skeletonBundle = createTxCustomElement({
  tag: 'tx-skeleton',
  component: TxSkeleton,
  props: {
    loading: 'boolean',
    variant: 'string',
    width: 'string-or-number',
    height: 'string-or-number',
    radius: 'string-or-number',
    lines: 'number',
    gap: 'string-or-number',
  },
  slots: ['default'],
})

// 13. tx-switch (switch)
export const switchBundle = createTxCustomElement({
  tag: 'tx-switch',
  component: TxSwitch,
  props: {
    modelValue: 'boolean',
    checked: 'boolean',
    disabled: 'boolean',
    loading: 'boolean',
    size: 'string',
    label: 'string',
    labelPlacement: 'string',
    ariaLabel: 'string',
    ariaLabelledby: 'string',
  },
  model: {
    prop: 'modelValue',
    aliasProp: 'checked',
    event: 'update:modelValue',
  },
  emits: ['update:modelValue', 'change'],
  slots: ['default'],
})

// 14. tx-status-badge (status-badge)
export const statusBadgeBundle = createTxCustomElement({
  tag: 'tx-status-badge',
  component: TxStatusBadge,
  props: {
    text: 'string',
    icon: 'string',
    status: 'string',
    statusKey: 'string',
    size: 'string',
    os: 'string',
    osOnly: 'boolean',
  },
  transformProps: (coerced) => ({
    text: '',
    ...coerced,
  }),
  emits: ['click'],
})

// 15. tx-status-hint (status-hint)
export const statusHintBundle = createTxCustomElement({
  tag: 'tx-status-hint',
  component: TxStatusHint,
  props: {
    text: 'string-or-number',
    tone: 'string',
    size: 'string',
    pulseKey: 'string-or-number',
    animated: 'boolean',
    live: 'boolean',
  },
  transformProps: (coerced) => ({
    text: '',
    ...coerced,
  }),
  slots: ['icon'],
})

// 16. tx-dot-indicator (dot-indicator)
export const dotIndicatorBundle = createTxCustomElement({
  tag: 'tx-dot-indicator',
  component: TxDotIndicator,
  props: {
    color: 'string',
    label: 'string',
    size: 'number',
    ariaLabel: 'string',
  },
  slots: ['default'],
})

// 17. tx-empty (empty)
export const emptyBundle = createTxCustomElement({
  tag: 'tx-empty',
  component: TxEmpty,
  props: {
    title: 'string',
    description: 'string',
    iconClass: 'string',
    compact: 'boolean',
  },
  slots: ['icon', 'title', 'description', 'action'],
})

// 18. tx-stat-card (stat-card)
export const statCardBundle = createTxCustomElement({
  tag: 'tx-stat-card',
  component: TxStatCard,
  props: {
    value: 'string-or-number',
    label: 'string',
    iconClass: 'string',
    clickable: 'boolean',
    insight: 'json',
    variant: 'string',
    progress: 'number',
    meta: 'string',
    ariaLabel: 'string',
  },
  transformProps: (coerced) => ({
    value: 0,
    label: '',
    ...coerced,
  }),
  slots: ['label', 'value', 'meta'],
})

export const TxButtonElement = buttonBundle.ElementClass
export const defineTxButton = buttonBundle.define

export const TxBadgeElement = badgeBundle.ElementClass
export const defineTxBadge = badgeBundle.define

export const TxTagElement = tagBundle.ElementClass
export const defineTxTag = tagBundle.define

export const TxAvatarElement = avatarBundle.ElementClass
export const defineTxAvatar = avatarBundle.define

export const TxSpinnerElement = spinnerBundle.ElementClass
export const defineTxSpinner = spinnerBundle.define

export const TxDividerElement = dividerBundle.ElementClass
export const defineTxDivider = dividerBundle.define

export const TxAlertElement = alertBundle.ElementClass
export const defineTxAlert = alertBundle.define

export const TxCardElement = cardBundle.ElementClass
export const defineTxCard = cardBundle.define

export const TxKbdElement = kbdBundle.ElementClass
export const defineTxKbd = kbdBundle.define

export const TxProgressElement = progressBundle.ElementClass
export const defineTxProgress = progressBundle.define

export const TxProgressBarElement = progressBarBundle.ElementClass
export const defineTxProgressBar = progressBarBundle.define

export const TxSkeletonElement = skeletonBundle.ElementClass
export const defineTxSkeleton = skeletonBundle.define

export const TxSwitchElement = switchBundle.ElementClass
export const defineTxSwitch = switchBundle.define

export const TxStatusBadgeElement = statusBadgeBundle.ElementClass
export const defineTxStatusBadge = statusBadgeBundle.define

export const TxStatusHintElement = statusHintBundle.ElementClass
export const defineTxStatusHint = statusHintBundle.define

export const TxDotIndicatorElement = dotIndicatorBundle.ElementClass
export const defineTxDotIndicator = dotIndicatorBundle.define

export const TxEmptyElement = emptyBundle.ElementClass
export const defineTxEmpty = emptyBundle.define

export const TxStatCardElement = statCardBundle.ElementClass
export const defineTxStatCard = statCardBundle.define

export const TIER_A_BUNDLES = [
  buttonBundle,
  badgeBundle,
  tagBundle,
  avatarBundle,
  spinnerBundle,
  dividerBundle,
  alertBundle,
  cardBundle,
  kbdBundle,
  progressBundle,
  progressBarBundle,
  skeletonBundle,
  switchBundle,
  statusBadgeBundle,
  statusHintBundle,
  dotIndicatorBundle,
  emptyBundle,
  statCardBundle,
] as const
