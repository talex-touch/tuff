<script setup lang="ts">
import dayjs from 'dayjs'
import { getHistoryList } from '~/composables/api/account'

const props = defineProps<{
  data: any
}>()
</script>

<template>
  <div class="TouchDialog-Title">
    <div i-carbon:user-multiple />邀请记录
  </div>
  <div class="ModuleInvitation TouchDialog-Content">
    <div v-if="data" class="ModuleInvitation-Main">
      <div v-for="invitation in data" :key="invitation.id" class="ModuleInvitation-Main-Item">
        邀请
        <PersonalNormalUser :data="invitation.user" />

        <p class="time">
          {{ formatDate(invitation.createdAt) }}
        </p>

        <span class="type">
          <template v-if="invitation.source === 'miniprogram'">
            小程序
          </template>
        </span>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.ModuleInvitation {
  &-Main {
    &-Item {
      .type {
        position: absolute;
        padding: 0.25rem 0.5rem;

        top: 0;
        right: 0;

        color: #fff;
        font-size: 12px;
        border-radius: 4px 18px 4px 8px;
        background-color: var(--theme-color);
      }

      .time {
        font-size: 14px;
        color: var(--el-text-color-secondary);
      }

      &:hover {
        cursor: pointer;
        background-color: var(--el-fill-color-lighter);
      }
      position: relative;
      padding: 0.5rem 0.75rem;
      display: flex;

      width: 400px;
      max-width: 100%;

      gap: 0.5rem;
      align-items: center;

      border-radius: 18px;
      background-color: var(--el-bg-color);
      border: 1px solid var(--el-border-color);
    }
    display: flex;

    gap: 1rem;
    flex-direction: column;
  }

  position: relative;
  margin: 0.5rem 0;
  display: flex;
  padding: 1rem;

  flex-direction: column;

  width: max-content;
  min-height: 70px;

  border-radius: 12px;
  // box-shadow: var(--el-box-shadow);
  // background-color: var(--el-bg-color);
}
</style>
