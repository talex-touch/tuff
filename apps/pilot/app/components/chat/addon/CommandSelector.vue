<script setup lang="ts">
import { autoUpdate, flip, offset, useFloating } from '@floating-ui/vue'

const emits = defineEmits<{
  (e: 'translate'): void
  (e: 'headphones'): void
  (e: 'archive'): void
}>()

const expand = ref(false)
const hover = ref(false)
const hoverMode = debouncedRef(hover, 200)

const commands = reactive([
  {
    icon: 'i-carbon:translate',
    name: '一键切换',
    value: 'translate',
    desc: '将内容快速交叉翻译（中英互译）',
  },
  {
    icon: 'i-carbon:headphones',
    name: '朗读聆听',
    value: 'headphones',
    desc: '将内容快速转换为语音并播放',
    lock: () => false, // userStore.value?.subscription?.type === 'STANDARD' || userStore.value?.subscription?.type === 'ULTIMATE',
  },
  {
    icon: 'i-carbon:cd-archive',
    name: '模型比较',
    value: 'archive',
    desc: '将内容转换为不同模型的结果并进行审查',
    lock: () => false,
  },
])

const commandSelector = ref()
const commandFloating = ref()

const { floatingStyles } = useFloating(commandSelector, commandFloating, {
  placement: 'bottom',
  middleware: [offset(10), flip()],
  whileElementsMounted: autoUpdate,
})

async function handleCommand(cmd: any) {
  await sleep(400)

  const lockable = cmd.lock?.() ?? true
  if (!lockable)
    return

  emits(cmd.value as any)
}
</script>

<template>
  <span
    ref="commandSelector" :class="{ expand: expand || hoverMode }" class="ItemCommandSelector"
    @mouseenter="hoverMode = hover = true" @mouseleave="hover = false"
  >
    <i i-carbon:mac-command op-50 />
    <i style="font-size: 10px;opacity: 0.5" i-carbon:chevron-down />
  </span>

  <teleport to="#teleports">
    <div
      ref="commandFloating" :class="{ hover: hoverMode }" :style="floatingStyles"
      class="ItemCommandSelector-Floating"
    >
      <div class="ItemCommandSelector-Popover" @mouseenter="hoverMode = hover = true" @mouseleave="hover = false">
        <p mb-2 op-50>
          超级命令
        </p>
        <div class="command-selector-content">
          <div
            v-for="_command in commands" :key="_command.value" v-wave :class="{ lock: !(_command.lock?.() ?? true) }"
            class="command-popover-item" @click="handleCommand(_command)"
          >
            <div class="icon fake-background">
              <i :class="_command.icon" />
            </div>
            <div class="main">
              <p class="title">
                {{ _command.name }}
              </p>
              <p class="desc">
                {{ _command.desc }}
              </p>
            </div>

            <div class="lock">
              <div i-carbon:locked />
              <p mx-2 text-lg font-normal>
                当前订阅计划不可用.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style lang="scss">
.ItemCommandSelector-Popover {
  .command-selector-content {
    display: flex;
    flex-direction: column;

    gap: 0.5rem;
  }

  .command-popover-item {
    .lock {
      display: none;
    }

    &.lock .lock {
      position: absolute;
      display: flex;

      align-items: center;
      justify-content: center;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      font-size: 20px;
      font-weight: 600;

      opacity: 0;
      transition: 0.25s;
      background-color: var(--el-color-danger);
    }

    .icon {
      i {
        display: block;
      }

      // z-index: 1;
      position: relative;
      display: flex;

      align-items: center;
      justify-content: center;

      width: 32px;
      height: 32px;

      overflow: hidden;
      border-radius: 50%;
      --fake-opacity: 0;
      --fake-color: var(--theme-color);
      // background-color: var(--el-bg-color);
    }

    .main p.desc {
      opacity: 0.75;
      font-size: 12px;
    }

    position: relative;
    display: flex;
    padding: 0.75rem;

    width: 100%;
    height: 64px;

    gap: 0.5rem;
    align-items: center;

    cursor: pointer;
    overflow: hidden;
    border-radius: 8px;

    &:hover {
      .lock {
        opacity: 0.95;

        backdrop-filter: blur(18px);
      }

      .icon {
        --fake-opacity: 1;
      }

      &::after {
        opacity: 0.5;
      }
    }

    &::after {
      z-index: -1;
      content: '';
      position: absolute;

      top: 0;
      left: 0;

      width: 100%;
      height: 100%;

      opacity: 0;
      filter: blur(18px);
      background-color: var(--el-overlay-color);
    }
  }

  &::after {
    z-index: -1;
    content: '';
    position: absolute;

    top: 0;
    left: 0;

    width: 100%;
    height: 100%;

    opacity: 0.5;
    filter: blur(8px);
    background-color: var(--el-bg-color);
  }

  position: absolute;
  padding: 1rem;

  // left: 0;
  // top: 2rem;

  // width: 248px;
  // min-height: 248px;

  border-radius: 16px;
  box-shadow: var(--el-box-shadow);
  border: 1px solid var(--el-border-color);

  opacity: 0;
  transform: scale(0.9) translateY(10%);
  transition: cubic-bezier(0.175, 0.885, 0.32, 1.275) 0.35s;
  transform-origin: center 10%;

  backdrop-filter: blur(18px) saturate(180%);

  .hover & {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.ItemCommandSelector-Floating {
  &.hover {
    pointer-events: all;
  }

  z-index: 1;
  position: absolute;

  width: 300px;
  height: 280px;

  transition: 0.25s;

  pointer-events: none;
}

.ItemCommandSelector {
  &:hover,
  &.expand {
    .command-name {
      opacity: 0.5;
    }

    background-color: var(--el-bg-color-page);
  }

  .command-name {
    position: absolute;

    left: 50%;

    opacity: 0;
    transition: 0.25s;
    transform: translateX(-50%) translateX(2.5px);
  }

  .mobile & {
    display: none;
  }

  position: relative;
  display: flex;
  padding: 0.25rem;

  gap: 0.25rem;
  align-items: center;
  justify-content: space-between;

  width: 40px;

  cursor: pointer;
  border-radius: 8px;
  transition: 0.15s;
}
</style>
