<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxAlert title="提示" message="检查一下配置项。" type="info" />
        <TxAlert title="成功" message="已保存。" type="success" />
        <TxAlert title="注意" message="有需要处理的内容。" type="warning" />
        <TxAlert title="失败" message="保存失败。" type="error" />
  </div>
  <div v-else>
        <TxAlert title="Heads up" message="Check your configuration." type="info" />
        <TxAlert title="Success" message="Saved successfully." type="success" />
        <TxAlert title="Warning" message="Something needs your attention." type="warning" />
        <TxAlert title="Error" message="Save failed." type="error" />
  </div>
</template>
