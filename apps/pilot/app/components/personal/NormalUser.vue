<script setup lang="ts">
import UserAvatar from './UserAvatar.vue'

defineProps<{
  data: any
}>()
</script>

<template>
  <el-popover v-if="data" placement="bottom-start" :width="240" trigger="hover">
    <template #reference>
      <UserAvatar :avatar="data.avatar" />
    </template>
    <div class="UserProfile">
      <h1>{{ data.nickname }}</h1>
      <p>{{ data.remark }}</p>
      <ul class="UserProfile-Info">
        <li>
          <span class="label">账号</span>
          <span class="value">{{ data.username }}(#{{ data.id }})</span>
        </li>
        <li>
          <span class="label">QQ</span>
          <span class="value">{{ data.qq }}</span>
        </li>
        <li>
          <span class="label">Email</span>
          <span class="value">{{ data.email }}</span>
        </li>
        <li>
          <span class="label">创建时间</span>
          <span class="value">{{ formatDate(data.createdAt) }}</span>
        </li>
        <li>
          <span class="label">更新时间</span>
          <span class="value">{{ formatDate(data.updatedAt) }}</span>
        </li>
      </ul>
    </div>
  </el-popover>
</template>

<style lang="scss">
.UserProfile {
  h1 {
    font-size: 18px;
    font-weight: 600;
  }
  p {
    margin: 0.25rem 0;
  }

  ul {
    li {
      gap: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin: 0.25rem 0;
      padding: 0.25rem 0;
      .label {
        color: var(--el-text-color-primary);
      }
      .value {
        color: var(--el-text-color-placeholder);
      }
    }
  }
  display: flex;

  flex-direction: column;
  justify-content: center;
  align-items: center;
}
</style>
