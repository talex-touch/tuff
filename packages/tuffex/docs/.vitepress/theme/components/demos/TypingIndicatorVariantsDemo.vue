<template>
  <div style="display: flex; flex-direction: column; gap: 10px;">
    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--tx-border-color-light); border-radius: 12px;">
      <code style="width: 90px; color: var(--tx-text-color-secondary);">dots</code>
      <TxTypingIndicator text="Typing…" />
      <TxTypingIndicator :show-text="false" />
    </div>

    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--tx-border-color-light); border-radius: 12px;">
      <code style="width: 90px; color: var(--tx-text-color-secondary);">ai</code>
      <TxTypingIndicator variant="ai" text="Generating…" />
      <TxTypingIndicator variant="ai" :loader-size="32" text="32px" />
      <TxTypingIndicator variant="ai" :loader-size="24" :show-text="false" />
    </div>

    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--tx-border-color-light); border-radius: 12px;">
      <code style="width: 90px; color: var(--tx-text-color-secondary);">pure</code>
      <TxTypingIndicator variant="pure" text="Loading" />
      <TxTypingIndicator variant="pure" :pure-size="12" text="12px" />
      <div style="display: inline-flex; gap: 6px; align-items: center; color: var(--tx-text-color-secondary);">
        <span style="width: 16px; height: 16px; border-radius: 4px; background: var(--tx-fill-color); display: inline-block;" />
        <TxTypingIndicator variant="pure" :pure-size="12" :show-text="false" />
        <span style="font-size: 12px;">Icon</span>
      </div>
    </div>

    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--tx-border-color-light); border-radius: 12px;">
      <code style="width: 90px; color: var(--tx-text-color-secondary);">ring</code>
      <TxTypingIndicator variant="ring" :show-text="false" />
      <TxTypingIndicator variant="ring" :ring-size="14" :show-text="false" />
      <TxTypingIndicator variant="ring" :ring-size="22" :ring-thickness="3" :show-text="false" />
    </div>

    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--tx-border-color-light); border-radius: 12px;">
      <code style="width: 90px; color: var(--tx-text-color-secondary);">circle-dash</code>
      <TxTypingIndicator variant="circle-dash" :show-text="false" />
      <TxTypingIndicator variant="circle-dash" :circle-dash-size="14" :show-text="false" />
      <TxTypingIndicator variant="circle-dash" :circle-dash-size="22" :circle-dash-thickness="3" :circle-dash-dash-deg="10" :circle-dash-gap-deg="10" :show-text="false" />
    </div>

    <div style="display: flex; align-items: center; gap: 12px; padding: 8px 10px; border: 1px solid var(--tx-border-color-light); border-radius: 12px;">
      <code style="width: 90px; color: var(--tx-text-color-secondary);">bars</code>
      <TxTypingIndicator variant="bars" :show-text="false" />
      <TxTypingIndicator variant="bars" :bars-size="16" :show-text="false" />
    </div>
  </div>
</template>
