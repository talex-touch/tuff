<template>
  <div style="position: relative; height: 220px; border-radius: 12px; border: 1px solid var(--tx-border-color); overflow: hidden;">
    <div style="padding: 1rem; color: var(--tx-text-color-secondary);">
      This box only exists to show a fixed blur overlay.
    </div>

    <TxGradualBlur
      target="page"
      preset="page-footer"
      :div-count="8"
      :exponential="true"
      :opacity="1"
      :strength="2.5"
      :z-index="9999"
      :style="{ left: 0, right: 0 }"
    />
  </div>
</template>
