<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  data: any
  value: any
}>()

const progress = computed(() => [...(props.value?.queryresult?.pods || [])].filter(item => item?.subpods[0]?.plaintext))
</script>

<template>
  <div v-if="progress" class="Calculator">
    <div v-for="item in progress" :key="item.title">
      <p
        v-for="link in item.subpods" :key="link.plaintext" class="Calculator-Item" target="_blank" :href="link.img.src"
        :title="`${link.img.title}`"
      >
        <el-tooltip :content="item.title">
          <div v-copy="link.plaintext" i-carbon:copy cursor-pointer text-sm />
        </el-tooltip>
        {{ link.plaintext }}
      </p>

      <!-- <el-tooltip content="查看计算过程图片">
        <div i-carbon:view absolute right-2 cursor-pointer text-sm op-50 hover:op-75 />
      </el-tooltip> -->
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Calculator {
  &-Item,
  & > div {
    padding: 0.25rem;
    // padding-right: 2rem;
    display: flex;

    gap: 0.5rem;
    align-items: center;

    border-radius: 8px;
    background-color: var(--el-fill-color);
  }

  position: relative;
  margin-bottom: 0.5rem;
  display: flex;

  gap: 0.5rem;
  flex-direction: column;

  // width: 20rem;
  // height: 20rem;

  overflow: hidden;
  border-radius: 8px;
}
</style>
