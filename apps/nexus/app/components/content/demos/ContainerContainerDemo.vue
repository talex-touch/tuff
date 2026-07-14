<script setup lang="ts">
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: '响应式容器',
      description: '同一组 Row / Col 会随断点切换列宽，Container 负责最大宽度和左右留白。',
    }
  }

  return {
    title: 'Responsive container',
    description: 'The same Row / Col layout changes spans by breakpoint while Container owns max width and side padding.',
  }
})

const cards = computed(() => {
  if (locale.value === 'zh') {
    return [
      { id: 'overview', title: '概览', meta: 'span 12 / md 8' },
      { id: 'metrics', title: '指标', meta: 'span 12 / md 8' },
      { id: 'actions', title: '操作', meta: 'span 24 / md 8' },
    ]
  }

  return [
    { id: 'overview', title: 'Overview', meta: 'span 12 / md 8' },
    { id: 'metrics', title: 'Metrics', meta: 'span 12 / md 8' },
    { id: 'actions', title: 'Actions', meta: 'span 24 / md 8' },
  ]
})
</script>

<template>
  <div class="container-demo">
    <TxContainer max-width="680px" :padding="18">
      <div class="container-demo__header">
        <strong>{{ labels.title }}</strong>
        <span>{{ labels.description }}</span>
      </div>
      <TxRow :gutter="{ xs: 10, sm: 14, md: 18 }" align="stretch">
        <TxCol
          v-for="card in cards"
          :key="card.id"
          :xs="24"
          :sm="card.id === 'actions' ? 24 : 12"
          :md="8"
        >
          <div class="container-demo__card">
            <strong>{{ card.title }}</strong>
            <span>{{ card.meta }}</span>
          </div>
        </TxCol>
      </TxRow>
    </TxContainer>
  </div>
</template>

<style scoped>
.container-demo {
  width: min(720px, 100%);
  border: 1px solid var(--tx-border-color, rgba(148, 163, 184, 0.32));
  border-radius: 14px;
  overflow: hidden;
  background: var(--tx-fill-color-blank, rgba(255, 255, 255, 0.78));
}

.container-demo__header {
  display: grid;
  gap: 4px;
  margin-bottom: 14px;
}

.container-demo__header strong {
  color: var(--tx-text-color-primary, #111827);
  font-size: 15px;
}

.container-demo__header span,
.container-demo__card span {
  color: var(--tx-text-color-secondary, #64748b);
  font-size: 12px;
  line-height: 1.5;
}

.container-demo__card {
  display: grid;
  gap: 6px;
  min-height: 70px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--tx-color-primary, #409eff) 16%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-color-primary, #409eff) 7%, var(--tx-fill-color-light, #f8fafc));
}
</style>

