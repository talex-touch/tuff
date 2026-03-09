<script setup lang="ts">
import { getAccountMenuList } from '~/composables/api/account'

const props = defineProps<{
  expand: boolean
}>()

const emits = defineEmits<{
  (e: 'update:expand'): void
  (e: 'redirect'): void
}>()

const { expand } = useVModels(props, emits)

onMounted(() => {
  nextTick(() => {
    // 判断如果是移动端，那么从左向右滑动就要打开
    if (document.body.classList.contains('mobile'))
      mobileSlideProcess()
  })
})

const dom = ref()
const menus = ref()
onMounted(async () => {
  const res = await getAccountMenuList()

  // 将menu的每一项都排序 (orderNo)
  function _sort(arr: any[]) {
    return arr.sort((a, b) => b.orderNo - a.orderNo)
  }

  menus.value = _sort(res.data).map((item: any) => {
    if (item.children)
      _sort(item.children)

    return item
  })
})

async function mobileSlideProcess() {
  expand.value = false

  const el = dom.value

  let down = false
  let startX = 0

  document.addEventListener('touchstart', (e) => {
    const touch = e.touches[0]
    const { clientX, clientY } = touch
    const { left, top } = el.getBoundingClientRect()

    const screenWidth = window.innerWidth
    const percent = screenWidth * 0.3

    if (clientX < left + percent && clientY > top + 20) {
      startX = clientX

      down = true
    }
    else if (expand.value) {
      if (clientX > left + 20 && clientY > top + 20) {
        startX = clientX

        down = true
      }
    }
  })

  document.addEventListener('touchend', (e: TouchEvent) => {
    if (!down)
      return

    const diff = startX - e.changedTouches[0].clientX

    if (Math.abs(diff) >= window.innerWidth * 0.1)
      expand.value = diff < 0

    down = false
  })
}

// const dispose = ref(false)
// onDeactivated(() => dispose.value = true)
// onActivated(() => dispose.value = false)
// onBeforeUnmount(() => dispose.value = true)

function filterSubMenus(menu: any) {
  return [...menu].filter(item => item.meta?.show)
}
</script>

<template>
  <div ref="dom" class="CmsSide">
    <!-- <teleport :disabled="dispose" to="body"> -->

    <!-- </teleport> -->

    <div class="CmsSide-Title">
      <div class="CmsSide-Title-Head" @click="emits('redirect')">
        <ButtonWavingButton v-wave flex items-center justify-between gap-2>
          <img src="/logo.png">
          <span>转到参考文档</span>
          <div i-carbon-share mr-2 />
        </ButtonWavingButton>
      </div>
    </div>

    <div class="CmsSide-Wrapper">
      <el-scrollbar>
        <div class="CmsSide-Content">
          <template v-for="item in menus" :key="item.id">
            <CmsMenu v-if="item.children?.length" :expandable="item.children?.length">
              <template #header>
                <div :class="item.meta.icon" />
                <span>{{ item.name }}</span>
              </template>
              <CmsMenuItem
                v-for="subMenu in filterSubMenus(item.children)" :key="subMenu.id"
                :path="`/cms${subMenu.path}`"
              >
                <div flex items-center gap-2>
                  <div :class="subMenu.meta.icon" />{{ subMenu.name }}
                </div>
              </CmsMenuItem>
            </CmsMenu>
            <CmsMenuItem v-else :key="item.id" :path="`/cms${item.path}`">
              <div flex items-center gap-2>
                <div :class="item.meta.icon" />{{ item.name }}
              </div>
            </CmsMenuItem>
          </template>
        </div>
      </el-scrollbar>
    </div>
  </div>

  <div :class="{ expand }" class="CmsSide-Indicator" @click="expand = !expand" />
</template>

<style lang="scss">
div.CmsSide {
  .el-scrollbar__bar.is-vertical {
    width: 3px;
  }
}

.CmsSide-Title-Head {
  &::before {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.125;
    overflow: hidden;
    border-radius: 16px;
    background-size: cover;
    background-position: 64px 0;
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

    opacity: 0.75;
    border-radius: 16px;
    background-color: var(--el-bg-color);
  }
  position: relative;

  width: 100%;

  // overflow: hidden;
  // border-radius: 16px;

  img {
    width: 32px;
    height: 32px;
  }
}

.CmsSide-Wrapper {
  &::before {
    z-index: 2;
    content: '';
    position: absolute;

    left: 0;
    bottom: 0px;

    width: 100%;
    height: 20px;

    opacity: 0.25;
    background: linear-gradient(
      to top,
      var(--wallpaper-color-lighter, var(--el-bg-color-page)) 0%,
      #0000 100%
    );
  }

  z-index: 2;
  position: relative;

  width: 100%;
  height: calc(100% - var(--CmsSide-title-height) + 70px);

  box-sizing: border-box;
}

