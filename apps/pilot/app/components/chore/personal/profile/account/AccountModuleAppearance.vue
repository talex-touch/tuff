<script setup lang="ts">
import { currentWallpaper, setWallpaper, theme, viewTransition, wallpapers } from '~/composables/theme/colors'

async function toggleTheme(event: MouseEvent, theme: 'auto' | 'light' | 'dark') {
  viewTransition(event, theme)
}

const loading = ref('')
async function trySetWallpaper(paper: any, event: Event) {
  if (loading.value)
    return

  if (theme.value === paper.id)
    return

  if (!paper.free && !userStore.value.subscription?.type) {
    ElMessage({
      message: `很抱歉，此墙纸只供订阅用户使用！`,
      grouping: true,
      type: 'error',
      plain: true,
    })
    return
  }

  loading.value = paper.id

  await sleep(600)

  // TODO: sync personal data to cloud

  await setWallpaper(paper, event as any)

  loading.value = ''
}

const figurations = reactive({
  animation: {
    value: false,
    click: () => {
      figurations.animation.value = false

      ElMessage.error({
        message: '您的系统暂不支持该功能！',
        grouping: true,
        type: 'error',
        plain: true,
      })
    },
  },
  immersive: {
    value: userConfig.value.pri_info.appearance.immersive,
    click: () => {
      userConfig.value.pri_info.appearance.immersive = !userConfig.value.pri_info.appearance.immersive

      saveUserConfig()

      ElMessage({
        message: '修改成功！',
        grouping: true,
        type: 'success',
        plain: true,
      })
    },
  },
})

const options = reactive({
  loading: false,
  visible: false,
})
</script>

<template>
  <div class="Appearance-MainWrapper">
    <p v-if="false">
      选择你喜欢的主题颜色
    </p>
    <!-- <div v-if="false" class="Appearance-Theme">
            <div
              v-for="(color, index) in themeColors" :key="color" :class="{ active: themeOptions.color === index }"
              class="theme-color" :style="`--c: ${color}`" @click="themeOptions.color = index"
            />
          </div> -->

    <div class="Appearance-Base">
      <TemplateLineForm title="沉浸模式" desc="当启用对话时自动打开沉浸模式，更专注">
        <el-switch v-model="figurations.immersive.value" @click="figurations.immersive.click" />
      </TemplateLineForm>
      <TemplateLineForm title="光晕动画" desc="光晕动画让界面更流畅，但是会增加耗电量">
        <el-switch v-model="figurations.animation.value" @click="figurations.animation.click" />
      </TemplateLineForm>
      <TemplateLineForm title="混色渲染" desc="混色渲染使用复杂的叠加技术，让界面更美观">
        <el-switch v-model="figurations.animation.value" @click="figurations.animation.click" />
      </TemplateLineForm>
      <TemplateLineForm v-if="false" title="高斯模糊" desc="让部分界面叠加模糊拟态效果">
        <el-switch v-model="figurations.animation.value" @click="figurations.animation.click" />
      </TemplateLineForm>
      <TemplateLineForm v-if="false" title="主要着色" desc="在某些组件上增加强调色效果">
        <el-switch v-model="figurations.animation.value" @click="figurations.animation.click" />
      </TemplateLineForm>
      <TemplateLineForm title="界面墙纸" desc="属于你的专属自定义墙纸，让界面再次焕发活力">
        <div
          flex cursor-pointer items-center gap-1 text-sm op-50 hover:underline hover:op-75 class="wallpaper-end"
          @click="options.visible = true"
        >
          <p>
            <span v-if="theme">{{ currentWallpaper?.label }}</span>
            <span v-else>暂未配置</span>
          </p>
          <div i-carbon-settings />
        </div>
      </TemplateLineForm>
    </div>

    <div class="Appearance-Display">
      <p>选择UI主题界面</p>
      <p class="subtitle" op-50>
        设置你的自定义主题
      </p>

      <div my-4 class="Appearance-Display-Theme">
        <ThemeBlock :active="userConfig.pri_info.appearance.color === 'auto'" theme="system" @click="toggleTheme($event, 'auto')" />
        <ThemeBlock :active="userConfig.pri_info.appearance.color === 'light'" theme="light" @click="toggleTheme($event, 'light')" />
        <ThemeBlock :active="userConfig.pri_info.appearance.color === 'dark'" theme="dark" @click="toggleTheme($event, 'dark')" />
      </div>
    </div>
  </div>

  <DialogTouchDialog v-model="options.visible" header :loading="options.loading">
    <template #Title>
      <div w-full flex justify-between class="Appearance-WallpaperHeader">
        <div flex items-center gap-2>
          <div i-carbon:image />界面墙纸
        </div>

        <div v-if="theme" flex class="wallpaper-end">
          当前选择：{{ currentWallpaper?.label }}
          <el-button type="danger" @click="setWallpaper(null, $event)">
            重置
          </el-button>
        </div>
      </div>
    </template>
    <div class="Appearance-Wallpaper">
      <el-scrollbar>
        <div class="Appearance-Wallpaper-Inner">
          <div
            v-for="wallpaper in wallpapers" :key="wallpaper.label" v-loader="loading === wallpaper.id"
            :style="`--t: ${wallpaper.color}`" :class="{ lock: !wallpaper?.free, active: wallpaper.id === theme }"
            class="Wallpaper-Item" @click="trySetWallpaper(wallpaper, $event)"
          >
            <el-image :key="wallpaper.label" :src="wallpaper.wallpaper" lazy class="Wallpaper-Item-Img" />
            <!-- <img :alt="wallpaper.label" :src="wallpaper.wallpaper" class="Wallpaper-Item-Img"> -->
            <span>{{ wallpaper.label }}
            </span>
          </div>
        </div>
      </el-scrollbar>
    </div>
  </DialogTouchDialog>
