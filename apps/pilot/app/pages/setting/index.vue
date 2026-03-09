<script setup lang="ts">
const props = defineProps<{
  modelValue?: boolean
}>()

const router = useRouter()

definePageMeta({
  name: '设置',
  layout: 'adapt',
  back: () => {
    userConfig.value.pri_info.appearance.expand = false

    return true
  },
})
</script>

<template>
  <div>
    <slot />
  </div>
</template>
