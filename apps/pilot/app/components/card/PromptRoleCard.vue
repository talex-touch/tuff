<script name="PromptRoleCard" setup lang="ts">
import type { IPromptRole } from '~/composables/api/base/v1/aigc/index.type'

const props = defineProps<{
  modelValue: IPromptRole
  animation: boolean
}>()

const src = computed(() => formatEndsImage(props.modelValue.avatar))

const _keywordsTags = computed(() => [...(props.modelValue.keywords || '').split(',')].filter(i => i))
const keywordsTags = computed(() => !_keywordsTags.value.length ? ['角色'] : _keywordsTags.value)

const expand = ref(false)
const el = ref(null)
const dialog = ref<HTMLElement>()
const { x, y, top, right, bottom, left, width, height }
  = useElementBounding(el)

async function triggerExpand() {
  if (expand.value) {
    await shrinkDialog()

    expand.value = false

    return
  }
  expand.value = true

  await expandDialog()
}

function resetDialog() {
  const dom = dialog.value
  if (!dom)
    return

  Object.assign(dom.style, {
    'top': `${top.value}px`,
    'left': `${left.value}px`,
    'width': `${width.value}px`,
    'height': `${height.value}px`,
    'opacity': 0,
    'pointer-events': 'none',
    'transform': 'translate(0, 0) scale(0)',
  })
}

function fixDialog() {
  const dom = dialog.value
  if (!dom)
    return

  Object.assign(dom.style, {
    top: `${top.value}px`,
    left: `${left.value}px`,
    width: `${width.value}px`,
    height: `${height.value}px`,
  })
}

async function shrinkDialog() {
  const dom = dialog.value
  if (!dom)
    return

  fixDialog()

  Object.assign(dom.style, {
    'pointer-events': 'none',
    'transform': 'translate(0, 0) scale(1)',
  })

  await sleep(300)

  dom.style.opacity = '0'

  await sleep(100)

  resetDialog()
}

async function expandDialog() {
  const dom = dialog.value
  if (!dom)
    return

  fixDialog()

  Object.assign(dom.style, {
    'pointer-events': 'auto',
    'transform': 'translate(0, 0) scale(1)',
  })

  await sleep(200)

  dom.style.opacity = '1'

  await sleep(300)

  Object.assign(dom.style, {
    'top': `50%`,
    'left': `50%`,
    'width': '',
    'height': '',
    'opacity': 1,
    'pointer-events': 'auto',
    'transform': 'translate(-50%, -50%) scale(1)',
    // 'transform-origin': `${meta.x}px ${meta.y}px`,
  })
}

nextTick(() => {
  fixDialog()
})
</script>

<template>
  <div ref="el" v-wave :class="{ expand, animation }" class="PromptRoleCard" @click="triggerExpand">
    <div class="PromptroleCard-Header">
      <div class="PromptRoleCard-Header-Main">
        <p class="title">
          {{ modelValue.title }}
        </p>
        <p class="subtitle">
          0 人正在使用
        </p>
      </div>
      <img :src="src" :alt="modelValue.title">
    </div>

    <div class="PromptRoleCard-Main">
      <p>{{ modelValue.description || '-' }}</p>
    </div>

    <div flex items-center justify-between gap-2 class="PromptRoleCard-Footer">
      <div>
        <span flex cursor-pointer items-center gap-1 class="func">
          <i i-carbon:favorite block />
          {{ modelValue.description.length * 12 }}
        </span>
      </div>

      <div class="PromptRoleCard-Keywords">
        <span v-for="(i, ind) in keywordsTags.slice(0, 3)" :key="ind">{{ i }}</span>
      </div>
    </div>
  </div>

  <teleport to="#teleports">
    <div class="PromptRoleCard-DialogWrapper" :class="{ expand }" @click="triggerExpand">
      <div ref="dialog" class="PromptRoleCard-Dialog transition-cubic" @click.stop="">
        <el-scrollbar>
          <div class="PromptRoleCard-DialogMain">
            <img :src="src" :alt="modelValue.title">
            <p class="title">
              {{ modelValue.title }}
            </p>

            <p class="author">
              @科塔智爱官方出品
            </p>

            <p class="description">
              {{ modelValue.description || '-' }}
            </p>

            <div class="PromptRoleCard-Line">
              <div class="PromptRoleCard-Line-Item">
                <div>
                  <div i-carbon:star-filled />5.0
                </div>
                <p>评分(0+)</p>
              </div>
              <div class="PromptRoleCard-Line-Item">
                <div>
                  {{ keywordsTags.slice(0, 1)?.[0] || 'Unknown' }}
                </div>
                <p>类别</p>
              </div>
              <div class="PromptRoleCard-Line-Item">
                <div>
                  0
                </div>
                <p>使用</p>
              </div>
            </div>

            <div class="PromptRoleCard-Rate">
              <p class="title">
                评级
              </p>
              <el-empty description="还没有任何评级." />
            </div>

            <div class="keywords">
              <span v-for="(i, ind) in keywordsTags.slice(0, 5)" :key="ind">#{{ i }}</span>
            </div>
          </div>
        </el-scrollbar>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss" scoped>
.PromptRoleCard-Rate {
  .title {
    text-align: center;
  }
  margin: 1rem 0 -1rem;

  width: 80%;
}

