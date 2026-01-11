import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import 'virtual:uno.css'
import './style/index.scss'
import '../../../packages/components/style/index.scss'

// 导入 TuffEx 组件
import {
  TxTag,
  TxStatusBadge,
  TxAvatar,
  TxAvatarGroup,
  TxDrawer,
  TxGroupBlock,
  TxBlockLine,
  TxBlockSlot,
  TxBlockSwitch,
  TxBottomDialog,
  TxBlowDialog,
  TxPopperDialog,
  TxTouchTip,
  TxProgressBar,
  TxButton,
  TxCard,
  TxIcon,
  TuffSwitch,
  TuffInput,
  TuffCheckbox,
  TuffSelect,
  TuffSelectItem,
  TxSearchInput,
  TxSearchSelect,
  TxTreeSelect,
  TxCascader,
  TuffProgress,
  TuffFlatButton,
  TxScroll,
  TouchScroll,
  TxSlider,
  TxSegmentedSlider,
  TxSpinner,
  TxLoadingOverlay,
  TxSkeleton,
  TxCardSkeleton,
  TxListItemSkeleton,
  TxToastHost,
  TxGlassSurface,
  TxGradualBlur,
  TxGradientBorder,
  TxGridLayout,
  TxLayoutSkeleton,
  TxStatCard,
  TxCardItem,
  TxAutoSizer,
  TxTextTransformer,
  TxTabs,
  TxTabItem,
  TxTabHeader,
  TxTooltip,
  TxPopover,
  TxDropdownMenu,
  TxDropdownItem,
  TxContextMenu,
  TxContextMenuItem,
  TxEmpty,
  TxRadio,
  TxRadioGroup,
  TxAgentsList,
  TxAgentItem,
  TxStagger,
  TxSortableList,
  TxMarkdownView,
  TxChatList,
  TxChatMessage,
  TxChatComposer,
  TxTypingIndicator,
  TxImageUploader,
  TxImageGallery,
  TxTransition,
  TxTransitionFade,
  TxTransitionSlideFade,
  TxTransitionRebound,
  TxTransitionSmoothSize,
  TxFusion,
  TxPicker,
  TxDatePicker,
  TxNavBar,
  TxTabBar,
  TxSplitter,
  TxStack,
  TxFlex,
  TxGrid,
  TxGridItem,
  TxContainer,
  TxRow,
  TxCol,
} from '../../../packages/components/src'

