<script setup lang="ts">
import { computed, ref } from 'vue'

type AnchorAnimationType = 'transfer' | 'boom' | 'expand' | 'opacity' | 'none'

const { locale } = useI18n()
const open = ref<Record<AnchorAnimationType, boolean>>({
  transfer: false,
  boom: false,
  expand: false,
  opacity: false,
  none: false,
})

const labels = computed(() => {
  if (locale.value.startsWith('zh')) {
    return {
      title: '锚点定位动画',
      desc: '同一个 animation 对象切换动画类型，定位能力不变。',
      modes: {
        transfer: '位移动画',
        boom: '聚焦缩放',
        expand: '展开（默认）',
        opacity: '透明度',
        none: '无动画',
      },
      content: {
        transfer: '沿 placement 方向揭示与回收。',
        boom: '模糊、缩放与透明度同步变化。',
        expand: '从锚点角弹出，回弹落定。',
        opacity: '只做淡入淡出。',
        none: '立即显示与隐藏。',
      },
    }
  }

  return {
    title: 'Anchor positioning animations',
    desc: 'One animation object switches the motion; positioning stays put.',
    modes: {
      transfer: 'transfer',
      boom: 'focus scale',
      expand: 'expand (default)',
      opacity: 'opacity',
      none: 'none',
    },
    content: {
      transfer: 'Reveals and returns along the placement direction.',
      boom: 'Blur, scale, and opacity move together.',
      expand: 'Springs from the anchored corner and settles with a bounce.',
      opacity: 'Fade only.',
      none: 'Shows and hides instantly.',
    },
  }
})

const modes: AnchorAnimationType[] = ['expand', 'transfer', 'boom', 'opacity', 'none']

function resolveAnimation(type: AnchorAnimationType) {
  // expand ships its own tuned timing; overriding it here would flatten the
  // motion being demonstrated.
  if (type === 'expand')
    return { type }

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