.PromptRoleCard-Line {
  &-Item {
    padding: 0 3rem;

    display: flex;
    flex-direction: column;

    div {
      display: flex;

      gap: 0.5rem;
      align-items: center;
      justify-content: center;

      font-size: 20px;
      font-weight: 600;

      text-overflow: ellipsis;
      overflow: hidden;
      white-space: nowrap;
    }

    p {
      margin: 0.5rem 0;

      text-align: center;

      color: var(--el-text-color-secondary);
    }

    border-right: 1px solid var(--el-border-color);

    &:last-child {
      border-right: none;
    }
  }
  margin: 1.5rem 0;

  display: flex;

  justify-content: center;
}

.PromptRoleCard-DialogMain {
  .keywords {
    display: flex;
    margin: 2rem 0 0;

    gap: 0.5rem;
    flex-wrap: wrap;
    color: var(--el-text-color-placeholder);
  }

  img {
    width: 72px;
    height: 72px;

    border-radius: 50%;
    border: 1px solid var(--el-border-color);
  }

  p.title {
    margin: 1rem 0;

    font-size: 24px;
    line-height: 24px;
    font-weight: 600;
  }

  p.author {
    opacity: 0.5;

    font-size: 18px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
  }

  p.description {
    margin: 1rem 0;

    max-width: 75%;

    font-size: 18px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
  }
  position: relative;
  display: flex;

  height: 20%;

  flex-direction: column;
  align-items: center;
}

.PromptRoleCard.animation {
  > div p.title {
    opacity: 0;
    animation: flowJoin 0.25s calc(0.25s + var(--d, 0s)) ease-in-out forwards;
  }

  > div p.subtitle {
    opacity: 0;
    animation: flowJoin 0.25s calc(0.35s + var(--d, 0s)) ease-in-out forwards;
  }

  > div.PromptroleCard-Header img {
    opacity: 0;
    animation: flowJoin 0.25s calc(0.3s + var(--d, 0s)) ease-in-out forwards;
  }

  > div.PromptRoleCard-Main {
    opacity: 0;
    animation: flowJoin 0.25s calc(0.45s + var(--d, 0s)) ease-in-out forwards;
  }

  > div.PromptRoleCard-Footer {
    opacity: 0;
    animation: flowJoin 0.25s calc(0.55s + var(--d, 0s)) ease-in-out forwards;
  }
}

@keyframes flowJoin {
  0% {
    opacity: 0;
    visibility: visible;
    transform: translateY(10px);
  }

  99% {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }

  100% {
    opacity: unset;
  }
}

.PromptRoleCard-DialogWrapper {
  &.expand {
    opacity: 1;
    pointer-events: all;
    backdrop-filter: blur(18px) saturate(180%);
  }

  z-index: 3;
  position: absolute;

  width: 100%;
  height: 100%;

  top: 0;
  left: 0;

  opacity: 0;
  pointer-events: none;
  transition: 0.25s 0.5s opacity;
  background-color: var(--el-mask-color-extra-light);
}

.PromptRoleCard-Dialog {
  .expand & {
    border: 1px solid transparent;

    box-shadow: var(--el-box-shadow);
  }

  .el-scrollbar {
    width: 100%;
  }

  position: absolute;
  display: flex;

  width: 520px;
  max-width: 85%;
  height: 60vh;

  align-items: center;
  flex-direction: column;
  justify-content: space-between;

  opacity: 0;
  overflow: hidden;
  border-radius: 18px;
  border: 1px solid var(--el-border-color);
  background-color: var(--el-fill-color-lighter);

  pointer-events: none;
}

.PromptRoleCard-Footer {
  .PromptRoleCard-Keywords {
    display: flex;

    gap: 0.25rem;

    span {
      padding: 0.25rem 0.5rem;

      font-size: 12px;
      border-radius: 10px;
      background-color: var(--el-fill-color);
    }
  }

  position: absolute;

  width: calc(100% - 1.5rem);
  bottom: 0.5rem;

  color: var(--el-text-color-regular);
}

.PromptRoleCard-Main {
  margin: 1rem 0 2rem;

  max-height: 2.5em;

  overflow: hidden;

  p {
    font-size: 14px;
    line-height: 20px;
    color: var(--el-text-color-secondary);

    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
  }
}

.PromptroleCard-Header {
  .title {
    font-size: 16px;
    line-height: 24px;
    font-weight: 600;
  }

  .subtitle {
    opacity: 0.75;
    font-size: 14px;
    line-height: 20px;
    color: var(--el-text-color-secondary);
  }

  display: flex;

  width: 100%;

  align-items: center;
  justify-content: space-between;
}

.PromptRoleCard {
  &:hover {
    transform: scale(1.05);

    box-shadow: var(--el-box-shadow-light);
    border: 1px solid var(--theme-color);
  }

  &.expand {
    // 3d旋转
    transform: rotateY(180deg);

    opacity: 0;
    // pointer-events: none;
    // backface-visibility: hidden;
  }

  img {
    width: 48px;
    height: 48px;

    border-radius: 50%;
    border: 1px solid var(--el-border-color);
  }

  position: relative;
  padding: 0.75rem;

  width: 100%;
  height: 100%;

  cursor: pointer;

  border-radius: 18px;
  // pointer-events: all;
  background-color: var(--el-fill-color-lighter);
  border: 1px solid var(--el-border-color);

  perspective: 10px;
  transition:
    transform 0.25s,
    opacity 0.25s 0.125s;
  transform-style: preserve-3d;
}
</style>
