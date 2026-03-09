<script setup lang="ts">
definePageMeta({
  layout: 'personal',
})
</script>

<template>
  <div class="PersonalEmpty">
    <el-empty description="您还未获得授权." />
  </div>
</template>

<style lang="scss">
.PersonalEmpty {
  display: flex;

  align-items: center;
  justify-content: center;

  height: 100%;
}
</style>
