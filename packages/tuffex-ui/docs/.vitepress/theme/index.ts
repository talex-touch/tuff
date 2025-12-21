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
} from '../../../packages/components/src'

// 导入 Demo 容器组件
import DemoBlock from './components/DemoBlock.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
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

    // 注册 Demo 容器
    app.component('DemoBlock', DemoBlock)
  },
} satisfies Theme
