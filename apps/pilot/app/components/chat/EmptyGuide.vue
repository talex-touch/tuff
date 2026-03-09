<script setup lang="ts">
import { cur, tips, tipsVisible } from './input-tips'

defineProps<{
  show: boolean
}>()

const curTip = computed(() => cur.value !== -1 ? tips[cur.value] : null)

function handleIndex(index: number) {
  cur.value = -1

  setTimeout(() => {
    cur.value = index
  })
}
</script>

<template>
  <div :class="{ show }" class="ScreenGuide transition-cubic">
    <h1 class="EmptyGuide-Brand" text-16 font-bold>
      This!&nbsp;<span class="ai-underline">AI</span>.
    </h1>

    <h1 v-if="!show" class="EmptyGuide-Greet only-pc-display">
      <OtherTextShading
        animation="animation: ease-out 1.25s erasing forwards"
        text="尽力为你做任何事."
      />
    </h1>

    <slot :tip="curTip" />

    <div v-if="!show" :style="tipsVisible ? 'opacity: 0' : ''" class="EmptyGuide-Tips only-pc-display">
      <span
        v-for="(tip, index) in tips"
        :key="index" v-wave class="TipItem fake-background" :style="`--d: ${index * 0.05 + 0.5}s;--c: ${tip.color}`"
        @click="handleIndex(index)"
      >
        <span class="icon" block :class="tip.icon" /><span v-text="tip.title" />
      </span>
    </div>
  </div>
</template>

<style lang="scss">
.EmptyGuide-Brand {
  display: none;
}

.mobile .EmptyGuide-Brand,
.show .EmptyGuide-Brand {
  display: unset;
}

.EmptyGuide-Tips {
  .show & {
    opacity: 0;

    transition: unset;
  }

  display: flex;

  gap: 0.5rem;

  .TipItem {
    padding: 0.5rem 0.75rem;
    display: flex;

    gap: 0.5rem;
    align-items: center;

    cursor: pointer;
    font-size: 14px;
    border-radius: 12px;
    color: var(--el-text-color-primary);
    border: 1px solid var(--el-border-color-lighter);
    animation: fade-join 0.25s var(--d) ease-in-out forwards;

    opacity: 0;
    transform: translateY(10px);

    .icon {
      color: var(--c);
    }

    .wallpaper & {
      overflow: hidden;
      --fake-opacity: 0.6;
      --fake-color: var(--el-bg-color);
      backdrop-filter: blur(18px) saturate(180%);
    }
  }

  justify-content: center;

  // transition: cubic-bezier(0.6, -0.28, 0.735, 0.045) 0.5s 0.75s;
  transform: translateY(calc(50%));
}

@keyframes fade-join {
  60% {
    opacity: 1;
    transform: translateY(-2px);
  }

  100% {
    opacity: 1;
    transform: translateY(0px);
  }
}

.EmptyGuide-Greet {
  z-index: 10;

  font-size: 2rem;
  font-weight: 600;

  transform: translateY(-1rem);
}

@keyframes transforming {
  from {
    transform: translate(0);
  }

  to {
    transform: translate(-50%);
  }
}

.ScreenGuide {
  &::before {
    z-index: -1;
    content: '';
    position: absolute;

    top: 50%;
    left: 50%;

    width: 20%;
    height: 10%;

    opacity: 0;
    filter: blur(50px);
    background-image: radial-gradient(
      circle at 50% 50%,
      var(--el-bg-color),
      transparent
    );
    transition: 0.35s;
    transform: translate(-50%, -50%);
  }

  .wallpaper &::before {
    opacity: 0.25;
  }

  &.show {
    &::before {
      opacity: 0;
    }

    h1 {
      opacity: 0.025;
      filter: grayscale(100%);
    }

    top: 50%;

    pointer-events: none;
    transform: translateY(-50%);
  }

  .mobile & {
    top: 0;

    transform: translateY(0);
  }

  h1 {
    .ai-underline {
      &::before {
        content: '';
        position: absolute;

        bottom: 8px;

        width: 100%;
        height: 5px;

        border-radius: 16px;
        background-color: var(--theme-color);
      }
      position: relative;

      top: -5px;
      font-size: 3.75rem;
    }

    .mobile & {
      .ai-underline {
        &::before {
          height: 3px;
          bottom: 5px;
        }

        top: 0;

        font-size: 40px;
      }
      position: relative;

      // bottom: 50%;

      font-size: 40px;

      // transform: translateY(100%);
    }

    transition: 0.25s;
  }
  z-index: 3;
  position: absolute;
  display: flex;
  padding: 0.5rem;

  align-items: center;
  flex-direction: column;
  justify-content: center;

  top: 50%;
  left: 0;

  width: 100%;
  height: 100%;

  transform: translateY(-50%);
}
</style>
