<script setup lang="ts">
const route = useRoute()

onMounted(() => {
  console.log(route.query)
})
</script>

<template>
  <div :class="{ error: $route.query.error }" class="Invitation">
    <ChoreLogo />

    <h1>
      <span v-if="userStore.isLogin">
        <OtherTextShaving :text="`${$route.query.code ? ('请稍后') : '无法完成邀请'}`" />
      </span>
      <span v-else>
        请登录后再尝试接受邀请
      </span>
    </h1>
  </div>
</template>

<style lang="scss" scoped>
.Invitation {
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
