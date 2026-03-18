<script setup lang="ts">
import AccountAvatar from '~/components/personal/AccountAvatar.vue'

const router = useRouter()
const route = useRoute()

const device = import.meta.client
  ? useDevice()
  : {
      isChrome: true,
      isDesktop: false,
    }

function safeBack(fallback = '/admin') {
  if (!import.meta.client) {
    void router.replace(fallback)
    return
  }
  if (window.history.length > 1) {
    router.back()
    return
  }
  void router.replace(fallback)
}

onBeforeMount(() => {
  if (!userStore.value.isAdmin) {
    safeBack('/')
    return
  }

  if (device.isDesktop && !device.isChrome) {
    ElNotification({
      duration: 60000,
      title: '使用 Chrome 以继续',
      message: '请勿使用未受信任的浏览器操作！',
    })

    safeBack('/')
  }
})

const watermarkFont = reactive({
  color: 'rgba(0, 0, 0, .15)',
})

const color = useColorMode()
watch(
  color,
  () => {
    watermarkFont.color = color.value === 'dark'
      ? 'rgba(255, 255, 255, .15)'
      : 'rgba(0, 0, 0, .15)'
  },
  { immediate: true },
)

const pageTitle = computed(() => {
  const fallback = '/admin'
  const path = route.path || fallback
  if (path === fallback) {
    return '管理首页'
  }
  return path.replace('/admin/', '').split('/').join(' / ')
})
</script>

<template>
  <el-container class="AdminLayout">
    <AdminSideNav />

    <el-container class="AdminMainContainer">
      <el-header class="AdminHeader fake-background">
        <div class="AdminHeader-Start">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/admin' }">
              Admin
            </el-breadcrumb-item>
            <el-breadcrumb-item>
              {{ pageTitle }}
            </el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="AdminHeader-End">
          <AccountAvatar />
        </div>
      </el-header>

      <el-main class="AdminMain">
        <el-watermark :font="watermarkFont" :z-index="100" class="watermark" :content="[userStore.nickname || '', 'Pilot Admin']">
          <slot />
        </el-watermark>
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped lang="scss">
.AdminLayout {
  width: 100%;
  height: 100%;
}

.AdminMainContainer {
  width: 100%;
  min-width: 0;
}

.AdminHeader {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.AdminMain {
  position: relative;
  padding: 12px;
  width: 100%;
  height: calc(100% - 60px);
  overflow: auto;
}
</style>
