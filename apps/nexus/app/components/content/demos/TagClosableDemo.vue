<script setup lang="ts">
import { computed, ref, watchEffect } from 'vue'

const { locale } = useI18n()

const labels = computed(() => (locale.value === 'zh'
  ? {
      initial: ['设计', '文档', '待确认'],
      empty: '已全部移除',
      reset: '重置',
    }
  : {
      initial: ['Design', 'Docs', 'Pending'],
      empty: 'All tags removed',
      reset: 'Reset',
    }))

const tags = ref<string[]>([])

function resetTags() {
  tags.value = [...labels.value.initial]
}

function removeTag(tag: string) {
  tags.value = tags.value.filter(item => item !== tag)
}

watchEffect(resetTags)
</script>

<template>
  <div class="tag-closable-demo">
    <div class="tuff-demo-row">
      <TxTag
        v-for="tag in tags"
        :key="tag"
        :label="tag"
        closable
        @close="removeTag(tag)"
      />
      <span v-if="tags.length === 0" class="tag-closable-demo__empty">
        {{ labels.empty }}
      </span>
    </div>
    <TxButton size="sm" variant="ghost" @click="resetTags">
      {{ labels.reset }}
    </TxButton>
  </div>
</template>

<style scoped>
.tag-closable-demo {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.tag-closable-demo__empty {
  font-size: 13px;
  color: var(--tx-text-color-secondary);
}
</style>
