import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import Layout from './Layout.vue'
// 导入 TuffEx 组件
import {
  TouchScroll,
  TuffCheckbox,
  TuffFlatButton,
  TuffInput,
  TuffProgress,
  TuffSelect,
  TuffSelectItem,
  TuffSwitch,
  TxAgentItem,
  TxAgentsList,
  TxAlert,
  TxAutoSizer,
  TxAvatar,
  TxAvatarGroup,
  TxBadge,
  TxBlankSlate,
  TxBlockLine,
  TxBlockSlot,
  TxBlockSwitch,
  TxBlowDialog,
  TxBottomDialog,
  TxBreadcrumb,
  TxButton,
  TxCard,
  TxCardItem,
  TxCardSkeleton,
  TxCascader,
  TxChatComposer,
  TxChatList,
  TxChatMessage,
  TxCodeEditor,
  TxCodeEditorToolbar,
  TxCol,
  TxCollapse,
  TxCollapseItem,
  TxCommandPalette,
  TxContainer,
  TxContextMenu,
  TxContextMenuItem,
  TxCornerOverlay,
  TxDataTable,
  TxDatePicker,
  TxDrawer,
  TxDropdownItem,
  TxDropdownMenu,
  TxEmpty,
  TxEmptyState,
  TxFileUploader,
  TxFlex,
  TxFlipOverlay,
  TxForm,
  TxFormItem,
  TxFusion,
  TxGlassSurface,
  TxGlowText,
  TxGradientBorder,
  TxGradualBlur,
  TxGrid,
  TxGridItem,
  TxGridLayout,
  TxGroupBlock,
  TxIcon,
  TxImageGallery,
  TxImageUploader,
  TxLayoutSkeleton,
  TxListItemSkeleton,
  TxLoadingOverlay,
  TxLoadingState,
  TxMarkdownView,
  TxModal,
  TxNavBar,
  TxNoData,
  TxNoSelection,
  TxOfflineState,
  TxOutlineBorder,
  TxPagination,
  TxPermissionState,
  TxPicker,
  TxPopover,
  TxPopperDialog,
  TxProgressBar,
  TxRadio,
  TxRadioGroup,
  TxRating,
  TxRow,
  TxScroll,
  TxSearchEmpty,
  TxSearchInput,
  TxSearchSelect,
  TxSegmentedSlider,
  TxSkeleton,
  TxSlider,
  TxSortableList,
  TxSpinner,
  TxSplitter,
  TxStack,
  TxStagger,
  TxStatCard,
  TxStatusBadge,
  TxStep,
  TxSteps,
  TxTabBar,
  TxTabHeader,
  TxTabItem,
  TxTabs,
  TxTag,
  TxTagInput,
  TxTextTransformer,
  TxTimeline,
  TxTimelineItem,
  TxToastHost,
  TxTooltip,
  TxTouchTip,
  TxTransition,
  TxTransitionFade,
  TxTransitionRebound,
  TxTransitionSlideFade,
  TxTransitionSmoothSize,
  TxTree,
  TxTreeSelect,
  TxTypingIndicator,
  TxVirtualList,
} from '../../../packages/components/src'
// 导入 Demo 容器组件
import DemoBlock from './components/DemoBlock.vue'
import ComponentCanvas from './components/ComponentCanvas.vue'
import ApiSpecTable from './components/ApiSpecTable.vue'
import DocSourceLink from './components/DocSourceLink.vue'
import CardActionsDemo from './components/demos/CardActionsDemo.vue'

import CardBackgroundScrollDemo from './components/demos/CardBackgroundScrollDemo.vue'

