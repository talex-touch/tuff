<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxGroupBlock
          name="高级设置"
          description="折叠展示内容"
          default-icon="i-ri-folder-line"
          active-icon="i-ri-folder-open-line"
          :default-expand="false"
        >
          <p>高级内容</p>
        </TxGroupBlock>
  </div>
  <div v-else>
        <TxGroupBlock
          name="高级设置"
          description="折叠展示内容"
          default-icon="i-ri-folder-line"
          active-icon="i-ri-folder-open-line"
          :default-expand="false"
        >
          <p>高级内容</p>
        </TxGroupBlock>
  </div>
</template>
