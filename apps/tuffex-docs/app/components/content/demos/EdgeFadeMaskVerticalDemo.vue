<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'" style="width: 420px; max-width: 100%; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxEdgeFadeMask :size="32" style="height: 220px;">
      <div style="padding: 14px 16px; line-height: 1.7; color: var(--tx-text-color-secondary);">
        <div style="font-weight: 600; color: var(--tx-text-color); margin-bottom: 8px;">
          可滚动内容
        </div>
        当容器顶部/底部还有可滚动内容时，会自动显示渐隐遮罩。
        <div style="height: 12px;" />
        这可以缓解内容在边缘被硬裁切带来的突兀感，提升滚动区域的视觉连续性。
        <div style="height: 12px;" />
        组件外层仍然可以保留你自己的圆角、边框和背景。
        <div style="height: 180px;" />
        结束
      </div>
    </TxEdgeFadeMask>
  </div>
  <div v-else style="width: 420px; max-width: 100%; border: 1px solid var(--tx-border-color); border-radius: 12px;">
    <TxEdgeFadeMask :size="32" style="height: 220px;">
      <div style="padding: 14px 16px; line-height: 1.7; color: var(--tx-text-color-secondary);">
        <div style="font-weight: 600; color: var(--tx-text-color); margin-bottom: 8px;">
          Scrollable Content
        </div>
        The fade appears only when there is hidden content above or below the viewport.
        <div style="height: 12px;" />
        This keeps scrolling blocks visually soft instead of hard-clipped at boundaries.
        <div style="height: 12px;" />
        Keep your own border, radius, and background styles on the wrapper.
        <div style="height: 180px;" />
        End
      </div>
    </TxEdgeFadeMask>
  </div>
</template>