</template>

<style lang="scss" scoped>
.Appearance-WallpaperHeader {
  .wallpaper-end {
    // flex-direction: column;

    gap: 0.5rem;
    align-items: center;

    font-size: 16px;
  }
}

.Wallpaper-Item {
  &::before {
    z-index: 1;
    content: '订阅用户专享';
    position: absolute;
    display: flex;

    justify-content: center;
    align-items: center;

    width: 100%;
    height: 100%;

    top: 4px;
    right: 4px;

    height: 20px;
    width: 100px;

    opacity: 0;
    color: #000;
    font-size: 14px;
    line-height: 24px;
    border-radius: 0 8px 0 8px;
    box-shadow: -2px 2px 1px 1px var(--el-color-warning);
    background-color: var(--el-color-warning);
  }
  &.lock::before {
    opacity: 1;
  }

  .Wallpaper-Item-Img {
    // 用来防止浏览器大图插件显示图片影响点击
    &::before {
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;
    }
    width: 100%;
    height: 100%;

    border-radius: 8px;
  }

  span {
    position: absolute;
    display: flex;
    padding: 0.25rem 0.5rem;

    align-items: flex-end;

    width: calc(100% - 8px);

    left: 4px;
    bottom: 4px;

    height: 48px;

    color: #fff;
    border-radius: 0 0 8px 8px;
    background: linear-gradient(to top, var(--t, #000), #0000);
  }

  &.active {
    border-radius: 12px;

    border: 1px solid var(--t, var(--el-color-primary));
  }

  position: relative;
  padding: 4px;

  width: 320px;
  height: 180px;

  cursor: pointer;
}

.Appearance-Wallpaper {
  &-Inner {
    padding: 0 1rem;
    display: flex;

    flex-wrap: wrap;

    justify-content: space-between;
  }

  .mobile & :deep(.ThemeBlock) {
    width: 45%;
  }
  margin: 0.5rem auto;

  flex-wrap: wrap;

  width: min(1020px, 85vw);

  height: min(520px, 65vh);

  overflow: hidden;
}

.Appearance-Display {
  &-Theme {
    display: flex;

    gap: 0.5rem;

    flex-wrap: wrap;
    max-width: 100%;

    justify-content: center;
  }

  margin: 1rem 0;
}

.Appearance-Theme {
  div.theme-color {
    &.active {
      &::before {
        width: 10px;

        opacity: 1;
        transition: 0.25s;
      }

      &::after {
        width: 15px;

        opacity: 1;
        transition: 0.25s 0.125s;
      }
    }

    &::before,
    &::after {
      content: '';
      position: absolute;

      top: 10px;
      left: 10px;

      width: 0;
      height: 3px;

      border-radius: 8px;
      background-color: #fff;

      opacity: 0;
      // transition: 0.25s;
    }

    &::before {
      top: 18px;
      left: 6px;

      // width: 10px;
      height: 3px;

      transform: rotate(45deg);
      transition: 0.25s 0.125s;
    }

    &::after {
      top: 15.5px;
      left: 10.5px;

      // width: 15px;
      height: 3px;

      transform: rotate(-50deg);
      transition: 0.25s;
    }

    position: relative;

    width: 32px;
    height: 32px;

    cursor: pointer;
    border-radius: 50%;
    background-color: var(--c);
  }

  padding: 0.5rem 0;
  display: flex;

  gap: 0.5rem;
  height: 48px;
}
</style>
