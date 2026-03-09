<script setup lang="ts">
import dayjs from 'dayjs'

const version = computed(() => {
  const time = dayjs(__BuildTime__).format('YY.MM.DD')
  const sha = __THISAI_VERSION__

  return `${time}-${sha}`
})

const storagedVersion = useLocalStorage('version', '')

onMounted(() => {
  if (storagedVersion.value === version.value)
    return

  // 当且仅当为管理员模式才启用
  if (!userStore.value.isAdmin)
    return

  ElMessageBox.alert(`
    <div>
      <div>当前版本：${version.value}</div>
      <div>上次版本：${storagedVersion.value}</div>
    </div>
  `, '版本更新', {
    confirmButtonText: '已了解',
    dangerouslyUseHTMLString: true,
  })
    .then(() => {
      storagedVersion.value = version.value
    })
})
</script>

<template>
  <span class="VersionBar">
    <!-- <span float-right mr-4> -->
    {{ version }}
    <!-- </span> -->
  </span>
</template>

<style lang="scss">
// .mobile .VersionBar {
//   position: absolute;

//   left: 50%;

//   bottom: 1rem;

//   transform: translateX(-50%) scale(0.75);
// }

.VersionBar {
  display: flex;

  align-items: center;

  color: var(--el-text-color-secondary);
  font-size: 12px;
  text-align: center;

  // mix-blend-mode: difference;
  // background: var(--el-bg-color-page);
}
</style>
