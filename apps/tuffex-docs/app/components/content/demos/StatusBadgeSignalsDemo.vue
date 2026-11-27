<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      success: '已通过',
      warning: '待处理',
      error: '已取消',
      info: '审核中',
      muted: '未开始',
    }
  : {
      success: 'Approved',
      warning: 'Pending',
      error: 'Cancelled',
      info: 'In Review',
      muted: 'Not started',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxStatusBadge :text="labels.success" status="success" />
    <TxStatusBadge :text="labels.warning" status="warning" />
    <TxStatusBadge :text="labels.error" status="danger" />
    <TxStatusBadge :text="labels.info" status="info" />
    <!-- `muted` is the absence state: an empty dashed ring, no glyph. -->
    <TxStatusBadge :text="labels.muted" status="muted" />
  </div>
</template>
