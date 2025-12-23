<template>
  <section style="position: relative; height: 320px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 2rem 1rem; background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0));">
      <div style="font-weight: 600; margin-bottom: 8px;">Scrollable Content</div>
      <div style="color: var(--tx-text-color-secondary); line-height: 1.7;">
        Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
        <div style="height: 16px;"></div>
        Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
        <div style="height: 16px;"></div>
        Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.
        <div style="height: 16px;"></div>
        Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
        <div style="height: 16px;"></div>
        More lines. More lines. More lines. More lines. More lines.
        <div style="height: 120px;"></div>
        Bottom.
      </div>
    </div>

    <TxGradualBlur
      target="parent"
      position="bottom"
      height="6rem"
      :strength="2"
      :div-count="5"
      curve="bezier"
      :exponential="true"
      :opacity="1"
    />
  </section>
</template>
