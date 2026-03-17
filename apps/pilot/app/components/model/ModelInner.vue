<script setup lang="ts">
import { resolveRuntimeModelIconSource, usePilotRuntimeModels } from '~/composables/usePilotRuntimeModels'

const props = defineProps<{
  modelValue: string
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const modelRef = ref()
const model = useVModel(props, 'modelValue', emits)
const { models, ensureLoaded } = usePilotRuntimeModels()

onMounted(() => {
  void ensureLoaded()
})

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
        <img v-if="resolveRuntimeModelIconSource(item).type === 'image'" :src="resolveRuntimeModelIconSource(item).value">
        <span v-else-if="resolveRuntimeModelIconSource(item).type === 'emoji'" class="icon-emoji">{{ resolveRuntimeModelIconSource(item).value }}</span>
        <i v-else :class="resolveRuntimeModelIconSource(item).value" class="icon-class" />
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

  .icon-class {
    width: 32px;
    height: 32px;
    line-height: 32px;
    font-size: 26px;
    text-align: center;
  }

  .icon-emoji {
    display: inline-flex;
    width: 32px;
    height: 32px;
    line-height: 32px;
    font-size: 24px;
    align-items: center;
    justify-content: center;
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
