<script setup>
const props = defineProps({
  title: String,
})

const _title = computed(() => {
  return props.title.replace(/^['"]|['"]$/g, '')
})

const mobile = ref(false)

const appOptions = inject('appOptions')
const pageOptions = inject('pageOptions')
onMounted(() => setTimeout(() => mobile.value = appOptions.mobile, 200))
watchEffect(() => {
  mobile.value = appOptions.mobile
})
</script>

<template>
  <teleport to=".PageContainer" :disabled="!mobile">
    <div class="TrChatTitle">
      <span v-if="pageOptions.template?.title" class="template">@{{ pageOptions.template?.title }}</span>
      {{ _title }}
    </div>
  </teleport>
</template>

<style style="">
.TrChatTitle {
  .template {
    &::before {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0.85;
      border-radius: 12px;
      background-color: var(--theme-color);
    }
    position: relative;
    padding: 0.25rem 0.5rem;

    opacity: 0.75;
    font-size: 12px;
    border-radius: 10px;
  }

  &::before {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.5;
    border-radius: 12px;
    background-color: var(--el-mask-color-extra-light);
  }
  z-index: 5;
  position: relative;
  padding: 0.25rem 0.5rem;

  border-radius: 12px;

  box-shadow: var(--el-box-shadow);
  backdrop-filter: blur(16px) saturate(180%);
}

.mobile .TrChatTitle {
  position: absolute;
  /* padding: 0; */

  top: 2px;

  width: 100%;

  /* // 超出隐藏 */

  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  word-break: keep-all;

  font-size: 14px;
  border-radius: 0;
  text-align: center;

  border-bottom: 1px solid var(--el-border-color);
}
</style>
