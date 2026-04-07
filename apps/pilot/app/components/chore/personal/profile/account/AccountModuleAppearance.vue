<script setup lang="ts">
import { currentWallpaper, setWallpaper, theme, viewTransition, wallpapers } from '~/composables/theme/colors'
import { usePilotMemorySettings } from '~/composables/usePilotMemorySettings'

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

const {
  memoryEnabled,
  memoryFacts,
  memoryFactsLoading,
  memoryLoading,
  memorySubmitting,
  memoryToggleDisabled,
  memoryToggleDisabledTip,
  loadMemoryFacts,
  loadMemorySettings,
  setMemoryEnabled,
} = usePilotMemorySettings()

const memoryDesc = computed(() => (
  memoryToggleDisabled.value
    ? memoryToggleDisabledTip.value
    : '关闭后会自动清空已存储记忆。'
))

const memorySwitchLoading = computed(() => memoryLoading.value || memorySubmitting.value)

async function handleMemorySwitchChange(nextValue: string | number | boolean) {
  const enabled = Boolean(nextValue)
  await setMemoryEnabled(enabled, {
    purgeOnDisable: !enabled,
  })
}

onMounted(() => {
  void loadMemorySettings()
  void loadMemoryFacts()
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
      <TemplateLineForm title="记忆系统" :desc="memoryDesc">
        <el-switch
          :model-value="memoryEnabled"
          :loading="memorySwitchLoading"
          :disabled="memoryToggleDisabled"
          @change="handleMemorySwitchChange"
        />
      </TemplateLineForm>
      <div class="MemoryFactsPanel">
        <div class="MemoryFactsPanel-Header">
          <div>
            <p class="title">
              记忆详情
            </p>
            <p class="subtitle">
              展示当前账号已沉淀的用户记忆内容和添加时间
            </p>
          </div>
          <span class="count">{{ memoryFacts.length }} 条</span>
        </div>
        <div v-if="memoryFactsLoading" class="MemoryFactsPanel-Empty">
          正在加载记忆详情...
        </div>
        <div v-else-if="memoryFacts.length <= 0" class="MemoryFactsPanel-Empty">
          暂未沉淀记忆
        </div>
        <el-scrollbar v-else max-height="280px">
          <div class="MemoryFactsPanel-List">
            <article
              v-for="fact in memoryFacts"
              :key="`${fact.key}-${fact.createdAt}-${fact.value}`"
              class="MemoryFactItem"
            >
              <p class="value">
                {{ fact.value }}
              </p>
              <p class="meta">
                添加时间：{{ formatDate(fact.createdAt) }}
              </p>
            </article>
          </div>
        </el-scrollbar>
      </div>
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

.MemoryFactsPanel {
  margin: 0.5rem 0 1rem;
  padding: 0.75rem;

  border: 1px solid var(--el-border-color);
  border-radius: 12px;
  background: var(--el-fill-color-blank);

  &-Header {
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    align-items: flex-start;

    .title {
      font-size: 15px;
      font-weight: 600;
    }

    .subtitle {
      margin-top: 0.25rem;

      color: var(--el-text-color-secondary);
      font-size: 13px;
      line-height: 1.5;
    }

    .count {
      padding: 0.25rem 0.5rem;

      color: var(--el-text-color-secondary);
      font-size: 12px;
      border-radius: 999px;
      background: var(--el-fill-color-light);
      white-space: nowrap;
    }
  }

  &-Empty {
    padding: 1rem 0.25rem 0.25rem;

    color: var(--el-text-color-secondary);
    font-size: 13px;
  }

  &-List {
    margin-top: 0.75rem;
    display: flex;
    gap: 0.75rem;
    flex-direction: column;
  }
}

.MemoryFactItem {
  padding: 0.75rem;

  border-radius: 10px;
  background: var(--el-fill-color-light);

  .value {
    color: var(--el-text-color-primary);
    font-size: 14px;
    line-height: 1.6;
  }

  .meta {
    margin-top: 0.375rem;

    color: var(--el-text-color-secondary);
    font-size: 12px;
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
