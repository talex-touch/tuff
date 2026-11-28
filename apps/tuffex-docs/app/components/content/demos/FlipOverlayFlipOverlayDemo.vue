<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)
const triggerRef = ref<{ $el?: HTMLElement | null } | null>(null)
const triggerEl = computed(() => triggerRef.value?.$el || null)

const labels = computed(() => (locale.value === 'zh'
  ? {
      open: '打开 Overlay',
      title: '详情视图',
      desc: '头部支持标题、副标题和默认圆形关闭按钮。',
      body: '内容从触发源翻转展开，适合卡片详情或预览。',
      close: '关闭',
    }
  : {
      open: 'Open Overlay',
      title: 'Detail View',
      desc: 'Header supports title, description, and default round close button.',
      body: 'The content flips in from the trigger, ideal for previews or detail views.',
      close: 'Close',
    }))
</script>

<template>
  <div class="tuff-demo-row">
    <TxButton ref="triggerRef" @click="open = true">
      {{ labels.open }}
    </TxButton>
    <TxFlipOverlay
      v-model="open"
      :source="triggerEl"
      :header-title="labels.title"
      :header-desc="labels.desc"
    >
      <template #default="{ close }">
        <div class="space-y-3 p-6">
          <p class="text-sm text-black/60 dark:text-white/60">
            {{ labels.body }}
          </p>
          <TxButton size="sm" @click="close">
            {{ labels.close }}
          </TxButton>
        </div>
      </template>
    </TxFlipOverlay>
  </div>
</template>
