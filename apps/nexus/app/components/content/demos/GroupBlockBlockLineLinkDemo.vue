<script setup lang="ts">
import { TxBlockLine, TxGroupBlock } from '@talex-touch/tuffex/group-block'
import { computed } from 'vue'

const { locale } = useI18n()

const labels = computed(() => locale.value === 'zh'
  ? {
      title: '资源链接',
      description: '可点击的跳转行',
      docs: '查看文档',
      docsDesc: '打开开发者文档',
      repo: '查看仓库',
      repoDesc: '浏览源码示例',
    }
  : {
      title: 'Resource links',
      description: 'Clickable navigation rows',
      docs: 'Documentation',
      docsDesc: 'Open developer docs',
      repo: 'Repository',
      repoDesc: 'Browse source examples',
    })
</script>

<template>
  <div class="group-block-showcase">
    <TxGroupBlock
      :name="labels.title"
      :description="labels.description"
      default-icon="i-ri-links-line"
      :collapsible="false"
    >
      <TxBlockLine :title="labels.docs" link>
        <template #description>
          {{ labels.docsDesc }}
          <span class="i-carbon-arrow-up-right" aria-hidden="true" />
        </template>
      </TxBlockLine>
      <TxBlockLine :title="labels.repo" link>
        <template #description>
          {{ labels.repoDesc }}
          <span class="i-carbon-code" aria-hidden="true" />
        </template>
      </TxBlockLine>
    </TxGroupBlock>
  </div>
</template>

<style scoped>
.group-block-showcase {
  width: min(100%, 640px);
}
</style>
