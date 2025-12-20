import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './style/index.scss'

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
  TxProgressBar,
  TxButton,
  TuffSwitch,
  TuffInput,
  TuffCheckbox,
  TuffSelect,
  TuffProgress,
  TuffFlatButton,
} from '@tuffex-ui/packages/components/src'

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
    app.component('TxProgressBar', TxProgressBar)
    app.component('TxButton', TxButton)
    app.component('TxSwitch', TuffSwitch)
    app.component('TxInput', TuffInput)
    app.component('TxCheckbox', TuffCheckbox)
    app.component('TxSelect', TuffSelect)
    app.component('TxProgress', TuffProgress)
    app.component('TxFlatButton', TuffFlatButton)

    // 注册 Demo 容器
    app.component('DemoBlock', DemoBlock)
  },
} satisfies Theme
