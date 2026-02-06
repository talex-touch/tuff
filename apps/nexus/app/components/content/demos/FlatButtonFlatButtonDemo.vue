<script setup lang="ts">
const { locale } = useI18n()
</script>

<template>
  <div v-if="locale === 'zh'">
        <TuffFlatButton>默认</TuffFlatButton>
        <TuffFlatButton primary>
主色
</TuffFlatButton>
        <TuffFlatButton mini>
小尺寸
</TuffFlatButton>
        <TuffFlatButton loading>
加载中
</TuffFlatButton>
  </div>
  <div v-else>
        <TuffFlatButton>Default</TuffFlatButton>
        <TuffFlatButton primary>
Primary
</TuffFlatButton>
        <TuffFlatButton mini>
Mini
</TuffFlatButton>
        <TuffFlatButton loading>
Loading
</TuffFlatButton>
  </div>
</template>
