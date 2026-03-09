<script setup lang="ts">
import { models } from './model'

const props = defineProps<{
  modelValue: string
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const modelRef = ref()
const model = useVModel(props, 'modelValue', emits)

function handleClick(item: any) {
  if (item?.valuable)
    return

  model.value = item.key
}

// const mappedModel = computed(() => {
//   const subscriptionType = userStore.value?.subscription?.type

//   const _models = JSON.parse(JSON.stringify(models))
//   if (!subscriptionType)
//     return _models

//   switch (subscriptionType) {
//     case 'ULTIMATE':
//       _models[2].valuable = false
//       // fallthrough
//     case 'STANDARD':
//       _models[1].valuable = false
//       break
//   }

//   return _models
// })
</script>

<template>
  <div ref="modelRef" class="ModelSelector-Models">
    <el-scrollbar>
      <div
        v-for="item in models" :key="item.name" v-wave :class="{
          active: model === item.key,

        }" class="ModelSelector-Item fake-background" @click="handleClick(item)"
      >
        <!-- valuable: item.valuable, -->
        <!-- <div v-if="item.valuable" i-carbon-locked />
      <div v-else i-carbon-unlocked /> -->
        <img :src="item.img">
        {{ item.name }}
      </div>
    </el-scrollbar>
  </div>
</template>

<style lang="scss">
.ModelSelector-Models {
  position: relative;
  left: 0;
  top: 0;

  width: 100%;
  height: calc(100% - 2rem);

  border-radius: 16px;
  transition: 0.25s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.ModelSelector-Item {
  .mobile & {
    font-size: 14px;
  }

  img {
    width: 32px;
    height: 32px;
  }

  position: relative;
  padding: 0.5rem;
  margin: 1rem;
  display: flex;

  align-items: center;

  gap: 0.5rem;
  height: 52px;

  cursor: pointer;
  font-size: 14px;
  border-radius: 12px;
  transition: 0.5s;

  border: 2px solid #0000;

  &:hover {
    --fake-opacity: 0.25;
    border: 2px solid var(--theme-color);
  }
  &.active {
    border: 2px solid var(--theme-color);
    --fake-color: var(--theme-color);
    --fake-opacity: 0.5;
  }
  &.valuable {
    &:hover {
      color: var(--el-color-danger);
    }
    // .ModelSelector.expand & {
    //   &:hover {
    //     color: var(--el-color-info);
    //   }

    //   color: var(--el-text-color-primary);
    // }
    color: var(--el-text-color-regular);
  }
}
</style>
