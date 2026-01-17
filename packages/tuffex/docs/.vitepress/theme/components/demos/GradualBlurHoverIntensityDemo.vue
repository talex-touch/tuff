<template>
  <section style="position: relative; height: 220px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
    <div style="height: 100%; overflow-y: auto; padding: 1.25rem 1rem;">
      <div style="font-weight: 600; margin-bottom: 8px;">
        Hover the blurred area
      </div>
      <div style="color: var(--tx-text-color-secondary); line-height: 1.7;">
        When hoverIntensity is provided, the blur overlay will accept pointer events.
        <div style="height: 220px;" />
        End.
      </div>
    </div>

    <TxGradualBlur
      position="bottom"
      height="6rem"
      :strength="2"
      :div-count="6"
      curve="bezier"
      :hover-intensity="1.8"
      :exponential="true"
    />
  </section>
</template>