.CmsSide-Indicator {
  &:hover {
    opacity: 1;

    cursor: pointer;
    transform: translateX(2px) translateY(-50%) translateY(-33px);

    &::before {
      width: 5px;
      height: 16px;
      transform: translate(-50%, -50%) translateY(5px) rotate(30deg);
    }

    &::after {
      width: 5px;
      height: 16px;
      transform: translate(-50%, -50%) translateY(-5px) rotate(-30deg);
    }
  }

  &.expand {
    left: 254px;

    &:hover {
      &::before {
        width: 5px;
        height: 16px;
        transform: translate(-50%, -50%) translateY(5px) rotate(-30deg);
      }

      &::after {
        width: 5px;
        height: 16px;
        transform: translate(-50%, -50%) translateY(-5px) rotate(30deg);
      }
    }
  }

  &::before,
  &::after {
    content: '';
    position: absolute;

    top: 50%;
    left: 50%;

    width: 8px;
    height: 32px;

    border-radius: 4px;
    // box-shadow: var(--el-box-shadow);
    background-color: var(--el-text-color-primary);
    transform: translate(-50%, -50%);
    transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);
  }

  &::before {
    transform: translate(-50%, -50%) translateY(10px) rotate(0);
  }

  &::after {
    transform: translate(-50%, -50%) translateY(-10px) rotate(0);
  }

  // .wallpaper &,
  // .dark & {
  //   mix-blend-mode: unset;
  // }

  z-index: 2;
  position: absolute;

  top: 50%;
  left: 14px;

  width: 8px;
  height: 50px;

  opacity: 0;
  // mix-blend-mode: difference;
  cursor: pointer;
  filter: drop-shadow(0 0 8px var(--el-mask-color-extra-light));
  transform: translateX(0px) translateY(-50%) translateY(-33px);
  transition: 0.5s cubic-bezier(0.785, 0.135, 0.15, 0.86);

  animation: indicator_form 0.25s 1s forwards;
}

@keyframes indicator_form {
  from {
    opacity: 0;
  }

  to {
    opacity: 0.85;
  }
}

.CmsSide-Content {
  position: relative;
  display: flex;
  // padding-left: 0.5rem;
  // padding-right: 0.5rem;
  padding-top: calc(var(--CmsSide-title-height) + 30px);
  padding-bottom: 2rem;
  flex-direction: column;

  gap: 0.5rem;
}

.CmsSide {
  --CmsSide-title-height: 50px;

  &-Title {
    z-index: 3;
    position: absolute;
    display: flex;
    padding: 1rem 1rem;
    font-size: 24px;

    width: 100%;
    height: var(--CmsSide-title-height);

    gap: 1rem;
    font-weight: 600;
    text-align: center;
    align-items: center;
    flex-direction: column;
    justify-content: space-between;

    .wallpaper & {
      background-image: none;

      background-color: #0000;
      backdrop-filter: blur(4px);
    }

    .searchable & {
      background-color: var(--el-bg-color-page);
    }

    // background-color: var(--el-bg-color-page);
    background-size: 4px 4px;
    background-image: radial-gradient(
      transparent 1px,
      var(--wallpaper-color-light, var(--el-bg-color-page)) 1px
    );
    backdrop-filter: saturate(50%) blur(4px);
  }

  .expand & {
    margin-left: 0;

    width: 260px;

    opacity: 1;
    pointer-events: all;
    transform: translateX(0);

    transition:
      0.5s width cubic-bezier(0.785, 0.135, 0.15, 0.86),
      0.75s opacity cubic-bezier(0.785, 0.135, 0.15, 0.86),
      0.75s transform cubic-bezier(0.785, 0.135, 0.15, 0.86);
  }

  z-index: 10;
  position: relative;
  margin-left: -1px;

  width: 0;

  // flex: 1;
  height: 100%;
  min-height: 100%;

  opacity: 0;
  pointer-events: none;
  transform: translateX(-100%);
  background-color: var(--el-bg-color-page);

  // overflow: hidden;
  transition:
    0.75s width cubic-bezier(0.785, 0.135, 0.15, 0.86),
    0.5s opacity cubic-bezier(0.785, 0.135, 0.15, 0.86),
    0.25s transform cubic-bezier(0.785, 0.135, 0.15, 0.86);
}

.mobile .CmsSide {
  position: absolute;

  padding-top: 1rem;
}
</style>
