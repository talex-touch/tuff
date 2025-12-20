<script setup lang="ts">
/**
 * DemoBlock 组件
 * 
 * 用于在文档中展示组件的实时预览效果
 */
import { ref } from 'vue'

defineProps<{
  title?: string
}>()

const showCode = ref(false)

function toggleCode() {
  showCode.value = !showCode.value
}
</script>

<template>
  <div class="demo-block">
    <div v-if="title" class="demo-block__title">{{ title }}</div>
    <div class="demo-block__preview">
      <slot name="preview" />
    </div>
    <div class="demo-block__actions">
      <button class="demo-block__toggle" @click="toggleCode">
        <span v-if="showCode">隐藏代码</span>
        <span v-else>查看代码</span>
      </button>
    </div>
    <div v-show="showCode" class="demo-block__code">
      <slot name="code" />
    </div>
  </div>
</template>

<style lang="scss">
.demo-block {
  margin: 16px 0;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg);

  &__title {
    padding: 12px 16px;
    font-weight: 600;
    font-size: 14px;
    color: var(--vp-c-text-1);
    border-bottom: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
  }

  &__preview {
    padding: 24px;
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }

  &__actions {
    padding: 8px 16px;
    border-top: 1px solid var(--vp-c-divider);
    background: var(--vp-c-bg-soft);
  }

  &__toggle {
    padding: 4px 12px;
    font-size: 12px;
    color: var(--vp-c-brand-1);
    background: transparent;
    border: 1px solid var(--vp-c-brand-1);
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      background: var(--vp-c-brand-soft);
    }
  }

  &__code {
    border-top: 1px solid var(--vp-c-divider);

    pre {
      margin: 0 !important;
      border-radius: 0 !important;
    }
  }
}
</style>
