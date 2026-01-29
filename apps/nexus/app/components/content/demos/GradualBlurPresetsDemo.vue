<template>
  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; width: 640px;">
    <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
      <div style="height: 100%; overflow-y: auto; padding: 1rem;">
        <div style="font-weight: 600;">
          subtle
        </div>
        <div style="height: 120px;" />
      </div>
      <TxGradualBlur preset="subtle" />
    </section>

    <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
      <div style="height: 100%; overflow-y: auto; padding: 1rem;">
        <div style="font-weight: 600;">
          intense
        </div>
        <div style="height: 120px;" />
      </div>
      <TxGradualBlur preset="intense" />
    </section>

    <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
      <div style="height: 100%; overflow-y: auto; padding: 1rem;">
        <div style="font-weight: 600;">
          smooth
        </div>
        <div style="height: 120px;" />
      </div>
      <TxGradualBlur preset="smooth" />
    </section>

    <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
      <div style="height: 100%; overflow-y: auto; padding: 1rem;">
        <div style="font-weight: 600;">
          sharp
        </div>
        <div style="height: 120px;" />
      </div>
      <TxGradualBlur preset="sharp" />
    </section>

    <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
      <div style="height: 100%; overflow-y: auto; padding: 1rem;">
        <div style="font-weight: 600;">
          header
        </div>
        <div style="height: 120px;" />
      </div>
      <TxGradualBlur preset="header" />
    </section>

    <section style="position: relative; height: 140px; overflow: hidden; border-radius: 12px; border: 1px solid var(--tx-border-color);">
      <div style="height: 100%; overflow-y: auto; padding: 1rem;">
        <div style="font-weight: 600;">
          footer
        </div>
        <div style="height: 120px;" />
      </div>
      <TxGradualBlur preset="footer" />
    </section>
  </div>
</template>
