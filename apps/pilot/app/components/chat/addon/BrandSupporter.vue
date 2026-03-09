<script setup lang="ts">
import PoweredByDouBao from '~/components/chore/PoweredByDouBao.vue'

const show = ref(false)

onMounted(() => {
  watchEffect(() => {
    const tutorial = userConfig.value.pri_info.info.tutorial

    if (!tutorial) { localStorage.removeItem('brand-supporter') }

    else if (localStorage.getItem('brand-supporter') !== 'hide') {
      setTimeout(() => {
        show.value = true

        setTimeout(() => {
          show.value = false
          localStorage.setItem('brand-supporter', 'hide')
        }, 8200)
      }, 2000)
    }
  })
})
</script>

<template>
  <div :class="{ show }" class="BrandSupporter transition-cubic">
    <p>能力由 <span>豆包大模型</span> 驱动.</p>

    <PoweredByDouBao />
  </div>
</template>

<style lang="scss" scoped>
.BrandSupporter {
  &.show {
    opacity: 1;
    filter: blur(0);
    transform: translate(-50%) scale(1) translateY(0);
  }
  p {
    span {
      color: #2eae7f;
    }
    color: var(--el-text-color-secondary);
    font-size: 20px;
    font-weight: 600;
  }
  .mobile & {
    top: max(5%, 50px);
  }
  z-index: 3;
  position: absolute;
  display: flex;
  padding: 1rem;

  top: 1rem;
  left: 50%;

  width: 380px;
  max-width: 85%;

  height: 150px;
  max-height: 30%;

  opacity: 0;
  transform: translate(-50%) scale(0.8) translateY(-200%);

  align-items: center;
  flex-direction: column;
  justify-content: space-between;

  filter: blur(5px);
  border-radius: 16px;
  box-shadow: var(--el-box-shadow);
  background-color: var(--el-bg-color);

  transition-duration: 0.5s;
}
</style>
