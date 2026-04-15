<script setup lang="ts">
import { globalOptions } from '~/constants'

const router = useRouter()

type UserAccountMenuItem = {
  icon?: string
  label: string
  show: boolean
  click?: () => void | Promise<void>
  divider?: boolean
  danger?: boolean
}

const menus = reactive<UserAccountMenuItem[]>([
  {
    icon: 'i-carbon-user',
    label: '个人资料',
    show: true,
    click: () => {
      router.push('/account')
    },
  },
  {
    icon: 'i-carbon-share',
    label: '分享管理',
    show: true,
    click: () => {
      router.push({
        path: '/share',
      })
    },
  },
  {
    label: '',
    divider: true,
    show: true,
  },
  {
    danger: true,
    icon: 'i-carbon-close-large',
    label: '退出登录',
    show: true,
    click: async () => {
      await logoutPilotSession()
    },
  },
])

const appOptions: any = inject('appOptions')!
const avatarUrl = computed(() => {
  const avatar = `${userStore.value.avatar}`
  if (!avatar)
    return ''

  if (avatar.startsWith('http'))
    return avatar

  return globalOptions.getEndsUrl() + avatar
})
</script>

<template>
  <div class="UserAccountAvatar">
    <div
      v-if="!userStore.isLogin" class="UserAccountAvatar-Wrapper"
      @click="appOptions.model.login = true"
    >
      <el-avatar>
        <span style="transform: scale(.75)">登录</span>
      </el-avatar>
    </div>

    <el-popover
      v-else placement="right-end" :width="300" :show-arrow="false" popper-class="UserAccountAvatar-Float"
      popper-style="box-shadow: rgb(14 18 22 / 35%) 0px 10px 38px -10px, rgb(14 18 22 / 20%) 0px 10px 20px -15px; padding: 20px;"
    >
      <template #reference>
        <div class="UserAccountAvatar-Wrapper" @click="router.push('/')">
          <el-avatar :src="avatarUrl" />
        </div>
      </template>
      <template #default>
        <div class="UserAccountAvatar-Head">
          <el-avatar :src="avatarUrl" />

          <p flex items-center>
            <span class="name">{{ userStore.nickname }} <span class="privilege">
              <span v-if="!userStore.subscription?.type">免费订阅</span>
              <span v-else-if="userStore.subscription?.type === 'ULTIMATE'">高级订阅</span>
              <span v-else-if="userStore.subscription?.type === 'STANDARD'">标准订阅</span>
            </span>
              <span v-if="false" mx-2 style="--c: #FB533080" class="privilege"> <span class="dummy">0.00 ￥</span></span>
            </span>
          </p>
        </div>
        <div class="UserAccountAvatar-Selections" style="display: flex; gap: 16px; flex-direction: column">
          <div
            v-for="item in menus" :key="item.label" v-wave :class="{ danger: item.danger, divider: item.divider }"
            :style="`${item.show ? '' : 'display: none'}`" class="UserAccountAvatar-MenuItem" @click="item.click?.()"
          >
            <div v-if="item.icon" :class="item.icon" />
            {{ item.label }}
          </div>
        </div>
      </template>
    </el-popover>
  </div>
</template>

<style lang="scss">
.UserAccountAvatar-MenuItem {
  &.divider {
    margin: 0 1rem;
    padding: 0;
    height: 2px;

    background: var(--el-border-color) !important;
  }

  .dark &:hover {
    background: #ffffff10;
  }

  &:hover {
    background: #00000010;
  }

  &.danger {
    &:hover {
      color: #fff;
      background: var(--el-color-danger);
    }
  }
  display: flex;
  padding: 0.5rem 1rem;

  gap: 0.5rem;
  cursor: pointer;
  transition: 0.25s;
  user-select: none;
  border-radius: 12px;
}

.UserAccountAvatar-Selections {
  margin: 1rem 0;
}

.UserAccountAvatar-Head {
  p {
    display: flex;

    align-items: center;
    flex-direction: column;

    .privilege {
      padding: 0.25rem 0.5rem;

      font-size: 12px;
      border-radius: 8px;
      // background: #ffca1a50;
      background: var(--plan-color, #21384c50);
    }

    .name {
      margin: 0.25rem 0;
      color: var(--el-text-color-primary);

      font-size: 16px;
    }
  }
  display: flex;

  gap: 0.5rem 0.25rem;
  align-items: center;
  flex-direction: column;

  .el-avatar {
    width: 72px;
    height: 72px;
  }
}

.UserAccountAvatar {
  .privacy & {
    filter: blur(5px);
  }

  &-Wrapper {
    .el-avatar {
      width: 28px;
      height: 28px;
    }

    cursor: pointer;
  }
}

div.el-popper.UserAccountAvatar-Float {
  padding: 1.5rem !important;
  border: none;

  border-radius: 16px;
  background: var(--el-bg-color);
  box-shadow: var(--el-box-shadow);
}
</style>
