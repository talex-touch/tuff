<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TxTooltip content="提示信息">
          <TxButton variant="ghost">
Hover me
</TxButton>
        </TxTooltip>
        <TxTooltip content="信息">
          <TxButton variant="ghost">
Info
</TxButton>
        </TxTooltip>
  </div>
  <div v-else>
        <TxTooltip content="Hint">
          <TxButton variant="ghost">
Hover me
</TxButton>
        </TxTooltip>
        <TxTooltip content="Info">
          <TxButton variant="ghost">
Info
</TxButton>
        </TxTooltip>
  </div>
</template>
