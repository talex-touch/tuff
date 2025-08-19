<template>
  <div
    class="StatCard fake-background relative overflow-hidden backdrop-blur-xl border-[var(--el-border-color-lighter)] rounded-2xl p-4 flex flex-col items-start justify-end h-28"
  >
    <div class="StatCard-Content">
      <div class="StatCard-Icon transition-cubic top-0 left-0 absolute w-full h-full">
        <i class="absolute right-4 top-[50%] translate-y-[-50%]" :class="iconClass" />
      </div>
      <span class="text-3xl font-bold text-[var(--el-text-color-primary)]">
        <NumberFlow :value="displayValue" />
      </span>
      <span class="block text-sm text-[var(--el-text-color-secondary)]">{{ label }}</span>
    </div>
    <div class="StatCard-Decoration transition-cubic -z-10 top-0 left-0 w-full h-full absolute">
      <i
        class="absolute right-4 top-[50%] translate-y-[-50%] text-[var(--el-text-color-secondary)]"
        :class="iconClass"
      />
    </div>
  </div>
</template>

<script name="StatCard" lang="ts" setup>
import NumberFlow from '@number-flow/vue'
import { sleep } from '@talex-touch/utils'

const props = defineProps<{
  value: number | string
  label: string
  iconClass: string
}>()

const displayValue = ref(0)

onMounted(() => {
  sleep(Math.random() * 500 + 100).then(() => {
    displayValue.value = Number(props.value)
  })
})
</script>

<style lang="scss" scoped>
.StatCard {
  &:hover {
    cursor: pointer;
    --fake-opacity: 0.75;
    border-color: var(--el-border-color-light);

    .StatCard-Decoration {
      transform: scale(1.25);
      filter: blur(30px) brightness(150%) saturate(200%);
    }

    .StatCard-Icon {
      transform: scale(1.25);
    }
  }

  &-Decoration {
    transform: scale(1.5);
    filter: blur(20px) brightness(120%) saturate(180%);
  }
  border: 1px solid var(--el-border-color-lighter);
}
</style>
