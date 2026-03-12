<script setup lang="ts">
const router = useRouter()

const appOptions: any = inject('appOptions')!

function openSetting() {
  router.push('/account')
}
</script>

<template>
  <div class="ShrinkAccountAvatar">
    <div
      v-if="!userStore.isLogin"
      class="ShrinkAccountAvatar-Wrapper"
      @click="appOptions.model.login = true"
    >
      <el-avatar>
        <span style="transform: scale(0.75)">登录</span>
      </el-avatar>
    </div>

    <div v-else class="ShrinkAccountAvatar-Wrapper" @click="openSetting">
      <el-avatar :src="formatEndsImage(userStore.avatar!)" />

      <span class="privilege">
        <span v-if="!userStore.subscription?.type">免费订阅</span>
        <span v-else-if="userStore.subscription?.type === 'ULTIMATE'">高级订阅</span>
        <span v-else-if="userStore.subscription?.type === 'STANDARD'">标准订阅</span>
      </span>
    </div>
  </div>
</template>

<style lang="scss">
.ShrinkAccountAvatar {
  .privacy & {
    filter: blur(5px);
  }

  &-Wrapper {
    .el-avatar {
      width: 28px;
      height: 28px;
    }
    display: flex;

    cursor: pointer;
    flex-direction: column;
  }
  position: relative;

  margin-bottom: 0.25rem;
}

.ShrinkAccountAvatar-Wrapper .privilege {
  position: absolute;
  padding: 0.125rem 0.25rem;

  left: 50%;
  width: max-content;
  bottom: -0.5rem;

  font-size: 10px;

  border-radius: 4px;
  transform: translate(-50%, 0) scale(0.9);

  background-color: var(--plan-fill, var(--theme-color));
}
</style>
