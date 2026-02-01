import TuffUI, {
  TuffSwitch,
  TxButton,
  TxProgressBar,
  TxStatusBadge,
  TxTag,
} from '@talex-touch/tuffex'

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.vueApp.use(TuffUI)

  const aliasComponents: Record<string, any> = {
    Txbutton: TxButton,
    Tuffswitch: TuffSwitch,
    Txstatusbadge: TxStatusBadge,
    Txtag: TxTag,
    Txprogressbar: TxProgressBar,
  }

  for (const [name, component] of Object.entries(aliasComponents)) {
    nuxtApp.vueApp.component(name, component)
  }
})
