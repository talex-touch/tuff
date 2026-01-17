<template>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; width: 620px;">
    <section style="position: relative; height: 220px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(180deg, rgba(125,211,252,.24), rgba(255,255,255,0));">
      <div style="height: 100%; overflow-y: auto; padding: 1.4rem 1.2rem; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
          <span>Top fade</span>
          <span style="font-size: 20px;">↑</span>
        </div>
        <p style="color: var(--tx-text-color-secondary); line-height: 1.6; margin: 0;">
          Headline content stays sharp，向上滚动时才看到模糊层。
        </p>
        <div style="height: 160px;" />
        <p style="color: var(--tx-text-color-secondary); margin: 0;">
          End.
        </p>
      </div>
      <TxGradualBlur position="top" height="4.5rem" :strength="2.2" :div-count="6" curve="ease-out" />
    </section>

    <section style="position: relative; height: 220px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(180deg, rgba(168,85,247,.08), rgba(255,255,255,0));">
      <div style="height: 100%; overflow-y: auto; padding: 1.4rem 1.2rem; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
          <span>Bottom fade</span>
          <span style="font-size: 20px;">↓</span>
        </div>
        <p style="color: var(--tx-text-color-secondary); line-height: 1.6; margin: 0;">
          适合卡片底部补强，底部 CTA 始终可读。
        </p>
        <div style="height: 200px;" />
        <p style="color: var(--tx-text-color-secondary); margin: 0;">
          End.
        </p>
      </div>
      <TxGradualBlur position="bottom" height="5rem" :strength="2.2" :div-count="6" curve="ease-out" />
    </section>

    <section style="position: relative; height: 200px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(90deg, rgba(14,165,233,.06), rgba(255,255,255,0));">
      <div style="height: 100%; overflow-y: auto; padding: 1.2rem; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
          <span>Left pane</span>
          <span style="font-size: 20px;">←</span>
        </div>
        <p style="color: var(--tx-text-color-secondary); line-height: 1.5; margin: 0;">
          侧边栏文字 + 图标列表，模糊处理外侧图片。
        </p>
        <div style="flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px;">
          <div style="height: 48px; border-radius: 8px; background: rgba(125,211,252,.35);" />
          <div style="height: 48px; border-radius: 8px; background: rgba(59,130,246,.25);" />
          <div style="height: 48px; border-radius: 8px; background: rgba(37,99,235,.25);" />
        </div>
      </div>
      <TxGradualBlur position="left" width="5rem" :strength="2.5" :div-count="7" curve="bezier" />
    </section>

    <section style="position: relative; height: 200px; overflow: hidden; border-radius: 16px; border: 1px solid var(--tx-border-color); background: linear-gradient(90deg, rgba(236,72,153,.08), rgba(255,255,255,0));">
      <div style="height: 100%; overflow-y: auto; padding: 1.2rem; display: flex; flex-direction: column; gap: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: center; font-weight: 600;">
          <span>Right pane</span>
          <span style="font-size: 20px;">→</span>
        </div>
        <p style="color: var(--tx-text-color-secondary); line-height: 1.5; margin: 0;">
          可保护右侧媒体或聊天面板，避免抢占焦点。
        </p>
        <div style="flex: 1; display: flex; gap: 6px;">
          <div style="flex: 1; border-radius: 10px; background: rgba(248,113,113,.15);" />
          <div style="flex: 1; border-radius: 10px; background: rgba(251,146,60,.15);" />
        </div>
      </div>
      <TxGradualBlur position="right" width="5rem" :strength="2.5" :div-count="7" curve="bezier" />
    </section>
  </div>
</template>