// 导入 Demo 容器组件
import DemoBlock from './components/DemoBlock.vue'
import IconPreview from './components/IconPreview.vue'
import GradualBlurAnimatedDemo from './components/demos/GradualBlurAnimatedDemo.vue'
import ScrollBasicDemo from './components/demos/ScrollBasicDemo.vue'
import ScrollHorizontalDemo from './components/demos/ScrollHorizontalDemo.vue'
import ScrollBounceScrollbarDemo from './components/demos/ScrollBounceScrollbarDemo.vue'
import ScrollChainingDemo from './components/demos/ScrollChainingDemo.vue'
import ScrollNativeDemo from './components/demos/ScrollNativeDemo.vue'
import ScrollPullDownUpDemo from './components/demos/ScrollPullDownUpDemo.vue'
import CardVariantsDemo from './components/demos/CardVariantsDemo.vue'
import CardBackgroundScrollDemo from './components/demos/CardBackgroundScrollDemo.vue'
import CardEmptyDemo from './components/demos/CardEmptyDemo.vue'
import CardCompositionsDemo from './components/demos/CardCompositionsDemo.vue'
import CardBasicDemo from './components/demos/CardBasicDemo.vue'
import CardHeaderDemo from './components/demos/CardHeaderDemo.vue'
import CardActionsDemo from './components/demos/CardActionsDemo.vue'
import CardBasicSlotsDemo from './components/demos/CardBasicSlotsDemo.vue'
import CardModeDemo from './components/demos/CardModeDemo.vue'
import CardSizeDemo from './components/demos/CardSizeDemo.vue'
import CardLayoutPropsDemo from './components/demos/CardLayoutPropsDemo.vue'
import CardStatesDemo from './components/demos/CardStatesDemo.vue'
import CardInertialDemo from './components/demos/CardInertialDemo.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    if (typeof window !== 'undefined') {
      document.documentElement.classList.add('touch-blur')
    }
    // 注册 TuffEx 组件
    app.component('TxTag', TxTag)
    app.component('TxStatusBadge', TxStatusBadge)
    app.component('TxAvatar', TxAvatar)
    app.component('TxAvatarGroup', TxAvatarGroup)
    app.component('TxDrawer', TxDrawer)
    app.component('TxGroupBlock', TxGroupBlock)
    app.component('TxBlockLine', TxBlockLine)
    app.component('TxBlockSlot', TxBlockSlot)
    app.component('TxBlockSwitch', TxBlockSwitch)
    app.component('TxBottomDialog', TxBottomDialog)
    app.component('TxBlowDialog', TxBlowDialog)
    app.component('TxPopperDialog', TxPopperDialog)
    app.component('TxTouchTip', TxTouchTip)
    app.component('TxProgressBar', TxProgressBar)
    app.component('TxButton', TxButton)
    app.component('TxCard', TxCard)
    app.component('TxIcon', TxIcon)
    app.component('TuffIcon', TxIcon)
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
    app.component('TxCascader', TxCascader)
    app.component('TxProgress', TuffProgress)
    app.component('TxFlatButton', TuffFlatButton)
    app.component('TxScroll', TxScroll)
    app.component('TouchScroll', TouchScroll)

    app.component('TxSlider', TxSlider)
    app.component('TxSegmentedSlider', TxSegmentedSlider)
    app.component('TxSpinner', TxSpinner)
    app.component('TxLoadingOverlay', TxLoadingOverlay)
    app.component('TxSkeleton', TxSkeleton)
    app.component('TxCardSkeleton', TxCardSkeleton)
    app.component('TxListItemSkeleton', TxListItemSkeleton)
    app.component('TxToastHost', TxToastHost)
    app.component('TxGlassSurface', TxGlassSurface)
    app.component('TxGradualBlur', TxGradualBlur)
    app.component('TxGradientBorder', TxGradientBorder)
    app.component('TxGridLayout', TxGridLayout)
    app.component('TxLayoutSkeleton', TxLayoutSkeleton)
    app.component('TxStatCard', TxStatCard)
    app.component('TxCardItem', TxCardItem)
    app.component('TxAutoSizer', TxAutoSizer)
    app.component('TxTextTransformer', TxTextTransformer)

    app.component('TxTabs', TxTabs)
    app.component('TxTabItem', TxTabItem)
    app.component('TxTabHeader', TxTabHeader)

    app.component('TxTooltip', TxTooltip)
    app.component('TxPopover', TxPopover)
    app.component('TxDropdownMenu', TxDropdownMenu)
    app.component('TxDropdownItem', TxDropdownItem)
    app.component('TxContextMenu', TxContextMenu)
    app.component('TxContextMenuItem', TxContextMenuItem)
    app.component('TxEmpty', TxEmpty)
    app.component('TxRadio', TxRadio)
    app.component('TxRadioGroup', TxRadioGroup)
    app.component('TxAgentsList', TxAgentsList)
    app.component('TxAgentItem', TxAgentItem)
    app.component('TxStagger', TxStagger)
    app.component('TxSortableList', TxSortableList)
    app.component('TxMarkdownView', TxMarkdownView)
    app.component('TxChatList', TxChatList)
    app.component('TxChatMessage', TxChatMessage)
    app.component('TxChatComposer', TxChatComposer)
    app.component('TxTypingIndicator', TxTypingIndicator)
    app.component('TxImageUploader', TxImageUploader)
    app.component('TxImageGallery', TxImageGallery)

    app.component('TxTransition', TxTransition)
    app.component('TxTransitionFade', TxTransitionFade)
    app.component('TxTransitionSlideFade', TxTransitionSlideFade)
    app.component('TxTransitionRebound', TxTransitionRebound)
    app.component('TxTransitionSmoothSize', TxTransitionSmoothSize)

    app.component('TxFusion', TxFusion)

    app.component('TxPicker', TxPicker)
    app.component('TxDatePicker', TxDatePicker)

    app.component('TxNavBar', TxNavBar)
    app.component('TxTabBar', TxTabBar)

    app.component('TxSplitter', TxSplitter)
    app.component('TxStack', TxStack)
    app.component('TxFlex', TxFlex)
    app.component('TxGrid', TxGrid)
    app.component('TxGridItem', TxGridItem)
    app.component('TxContainer', TxContainer)
    app.component('TxRow', TxRow)
    app.component('TxCol', TxCol)

    // 注册 Demo 容器
    app.component('DemoBlock', DemoBlock)
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