import CardBasicDemo from './components/demos/CardBasicDemo.vue'
import CardBasicSlotsDemo from './components/demos/CardBasicSlotsDemo.vue'
import CardCompositionsDemo from './components/demos/CardCompositionsDemo.vue'
import CardEmptyDemo from './components/demos/CardEmptyDemo.vue'
import CardHeaderDemo from './components/demos/CardHeaderDemo.vue'
import CardInertialDemo from './components/demos/CardInertialDemo.vue'
import CardLayoutPropsDemo from './components/demos/CardLayoutPropsDemo.vue'
import CardModeDemo from './components/demos/CardModeDemo.vue'
import CardSizeDemo from './components/demos/CardSizeDemo.vue'
import CardStatesDemo from './components/demos/CardStatesDemo.vue'
import CardVariantsDemo from './components/demos/CardVariantsDemo.vue'
import GradualBlurAnimatedDemo from './components/demos/GradualBlurAnimatedDemo.vue'
import ScrollBasicDemo from './components/demos/ScrollBasicDemo.vue'
import ScrollBounceScrollbarDemo from './components/demos/ScrollBounceScrollbarDemo.vue'
import ScrollChainingDemo from './components/demos/ScrollChainingDemo.vue'
import ScrollHorizontalDemo from './components/demos/ScrollHorizontalDemo.vue'
import ScrollNativeDemo from './components/demos/ScrollNativeDemo.vue'
import ScrollPullDownUpDemo from './components/demos/ScrollPullDownUpDemo.vue'
import 'virtual:uno.css'
import './style/index.scss'
import '../../../packages/components/style/index.scss'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    if (typeof window !== 'undefined') {
      document.documentElement.classList.add('touch-blur')
    }
    // 注册 TuffEx 组件 —— 基础
    app.component('TxButton', TxButton)
    app.component('TxIcon', TxIcon)
    app.component('TuffIcon', TxIcon)
    app.component('TxTag', TxTag)
    app.component('TxStatusBadge', TxStatusBadge)
    app.component('TxAvatar', TxAvatar)
    app.component('TxAvatarGroup', TxAvatarGroup)
    app.component('TxOutlineBorder', TxOutlineBorder)
    app.component('TxCornerOverlay', TxCornerOverlay)
    app.component('TxBadge', TxBadge)
    app.component('TxAlert', TxAlert)
    app.component('TxBreadcrumb', TxBreadcrumb)

    // 表单
    app.component('TxSwitch', TuffSwitch)
    app.component('TuffSwitch', TuffSwitch)
    app.component('TxInput', TuffInput)
    app.component('TuffInput', TuffInput)
    app.component('TxCheckbox', TuffCheckbox)
    app.component('TuffCheckbox', TuffCheckbox)
    app.component('TxSelect', TuffSelect)
    app.component('TuffSelect', TuffSelect)
    app.component('TxSelectItem', TuffSelectItem)
    app.component('TuffSelectItem', TuffSelectItem)
    app.component('TxSearchInput', TxSearchInput)
    app.component('TxSearchSelect', TxSearchSelect)
    app.component('TxTreeSelect', TxTreeSelect)
    app.component('TxTree', TxTree)
    app.component('TxCascader', TxCascader)
    app.component('TxSlider', TxSlider)
    app.component('TxSegmentedSlider', TxSegmentedSlider)
    app.component('TxPicker', TxPicker)
    app.component('TxDatePicker', TxDatePicker)
    app.component('TxRadio', TxRadio)
    app.component('TxRadioGroup', TxRadioGroup)
    app.component('TxTagInput', TxTagInput)
    app.component('TxRating', TxRating)
    app.component('TxForm', TxForm)
    app.component('TxFormItem', TxFormItem)
    app.component('TxFlatButton', TuffFlatButton)

    // 数据展示
    app.component('TxCard', TxCard)
    app.component('TxCardItem', TxCardItem)
    app.component('TxDataTable', TxDataTable)
    app.component('TxStatCard', TxStatCard)
    app.component('TxEmpty', TxEmpty)
    app.component('TxEmptyState', TxEmptyState)
    app.component('TxBlankSlate', TxBlankSlate)
    app.component('TxLoadingState', TxLoadingState)
    app.component('TxNoSelection', TxNoSelection)
    app.component('TxNoData', TxNoData)
    app.component('TxSearchEmpty', TxSearchEmpty)
    app.component('TxOfflineState', TxOfflineState)
    app.component('TxPermissionState', TxPermissionState)
    app.component('TxMarkdownView', TxMarkdownView)
    app.component('TxProgress', TuffProgress)
    app.component('TxProgressBar', TxProgressBar)
    app.component('TxTimeline', TxTimeline)
    app.component('TxTimelineItem', TxTimelineItem)
    app.component('TxPagination', TxPagination)
    app.component('TxCollapse', TxCollapse)
    app.component('TxCollapseItem', TxCollapseItem)
    app.component('TxSteps', TxSteps)
    app.component('TxStep', TxStep)

    // 导航
    app.component('TxTabs', TxTabs)
    app.component('TxTabItem', TxTabItem)
    app.component('TxTabHeader', TxTabHeader)
    app.component('TxNavBar', TxNavBar)
    app.component('TxTabBar', TxTabBar)
    app.component('TxTooltip', TxTooltip)
    app.component('TxPopover', TxPopover)
    app.component('TxDropdownMenu', TxDropdownMenu)
    app.component('TxDropdownItem', TxDropdownItem)
    app.component('TxContextMenu', TxContextMenu)
    app.component('TxContextMenuItem', TxContextMenuItem)

    // 布局
    app.component('TxContainer', TxContainer)
    app.component('TxRow', TxRow)
    app.component('TxCol', TxCol)
    app.component('TxGrid', TxGrid)
    app.component('TxGridItem', TxGridItem)
    app.component('TxGridLayout', TxGridLayout)
    app.component('TxSplitter', TxSplitter)
    app.component('TxStack', TxStack)
    app.component('TxFlex', TxFlex)
    app.component('TxScroll', TxScroll)
    app.component('TouchScroll', TouchScroll)
    app.component('TxVirtualList', TxVirtualList)
    app.component('TxLayoutSkeleton', TxLayoutSkeleton)
    app.component('TxAgentsList', TxAgentsList)
    app.component('TxAgentItem', TxAgentItem)
    app.component('TxGroupBlock', TxGroupBlock)
    app.component('TxBlockLine', TxBlockLine)
    app.component('TxBlockSlot', TxBlockSlot)
    app.component('TxBlockSwitch', TxBlockSwitch)

    // 反馈
    app.component('TxSpinner', TxSpinner)
    app.component('TxLoadingOverlay', TxLoadingOverlay)
    app.component('TxSkeleton', TxSkeleton)
    app.component('TxCardSkeleton', TxCardSkeleton)
    app.component('TxListItemSkeleton', TxListItemSkeleton)
    app.component('TxToastHost', TxToastHost)

    // 覆盖层
    app.component('TxDrawer', TxDrawer)
    app.component('TxBottomDialog', TxBottomDialog)
    app.component('TxBlowDialog', TxBlowDialog)
    app.component('TxPopperDialog', TxPopperDialog)
    app.component('TxTouchTip', TxTouchTip)
    app.component('TxModal', TxModal)
    app.component('TxCommandPalette', TxCommandPalette)
    app.component('TxFlipOverlay', TxFlipOverlay)

    // 动效
    app.component('TxAutoSizer', TxAutoSizer)
    app.component('TxTextTransformer', TxTextTransformer)
    app.component('TxTransition', TxTransition)
    app.component('TxTransitionFade', TxTransitionFade)
    app.component('TxTransitionSlideFade', TxTransitionSlideFade)
    app.component('TxTransitionRebound', TxTransitionRebound)
    app.component('TxTransitionSmoothSize', TxTransitionSmoothSize)
    app.component('TxFusion', TxFusion)
    app.component('TxStagger', TxStagger)
    app.component('TxSortableList', TxSortableList)

    // AI
    app.component('TxChatList', TxChatList)
    app.component('TxChatMessage', TxChatMessage)
    app.component('TxChatComposer', TxChatComposer)
    app.component('TxTypingIndicator', TxTypingIndicator)
    app.component('TxCodeEditor', TxCodeEditor)
    app.component('TxCodeEditorToolbar', TxCodeEditorToolbar)
    app.component('TxImageUploader', TxImageUploader)
    app.component('TxImageGallery', TxImageGallery)
    app.component('TxFileUploader', TxFileUploader)

    // 视觉
    app.component('TxGlassSurface', TxGlassSurface)
    app.component('TxGradualBlur', TxGradualBlur)
    app.component('TxGradientBorder', TxGradientBorder)
    app.component('TxGlowText', TxGlowText)

    // 注册 Demo 容器
    app.component('DemoBlock', DemoBlock)
    app.component('ComponentCanvas', ComponentCanvas)
    app.component('ApiSpecTable', ApiSpecTable)
    app.component('DocSourceLink', DocSourceLink)
    app.component('GradualBlurAnimatedDemo', GradualBlurAnimatedDemo)
    app.component('ScrollBasicDemo', ScrollBasicDemo)
    app.component('ScrollHorizontalDemo', ScrollHorizontalDemo)
    app.component('ScrollBounceScrollbarDemo', ScrollBounceScrollbarDemo)
    app.component('ScrollChainingDemo', ScrollChainingDemo)
    app.component('ScrollNativeDemo', ScrollNativeDemo)
    app.component('ScrollPullDownUpDemo', ScrollPullDownUpDemo)
    app.component('CardVariantsDemo', CardVariantsDemo)
    app.component('CardBackgroundScrollDemo', CardBackgroundScrollDemo)
    app.component('CardEmptyDemo', CardEmptyDemo)
    app.component('CardCompositionsDemo', CardCompositionsDemo)
    app.component('CardBasicDemo', CardBasicDemo)
    app.component('CardHeaderDemo', CardHeaderDemo)
    app.component('CardActionsDemo', CardActionsDemo)
    app.component('CardBasicSlotsDemo', CardBasicSlotsDemo)
    app.component('CardModeDemo', CardModeDemo)
    app.component('CardSizeDemo', CardSizeDemo)
    app.component('CardLayoutPropsDemo', CardLayoutPropsDemo)
    app.component('CardStatesDemo', CardStatesDemo)
    app.component('CardInertialDemo', CardInertialDemo)
  },
} satisfies Theme
