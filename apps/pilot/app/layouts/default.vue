<script setup lang="ts">
import hotkeys from 'hotkeys-js'
import ShrinkAccountAvatar from '~/components/personal/ShrinkAccountAvatar.vue'
import IndexNavbar from '~/components/chore/IndexNavbar.vue'
import { $event } from '~/composables/events'

const route = useRoute()
const router = useRouter()

onMounted(() => {
  watch(() => route.fullPath, refreshHotKeyScope, { immediate: true })

  router.afterEach(refreshHotKeyScope)

  function refreshHotKeyScope() {
    const scope = (route.meta?.scope as string) || 'all'

    $event.emit('HOTKEY_SCOPE_CHANGE', scope)
  }

  $event.on('HOTKEY_SCOPE_CHANGE', (scope: string) => {
    hotkeys.setScope(scope || 'all')
  })
})
</script>

<template>
  <!-- 包裹可能异步加载的内容，并定义加载时的备选UI。 -->
  <Suspense>
    <ClientOnly>
      <main :class="route.name" class="DefaultTemplate-Container">
        <el-aside>
          <div class="Navbar-Aside">
            <div class="LogoContainer">
              <ChoreLogo />
              <span>科塔智爱</span>
            </div>

            <IndexNavbar my-4 />
          </div>

          <div class="Navbar-Footer">
            <!-- <AnimateIcon>
              <IconSvgQuesSvg />
            </AnimateIcon>
            <AnimateIcon style="color: #D8A972">
              <IconSvgStartSvg />
            </AnimateIcon> -->

            <ShrinkAccountAvatar mt-4 />
          </div>
        </el-aside>
        <!-- <el-header class="Navbar-Header only-pe-display">
          hi
        </el-header> -->
        <el-main>
          <router-view v-slot="{ Component }">
            <component :is="Component" />
          </router-view>
        </el-main>
      </main>
    </ClientOnly>
    <template #fallback>
      <div italic op50>
        <span animate-pulse>Loading...</span>
      </div>
    </template>
  </Suspense>
</template>

<style lang="scss">
.slide-enter-active,
.slide-leave-active {
  position: absolute;

  width: 100%;

  transition: 0.75s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.slide-enter-active {
  z-index: 10;

  transition: 0.5s 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.slide-enter-from {
  position: absolute !important;

  opacity: 0;

  width: 100%;

  transform: translateY(-1%);
}

.slide-leave-to {
  position: absolute !important;

  opacity: 0;

  transform: translateY(1%);
}

.Navbar-Aside,
.Navbar-Footer {
  display: flex;
  flex-direction: column;

  gap: 1rem;
  align-items: center;

  .el-avatar {
    box-shadow: 0 0 12px 2px var(--plan-color);

    animation: shining_shadow 5s infinite linear;
  }
}

@keyframes shining_shadow {
  0%,
  100% {
    box-shadow: 0 0 4px 2px var(--plan-color);
  }

  50% {
    box-shadow: 0 0 16px 4px var(--plan-color);
  }
}

.LogoContainer {
  span {
    font-size: 12px;

    font-weight: 600;
    transform: scale(0.9);
  }

  position: relative;
  margin: 5px 0;
  display: flex;

  height: calc(55px + 1rem);

  flex-direction: column;

  border-bottom: 1px solid var(--el-border-color);
}

@keyframes q_shining {
  0%,
  100% {
    opacity: 0.5;
  }

  50% {
    opacity: 1;
  }
}

.DefaultTemplate-Container {
  & > .el-aside {
    &::before {
      z-index: -2;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      // opacity: 0.5;
      background-size: cover;
      filter: blur(18px) saturate(180%);
      background-image: var(--wallpaper);
    }

    &::after {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0.85;
      background-color: var(--el-bg-color);
    }

    .mobile & {
      display: none;
    }
    z-index: 2;
    position: relative;
    padding: 1rem 0.5rem;
    display: flex;

    align-items: center;
    flex-direction: column;
    justify-content: space-between;

    width: 64px;
    height: 100%;

    overflow: hidden;
    box-sizing: border-box;
    background-color: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color);
  }

  & > .el-main {
    .mobile & {
      padding: 0.5rem;
    }
    z-index: 1;
    position: relative;
    display: flex;

    flex: 1;

    width: 100%;
    height: 100%;

    align-items: center;
    flex-direction: column;
    justify-content: center;

    overflow: hidden;
  }

  .mobile & {
    flex-direction: column;
  }

  position: absolute;
  display: flex;

  width: 100%;
  height: 100%;

  background-color: var(--el-bg-color);
}
</style>
