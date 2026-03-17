<script setup lang="ts">
import { $endApi } from '~/composables/api/base'
import { ENDS_URL, globalOptions } from '~/constants'
import Logo from '../chore/Logo.vue'
import AccountAvatar from '../personal/AccountAvatar.vue'

defineProps<{
  cur: string
}>()

const endUrl = ref(globalOptions.getEndsUrl())

watch(() => endUrl.value, async (val) => {
  globalOptions.setEndsUrl(val)

  const res = await $endApi.v1.auth.serverStatus()

  if (res.code !== 200 || res.message !== 'success') {
    const result = await ElMessageBox.confirm('当前环境地址异常，仍然切换吗？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })

    if (result !== 'confirm')
      return
  }

  if (import.meta.client) {
    setTimeout(() => window.location.reload(), 500)
  }
})
</script>

<template>
  <el-header class="CmsHeader fake-background">
    <div class="CmsHeader-Start">
      <span flex items-center>
        <span class="head-start">
          <Logo />
          <span font-bold>科塔智爱</span>
        </span>

        <el-breadcrumb>
          <el-breadcrumb-item :to="{ path: '/cms/' }">
            管理中心
          </el-breadcrumb-item>
          <el-breadcrumb-item v-if="cur">
            {{ cur }}
          </el-breadcrumb-item>
        </el-breadcrumb>
      </span>
    </div>

    <div class="CmsHeader-End">
      <div class="head-func">
        <el-popover
          popper-class="cms-card"
          placement="bottom" :width="200" trigger="hover"
        >
          <template #reference>
            <p>
              <i i-carbon:app block />
            </p>
          </template>
          <CmsApplication />
        </el-popover>

        <!-- <p>
          <i i-carbon:renew block />
        </p>
        <p>
          <i i-carbon:locked block />
        </p> -->
      </div>
      <!-- 设置全局环境地址 -->
      <el-select v-model="endUrl" placeholder="选择系统环境" style="width: 200px">
        <el-option v-for="item in Object.values(ENDS_URL)" :key="item.value" :label="item.label" :value="item.value" />
      </el-select>

      <AccountAvatar />
    </div>
  </el-header>
</template>

<style lang="scss">
.CmsHeader {
  &-Start,
  &-End,
  .head-func,
  .head-func > p {
    & > p {
      gap: 0.25rem;

      cursor: pointer;

      color: var(--el-color-primary);
    }
    display: flex;
    align-items: center;
  }

  z-index: 1;
  position: relative;
  padding: 0 1rem;
  display: flex;

  align-items: center;
  justify-content: space-between;

  width: 100%;

  --fake-opacity: 0.85;
  background: linear-gradient(
    to right,
    var(--theme-color-light),
    var(--theme-color)
  );
  background-color: var(--el-bg-color-page);
  // border-bottom: 1px solid var(--el-border-color);
}

.CmsHeader-End {
  .head-func {
    gap: 0.5rem;
  }

  .el-select {
    &__wrapper {
      box-shadow: none;
      border-radius: 8px;
      background: var(--el-fill-color);
    }
    background: var(--el-fill-color);
    border-radius: 8px;
  }

  .AccountAvatar-Wrapper {
    .el-avatar {
      width: 2rem;
      height: 2rem;
    }
  }

  gap: 2rem;
}

.CmsHeader {
  .head-start {
    margin-right: 1rem;
    padding-right: 1rem;

    display: flex;
    align-items: center;

    border-right: 1px solid var(--el-border-color);
  }
}
</style>
