<script setup lang="ts">
import type { IInnerItemMeta } from '~/composables/api/base/v1/aigc/completion-types'

const props = defineProps<{
  data: any
  value: any
}>()
</script>

<template>
  <div class="Lucky">
    <div class="Lucky-Inner">
      <el-progress type="dashboard" :percentage="value.work">
        <template #default="{ percentage }">
          <span class="percentage-value">{{ percentage }}%</span>
          <span class="percentage-label">工作</span>
        </template>
      </el-progress>
      <el-progress color="#BA996B" type="dashboard" :percentage="value.money">
        <template #default="{ percentage }">
          <span class="percentage-value">{{ percentage }}%</span>
          <span class="percentage-label">财富</span>
        </template>
      </el-progress>
      <el-progress color="#F24654" type="dashboard" :percentage="value.love">
        <template #default="{ percentage }">
          <span class="percentage-value">{{ percentage }}%</span>
          <span class="percentage-label">爱情</span>
        </template>
      </el-progress>
      <el-progress color="#3D9375" type="dashboard" :percentage="value.health">
        <template #default="{ percentage }">
          <span class="percentage-value">{{ percentage }}%</span>
          <span class="percentage-label">健康</span>
        </template>
      </el-progress>
    </div>

    <div class="Lucky-Inner column">
      <p>
        <span class="key">幸运数字</span>
        <span class="val">
          {{ value.number }}</span>
      </p>
      <p>
        <span class="key">贵人星座</span>
        <span class="val">
          {{ value.QFriend }}</span>
      </p>
      <p>
        <span class="key">专属颜色</span>
        <span class="val">
          {{ value.color }}</span>
      </p>
      <p>
        <span class="key">总体评价</span>
        <span class="val">
          {{ value.all }}</span>
      </p>
      <p>
        <span class="key">测评时间</span>
        <span class="val">
          {{ value.datetime }}</span>
      </p>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.Lucky {
  .percentage-value {
    display: block;
    margin-top: 10px;
    font-size: 28px;
  }

  .percentage-label {
    display: block;
    margin-top: 10px;
    font-size: 12px;
  }

  &-Inner {
    &.column {
      flex-direction: column;
      p {
        display: flex;

        justify-content: space-between;

        .key {
          width: 80px;
          // text-align: right;
        }
        .val {
          opacity: 0.75;
        }
      }
    }
    position: relative;
    margin: 0.5rem;
    padding: 0.5rem;
    display: flex;

    gap: 0.5rem;
    flex-wrap: wrap;

    border-radius: 12px;
    background-color: var(--el-bg-color);
  }

  &-Content {
    position: relative;
    padding: 0.5rem;

    color: #fff;

    font-size: 15px;
    border-radius: 12px;
    background-color: var(--theme-color);
  }

  position: relative;

  width: 300px;

  // width: 20rem;
  // height: 20rem;

  overflow: hidden;
  border-radius: 8px;
}
</style>
