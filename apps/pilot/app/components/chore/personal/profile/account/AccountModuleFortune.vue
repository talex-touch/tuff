<script setup lang="ts">
</script>

<template>
  <div flex-col style="align-items: flex-start" class="TouchDialog-Title">
    <div flex items-center gap-2>
      <div i-carbon:warning />提示
    </div>
    <p style="font-size: 16px" op-50>
      运势功能已下线。
    </p>
  </div>
  <div class="ModuleFortune TouchDialog-Content">
    <el-empty description="运势功能已下线" />
  </div>
</template>

<style lang="scss" scoped>
.ModuleFortune {
  position: relative;
  padding: 1rem;
}
</style>
