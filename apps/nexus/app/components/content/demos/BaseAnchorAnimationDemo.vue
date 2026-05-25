<script setup lang="ts">
import { computed, ref } from 'vue'

type AnchorAnimationType = 'transfer' | 'boom' | 'opacity' | 'none'

const { locale } = useI18n()
const open = ref<Record<AnchorAnimationType, boolean>>({
  transfer: false,
  boom: false,
  opacity: false,
  none: false,
})

const labels = computed(() => {
  if (locale.value.startsWith('zh')) {
    return {
      title: '锚点定位动画',
      desc: '同一个 animation 对象切换不同类型，保留 placement、箭头、碰撞处理等定位能力。',
      modes: {
        transfer: '位移动画',
        boom: '聚焦缩放',
        opacity: '透明度',
        none: '无动画',
      },
      content: {
        transfer: '当前位移动画：沿 placement 方向揭示与回收。',
        boom: '聚焦缩放：带模糊、缩放和透明度变化。',
        opacity: '透明度：只做淡入淡出。',
        none: '无动画：立即显示与隐藏。',
      },
    }
  }

  return {
    title: 'Anchor positioning animations',
    desc: 'Switch animation types through one animation object while keeping placement, arrow, and collision handling.',
    modes: {
      transfer: 'transfer',
      boom: 'focus scale',
      opacity: 'opacity',
      none: 'none',
    },
    content: {
      transfer: 'Transfer keeps the current directional reveal and return motion.',
      boom: 'Focus scale combines blur, scale, and opacity changes.',
      opacity: 'Opacity only fades the panel in and out.',
      none: 'None shows and hides immediately.',
    },
  }
})

const modes: AnchorAnimationType[] = ['transfer', 'boom', 'opacity', 'none']

function resolveAnimation(type: AnchorAnimationType) {
  return {
    type,
    duration: type === 'none' ? 0 : 420,
    ease: type === 'transfer' ? 'back.out(2)' : 'power2.out',
    closeEase: type === 'transfer' ? 'power3.in' : 'power2.in',
    scale: type === 'boom' ? 1.08 : undefined,
    blur: type === 'boom' ? 14 : undefined,
  }
}
</script>

<template>
  <div class="base-anchor-animation-demo">
    <div class="base-anchor-animation-demo__header">
      <strong>{{ labels.title }}</strong>
      <span>{{ labels.desc }}</span>
    </div>

    <div class="base-anchor-animation-demo__grid">
      <TxBaseAnchor
        v-for="mode in modes"
        :key="mode"
        v-model="open[mode]"
        placement="bottom"
        :show-arrow="true"
        :animation="resolveAnimation(mode)"
      >
        <template #reference>
          <TxButton :variant="open[mode] ? 'primary' : 'secondary'">
            {{ labels.modes[mode] }}
          </TxButton>
        </template>

        <div class="base-anchor-animation-demo__panel">
          {{ labels.content[mode] }}
        </div>
      </TxBaseAnchor>
    </div>
  </div>
</template>

<style scoped>
.base-anchor-animation-demo {
  display: grid;
  gap: 14px;
}

.base-anchor-animation-demo__header {
  display: grid;
  gap: 4px;
}

.base-anchor-animation-demo__header > strong {
  font-size: 14px;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 92%, transparent);
}

.base-anchor-animation-demo__header > span {
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 86%, transparent);
}

.base-anchor-animation-demo__grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 28px 0;
}

.base-anchor-animation-demo__panel {
  width: 230px;
  padding: 4px;
  font-size: 13px;
  line-height: 1.55;
}
</style>
