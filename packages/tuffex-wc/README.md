# @talex-touch/tuffex-wc

Pragmatic Web Components wrapper for TuffEx powered by Vue 3.5 `defineCustomElement` (`shadowRoot: false` by default for zero-FOUC Light DOM `--tx-*` design tokens and `.dark`/high-contrast theming, plus optional `shadowRoot: true` style-injection mode).

## Usage

```ts
import { registerTuffexElements } from '@talex-touch/tuffex-wc'
import '@talex-touch/tuffex-wc/style.css'

registerTuffexElements()
```

```html
<tx-button variant="primary">Launch</tx-button>
<tx-switch model-value label="Enable sync"></tx-switch>
<tx-tabs model-value="overview" placement="top">
  <tx-tab-item name="overview" label="Overview">Overview panel</tx-tab-item>
  <tx-tab-item name="api" label="API">API details</tx-tab-item>
</tx-tabs>
```

### Tree-shakeable single-element registration

```ts
import { defineTxButton, defineTxDialog } from '@talex-touch/tuffex-wc'
import '@talex-touch/tuffex-wc/style.css'

defineTxButton()
defineTxDialog()
```

### Optional Shadow DOM mode

```ts
import { defineTxButton, registerTuffexShadowStyles } from '@talex-touch/tuffex-wc'

registerTuffexShadowStyles(myTuffexCssText)
defineTxButton({ tagName: 'tx-shadow-button', shadowRoot: true })
```

### Lightweight metadata manifest (SSR-safe)

```ts
import { WC_ELEMENTS_MANIFEST } from '@talex-touch/tuffex-wc/manifest'

export const buttonTag = WC_ELEMENTS_MANIFEST.button.tag
```
