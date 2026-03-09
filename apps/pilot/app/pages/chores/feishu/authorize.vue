<script setup lang="ts">
const route = useRoute()

onMounted(() => {
  console.log(route.query)
})
</script>

<template>
  <div :class="{ error: $route.query.error }" class="Authorize">
    <ChoreLogo />

    <h1>
      <OtherTextShaving :text="`${$route.query.error ? ($route.query.msg || '无法完成授权申请') : '正在申请授权中...'}`" />
    </h1>
  </div>
</template>

<style lang="scss" scoped>
.Authorize {
  position: absolute;
  padding: 2rem;
  display: flex;

  gap: 5rem;
  align-items: center;
  flex-direction: column;
  justify-content: center;

  left: 50%;

  width: 90%;
  max-width: 500px;
  height: 100%;
  max-height: 350px;

  border-radius: 16px;
  transform: translateX(-50%);
  box-shadow: var(--el-box-shadow);
  border: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color-page);
}
</style>
