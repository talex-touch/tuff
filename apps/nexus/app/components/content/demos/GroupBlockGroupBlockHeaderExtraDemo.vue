<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxGroupBlock
          name="同步"
          description="手动触发同步"
          default-icon="i-ri-loop-left-line"
          :collapsible="false"
        >
          <template #header-extra>
            <button>立即同步</button>
          </template>
          <TxBlockLine title="上次同步" description="刚刚" />
        </TxGroupBlock>
  </div>
  <div v-else>
        <TxGroupBlock
          name="同步"
          description="手动触发同步"
          default-icon="i-ri-loop-left-line"
          :collapsible="false"
        >
          <template #header-extra>
            <button>立即同步</button>
          </template>
          <TxBlockLine title="上次同步" description="刚刚" />
        </TxGroupBlock>
  </div>
</template>
