<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxSteps :active="1">
          <TxStep title="开始" description="收集基础信息" :step="0" />
          <TxStep title="填写" description="补充详细内容" :step="1" />
          <TxStep title="完成" description="确认提交" :step="2" />
        </TxSteps>
  </div>
  <div v-else>
        <TxSteps :active="1">
          <TxStep title="Start" description="Collect basics" :step="0" />
          <TxStep title="Details" description="Fill in details" :step="1" />
          <TxStep title="Finish" description="Review and submit" :step="2" />
        </TxSteps>
  </div>
</template>
