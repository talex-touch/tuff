<template>
  <section style="position: relative; height: 220px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1.25rem 1rem;">
      <div style="font-weight: 600; margin-bottom: 8px;">
        Resize window to see height changes
      </div>
      <div style="color: var(--tx-text-color-secondary); line-height: 1.7;">
        desktop/tablet/mobile heights can be configured.
        <div style="height: 220px;" />
        End.
      </div>
    </div>

    <TxGradualBlur
      position="bottom"
      :strength="2"
      responsive
      height="6rem"
      mobile-height="4rem"
      tablet-height="5rem"
      desktop-height="7rem"
    />
  </section>
</template>
