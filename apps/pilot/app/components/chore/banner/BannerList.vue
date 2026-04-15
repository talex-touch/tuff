<script setup lang="ts">
import { $endApi } from '~/composables/api/base'
import type { IBannerGroup } from '~/composables/api/base/v1/marketing.type'

const props = defineProps<{
  modelValue: IBannerGroup[]
  select: number
}>()

const emits = defineEmits<{
  (e: 'update:modelValue', value: IBannerGroup[]): void
  (e: 'update:select', data: number): void
}>()

const _select = useVModel(props, 'select', emits)
const bannerList = useVModel(props, 'modelValue', emits)

async function handleCreateEmpty() {
  const res = await $endApi.v1.market.banner.create({
    name: '新横幅组',
  })

  if (responseMessage(res)) {
    bannerList.value.push(res.data)

    _select.value = res.data!.id!
  }
}
</script>

<template>
  <div class="BannerList">
    <ButtonWavingButton class="BannerList-Item" flex items-center gap-2 @click="handleCreateEmpty">
      <div i-carbon-add mr-2 />
      <span>新增横幅组</span>
    </ButtonWavingButton>

    <div
      v-for="banner in bannerList" :key="banner.id" v-wave :class="{ active: _select === banner.id }"
      class="BannerList-Item" @click="_select === banner.id ? _select = -1 : _select = banner.id!"
    >
      {{ banner.name }}
    </div>
  </div>
</template>

<style lang="scss">
.BannerList {
  display: flex;
  padding: 1rem;

  gap: 1rem;
  flex-direction: column;

  &-Item {
    &.active {
      color: #fff;
      background-color: var(--el-color-primary);
    }

    display: flex;
    padding: 0.5rem;

    gap: 0.5rem;
    align-items: center;

    cursor: pointer;
    // font-size: 18px;
    user-select: none;
    border-radius: 12px;
    background-color: var(--el-bg-color);
  }
}
</style>
