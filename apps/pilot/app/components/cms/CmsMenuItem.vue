<script setup lang="ts">
const props = defineProps<{
  path?: string
  external?: string
  query?: string
  danger?: boolean
  emphasis?: boolean
  active?: boolean
}>()

const select = ref(false)

watchEffect(() => {
  select.value = props.active
})

const router = useRouter()
const route = useRoute()

watch(() => route.fullPath, () => {
  if (props.path)
    select.value = route.fullPath === props.path

  if (props.query)
    select.value = route.query.data === props.query
}, { immediate: true })

async function handleClick() {
  if (props.external) {
    if (props.external.startsWith('http'))
      return window.open(props.external, '_blank')
  }

  if (props.path)
    await router.push(props.path)

  if (props.query)
    await router.push({ query: { ...route.query, data: props.query } })
}
</script>

<template>
  <div v-wave :class="{ select, danger, emphasis }" class="CmsMenuItem" @click="handleClick">
    <slot />
  </div>
</template>

<style lang="scss" scoped>
.CmsMenuItem {
  &:hover,
  &.select {
    .wallpaper & {
      background: var(--el-mask-color-extra-light);
    }
    color: var(--el-color-primary);
    background-color: var(--el-border-color-extra-light);

    filter: drop-shadow(0 0 2px var(--el-border-color));
  }

  position: relative;
  display: flex;

  padding: 0.75rem 2rem;

  gap: 0.5rem;
  align-items: center;

  cursor: pointer;
  transition: max-height 0.2s ease-in-out;
}

.CmsMenuItem.danger {
  &:hover,
  &.select {
    color: var(--el-color-danger);

    background-color: var(--el-border-color-extra-light);
  }
}

.CmsMenuItem.emphasis {
  &:hover,
  &.select {
    color: var(--el-color-success);

    // background-color: var(
    //   --wallpaper-color-light,
    //   var(--el-border-color-extra-light)
    // );
  }
}
</style>
