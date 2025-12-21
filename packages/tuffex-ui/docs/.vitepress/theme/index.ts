import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style/index.scss'
import '../../../packages/components/style/index.scss'

// 导入 TuffEx UI 组件
import {
  TxTag,
  TxStatusBadge,
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
  TxIcon,
  TuffSwitch,
  TuffInput,
  TuffCheckbox,
  TuffSelect,
  TuffSelectItem,
  TuffProgress,
  TuffFlatButton,
  TxScroll,
  TouchScroll,
  TxSlider,
  TxSpinner,
  TxLoadingOverlay,
  TxSkeleton,
  TxCardSkeleton,
  TxListItemSkeleton,
  TxToastHost,
  TxGlassSurface,
  TxGradientBorder,
  TxGridLayout,
  TxLayoutSkeleton,
  TxStatCard,
  TxCardItem,
  TxTabs,
  TxTabItem,
  TxTabHeader,
  TxTooltip,
  TxPopover,
  TxDropdownMenu,
  TxDropdownItem,
  TxContextMenu,
  TxEmpty,
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
} from '../../../packages/components/src'

// 导入 Demo 容器组件
import DemoBlock from './components/DemoBlock.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    if (typeof window !== 'undefined') {
      document.documentElement.classList.add('touch-blur')
    }
    // 注册 TuffEx UI 组件
    app.component('TxTag', TxTag)
    app.component('TxStatusBadge', TxStatusBadge)
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
    app.component('TxProgress', TuffProgress)
    app.component('TxFlatButton', TuffFlatButton)
    app.component('TxScroll', TxScroll)
    app.component('TouchScroll', TouchScroll)

    app.component('TxSlider', TxSlider)
    app.component('TxSpinner', TxSpinner)
    app.component('TxLoadingOverlay', TxLoadingOverlay)
    app.component('TxSkeleton', TxSkeleton)
    app.component('TxCardSkeleton', TxCardSkeleton)
    app.component('TxListItemSkeleton', TxListItemSkeleton)
    app.component('TxToastHost', TxToastHost)
    app.component('TxGlassSurface', TxGlassSurface)
    app.component('TxGradientBorder', TxGradientBorder)
    app.component('TxGridLayout', TxGridLayout)
    app.component('TxLayoutSkeleton', TxLayoutSkeleton)
    app.component('TxStatCard', TxStatCard)
    app.component('TxCardItem', TxCardItem)

    app.component('TxTabs', TxTabs)
    app.component('TxTabItem', TxTabItem)
    app.component('TxTabHeader', TxTabHeader)

    app.component('TxTooltip', TxTooltip)
    app.component('TxPopover', TxPopover)
    app.component('TxDropdownMenu', TxDropdownMenu)
    app.component('TxDropdownItem', TxDropdownItem)
    app.component('TxContextMenu', TxContextMenu)
    app.component('TxEmpty', TxEmpty)
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

    // 注册 Demo 容器
    app.component('DemoBlock', DemoBlock)
  },
} satisfies Theme
