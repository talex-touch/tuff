<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { MikoEmits, MikoProps } from './types'
import { computed } from 'vue'
import { MIKO_DEFAULT_LABELS } from './types'

defineOptions({
  name: 'TxMiko',
})

const props = withDefaults(defineProps<MikoProps>(), {
  state: 'idle',
  size: 'md',
  color: '#810DC6',
  labels: () => ({}),
  ariaLabel: undefined,
})

const emit = defineEmits<MikoEmits>()

const mergedLabels = computed(() => ({
  ...MIKO_DEFAULT_LABELS,
  ...props.labels,
}))

const currentLabel = computed(() => mergedLabels.value[props.state] || props.state)
const computedAriaLabel = computed(() => props.ariaLabel || `Miko: ${currentLabel.value}`)

const rootStyle = computed<CSSProperties>(() => {
  const s = props.size
  let width = '72px'
  let height = '48px'

  if (typeof s === 'number') {
    width = `${s * 1.5}px`
    height = `${s}px`
  }
  else if (s === 'xs') {
    width = '36px'
    height = '24px'
  }
  else if (s === 'sm') {
    width = '48px'
    height = '32px'
  }
  else if (s === 'md') {
    width = '72px'
    height = '48px'
  }
  else if (s === 'lg') {
    width = '96px'
    height = '64px'
  }
  else if (typeof s === 'string') {
    width = s
    height = 'auto'
  }

  return {
    width,
    height,
    '--tx-miko-body-color': props.color,
  }
})

function handleClick(event: MouseEvent) {
  emit('click', event)
}
</script>

<template>
  <div
    class="tx-miko"
    :class="[`state-${state}`]"
    :style="rootStyle"
    role="img"
    :aria-label="computedAriaLabel"
    @click="handleClick"
  >
    <svg viewBox="0 0 36 24" shape-rendering="crispEdges">
      <!-- 1. 待命 IDLE -->
      <g v-if="state === 'idle'" class="cat-body">
        <g class="cat-tail">
          <rect x="23" y="10" width="3" height="2" :fill="color" />
          <rect x="24" y="8" width="3" height="3" :fill="color" />
          <rect x="23" y="7" width="2" height="2" :fill="color" />
        </g>
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="4" y="7" width="4" height="2" :fill="color" />
        <rect x="12" y="7" width="4" height="2" :fill="color" />
        <rect x="3" y="8" width="14" height="2" :fill="color" />
        <rect x="3" y="9" width="17" height="2" :fill="color" />
        <rect x="2" y="10" width="20" height="2" :fill="color" />
        <rect x="2" y="11" width="22" height="2" :fill="color" />
        <rect x="2" y="12" width="23" height="3" :fill="color" />
        <rect x="3" y="15" width="21" height="2" :fill="color" />
        <g class="cat-eyes">
          <rect x="5" y="11" width="2" height="2" fill="#000" />
          <rect x="13" y="11" width="2" height="2" fill="#000" />
        </g>
        <rect x="8" y="13" width="1" height="1" fill="#000" />
        <rect x="10" y="13" width="1" height="1" fill="#000" />
        <rect x="9" y="14" width="1" height="1" fill="#000" />
      </g>

      <!-- 2. 执行打字 WORKING -->
      <g v-else-if="state === 'working'" class="cat-body">
        <g class="cat-tail">
          <rect x="24" y="7" width="2" height="5" :fill="color" />
          <rect x="25" y="5" width="3" height="3" :fill="color" />
        </g>
        <rect x="5" y="6" width="2" height="2" :fill="color" />
        <rect x="13" y="6" width="2" height="2" :fill="color" />
        <rect x="4" y="7" width="4" height="2" :fill="color" />
        <rect x="12" y="7" width="4" height="2" :fill="color" />
        <rect x="3" y="8" width="14" height="2" :fill="color" />
        <rect x="3" y="9" width="18" height="2" :fill="color" />
        <rect x="2" y="10" width="21" height="2" :fill="color" />
        <rect x="2" y="11" width="22" height="2" :fill="color" />
        <rect x="2" y="12" width="23" height="3" :fill="color" />
        <rect x="3" y="15" width="21" height="2" :fill="color" />
        <rect x="5" y="11" width="2" height="2" fill="#000" />
        <rect x="13" y="11" width="2" height="2" fill="#000" />
        <rect x="8" y="13" width="3" height="1" fill="#000" />
        <rect x="2" y="16" width="13" height="2" fill="#2d2b45" />
        <rect x="3" y="15" width="2" height="1" fill="#c084fc" class="key-active" />
        <rect x="6" y="15" width="2" height="1" fill="#8a87a8" />
        <rect x="9" y="15" width="2" height="1" fill="#c084fc" class="key-active" />
        <rect x="12" y="15" width="2" height="1" fill="#8a87a8" />
        <rect x="4" y="14" width="2" height="2" fill="#a855f7" class="paw-l" />
        <rect x="10" y="14" width="2" height="2" fill="#a855f7" class="paw-r" />
      </g>

      <!-- 3. 思考中 THINKING -->
      <g v-else-if="state === 'thinking'">
        <g class="sparkle">
          <rect x="14" y="2" width="1" height="5" fill="#c084fc" />
          <rect x="12" y="4" width="5" height="1" fill="#c084fc" />
          <rect x="13" y="3" width="3" height="3" fill="#fff" />
        </g>
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="color" />
            <rect x="24" y="8" width="3" height="3" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <g class="cat-eyes">
            <rect x="6" y="10" width="2" height="2" fill="#000" />
            <rect x="14" y="10" width="2" height="2" fill="#000" />
          </g>
          <rect x="9" y="13" width="2" height="1" fill="#000" />
        </g>
      </g>

      <!-- 4. 任务成功 SUCCESS -->
      <g v-else-if="state === 'success'">
        <rect x="4" y="6" width="1" height="1" fill="#10b981" class="confetti-1" />
        <rect x="26" y="4" width="2" height="1" fill="#f59e0b" class="confetti-2" />
        <rect x="18" y="3" width="1" height="2" fill="#c084fc" class="confetti-1" />
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="6" width="2" height="5" :fill="color" />
            <rect x="24" y="4" width="2" height="3" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <rect x="5" y="11" width="1" height="1" fill="#000" />
          <rect x="6" y="10" width="1" height="1" fill="#000" />
          <rect x="7" y="11" width="1" height="1" fill="#000" />
          <rect x="12" y="11" width="1" height="1" fill="#000" />
          <rect x="13" y="10" width="1" height="1" fill="#000" />
          <rect x="14" y="11" width="1" height="1" fill="#000" />
          <rect x="9" y="13" width="2" height="1" fill="#000" />
        </g>
      </g>

      <!-- 5. 待确认警觉 ALERT -->
      <g v-else-if="state === 'alert'">
        <g class="mark">
          <rect x="9" y="2" width="2" height="4" fill="#ef4444" />
          <rect x="9" y="7" width="2" height="2" fill="#ef4444" />
        </g>
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="24" y="8" width="2" height="4" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <rect x="4" y="10" width="3" height="3" fill="#000" />
          <rect x="12" y="10" width="3" height="3" fill="#000" />
          <rect x="8" y="14" width="3" height="1" fill="#000" />
        </g>
      </g>

      <!-- 6. 运行异常 ERROR -->
      <g v-else-if="state === 'error'">
        <rect x="17" y="8" width="2" height="2" fill="#38bdf8" class="sweat-drop" />
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="24" y="10" width="3" height="1" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <rect x="5" y="11" width="1" height="1" fill="#000" />
          <rect x="7" y="11" width="1" height="1" fill="#000" />
          <rect x="6" y="12" width="1" height="1" fill="#000" />
          <rect x="5" y="13" width="1" height="1" fill="#000" />
          <rect x="7" y="13" width="1" height="1" fill="#000" />

          <rect x="12" y="11" width="1" height="1" fill="#000" />
          <rect x="14" y="11" width="1" height="1" fill="#000" />
          <rect x="13" y="12" width="1" height="1" fill="#000" />
          <rect x="12" y="13" width="1" height="1" fill="#000" />
          <rect x="14" y="13" width="1" height="1" fill="#000" />
          <rect x="9" y="14" width="2" height="1" fill="#000" />
        </g>
      </g>

      <!-- 7. 休眠睡眠 SLEEPING -->
      <g v-else-if="state === 'sleeping'">
        <g class="z-1">
          <rect x="16" y="6" width="3" height="1" fill="#c084fc" />
          <rect x="17" y="7" width="1" height="1" fill="#c084fc" />
          <rect x="16" y="8" width="3" height="1" fill="#c084fc" />
        </g>
        <g class="z-2">
          <rect x="19" y="4" width="4" height="1" fill="#c084fc" />
          <rect x="21" y="5" width="1" height="1" fill="#c084fc" />
          <rect x="20" y="6" width="1" height="1" fill="#c084fc" />
          <rect x="19" y="7" width="4" height="1" fill="#c084fc" />
        </g>
        <g class="cat-body">
          <rect x="21" y="12" width="3" height="3" :fill="color" />
          <rect x="5" y="7" width="2" height="2" :fill="color" />
          <rect x="13" y="7" width="2" height="2" :fill="color" />
          <rect x="4" y="8" width="4" height="2" :fill="color" />
          <rect x="12" y="8" width="4" height="2" :fill="color" />
          <rect x="3" y="9" width="15" height="2" :fill="color" />
          <rect x="3" y="10" width="18" height="2" :fill="color" />
          <rect x="2" y="11" width="20" height="2" :fill="color" />
          <rect x="2" y="12" width="21" height="3" :fill="color" />
          <rect x="3" y="15" width="19" height="2" :fill="color" />
          <rect x="5" y="12" width="3" height="1" fill="#000" />
          <rect x="12" y="12" width="3" height="1" fill="#000" />
          <rect x="9" y="13" width="1" height="1" fill="#000" />
        </g>
      </g>

      <!-- 8. 并发多任务 JUGGLING -->
      <g v-else-if="state === 'juggling'">
        <g class="ball-a">
          <rect x="8" y="4" width="3" height="3" fill="#38bdf8" />
        </g>
        <g class="ball-b">
          <rect x="14" y="4" width="3" height="3" fill="#f59e0b" />
        </g>
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="24" y="7" width="2" height="4" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <rect x="5" y="10" width="2" height="2" fill="#000" />
          <rect x="13" y="10" width="2" height="2" fill="#000" />
          <rect x="5" y="13" width="2" height="2" fill="#a855f7" class="paw-wave" />
          <rect x="13" y="13" width="2" height="2" fill="#a855f7" class="paw-wave" />
        </g>
      </g>

      <!-- 9. 上下文整理 SWEEPING -->
      <g v-else-if="state === 'sweeping'">
        <g class="dust">
          <rect x="1" y="15" width="1" height="1" fill="#8b88a8" />
          <rect x="3" y="16" width="1" height="1" fill="#8b88a8" />
        </g>
        <g class="broom">
          <rect x="0" y="10" width="1" height="6" fill="#f59e0b" />
          <rect x="0" y="16" width="3" height="2" fill="#d97706" />
        </g>
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="9" width="3" height="2" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <rect x="5" y="11" width="2" height="2" fill="#000" />
          <rect x="13" y="11" width="2" height="2" fill="#000" />
        </g>
      </g>

      <!-- 10. 文件研读 READING -->
      <g v-else-if="state === 'reading'">
        <g class="book-page">
          <rect x="1" y="12" width="4" height="4" fill="#3b82f6" />
          <rect x="2" y="13" width="2" height="2" fill="#fff" />
        </g>
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="color" />
            <rect x="24" y="8" width="2" height="2" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <g class="cat-eyes">
            <rect x="4" y="11" width="2" height="2" fill="#000" />
            <rect x="11" y="11" width="2" height="2" fill="#000" />
          </g>
          <rect x="8" y="13" width="2" height="1" fill="#000" />
        </g>
      </g>

      <!-- 11. 互动眩晕 DIZZY -->
      <g v-else-if="state === 'dizzy'">
        <g class="dizzy-star">
          <rect x="15" y="3" width="2" height="2" fill="#f59e0b" />
        </g>
        <g class="cat-body">
          <g class="cat-tail">
            <rect x="23" y="10" width="3" height="2" :fill="color" />
          </g>
          <rect x="5" y="6" width="2" height="2" :fill="color" />
          <rect x="13" y="6" width="2" height="2" :fill="color" />
          <rect x="4" y="7" width="4" height="2" :fill="color" />
          <rect x="12" y="7" width="4" height="2" :fill="color" />
          <rect x="3" y="8" width="14" height="2" :fill="color" />
          <rect x="3" y="9" width="17" height="2" :fill="color" />
          <rect x="2" y="10" width="20" height="2" :fill="color" />
          <rect x="2" y="11" width="22" height="2" :fill="color" />
          <rect x="2" y="12" width="23" height="3" :fill="color" />
          <rect x="3" y="15" width="21" height="2" :fill="color" />
          <g class="dizzy-eye">
            <rect x="5" y="11" width="2" height="1" fill="#000" />
            <rect x="6" y="12" width="1" height="1" fill="#000" />
            <rect x="5" y="13" width="2" height="1" fill="#000" />
            <rect x="12" y="11" width="2" height="1" fill="#000" />
            <rect x="13" y="12" width="1" height="1" fill="#000" />
            <rect x="12" y="13" width="2" height="1" fill="#000" />
          </g>
          <rect x="9" y="14" width="1" height="1" fill="#000" />
        </g>
      </g>

      <!-- 12. 边缘探头 PEEKING -->
      <g v-else-if="state === 'peeking'" class="cat-peek">
        <rect x="9" y="8" width="2" height="2" :fill="color" />
        <rect x="17" y="8" width="2" height="2" :fill="color" />
        <rect x="8" y="9" width="4" height="2" :fill="color" />
        <rect x="16" y="9" width="4" height="2" :fill="color" />
        <rect x="7" y="10" width="14" height="3" :fill="color" />
        <rect x="6" y="12" width="16" height="5" :fill="color" />
        <g class="cat-eyes">
          <rect x="9" y="13" width="2" height="2" fill="#000" />
          <rect x="17" y="13" width="2" height="2" fill="#000" />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.tx-miko {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  cursor: default;
}

.tx-miko svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

/* Animations */
@keyframes loafBreath {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-1px); }
}
@keyframes tailWagSlow {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(-8deg); }
}
@keyframes blinkEye {
  0%, 90%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}

.state-idle .cat-body { animation: loafBreath 2.6s ease-in-out infinite; }
.state-idle .cat-tail { transform-origin: 24px 14px; animation: tailWagSlow 3.2s ease-in-out infinite; }
.state-idle .cat-eyes { transform-origin: 9px 12px; animation: blinkEye 4s infinite; }

/* Working / Typing */
@keyframes pawTapL {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes pawTapR {
  0%, 100% { transform: translateY(-3px); }
  50% { transform: translateY(0); }
}
@keyframes keyGlow {
  0%, 100% { fill: #4a4860; }
  50% { fill: #c084fc; }
}
@keyframes tailWagFast {
  0%, 100% { transform: rotate(4deg); }
  50% { transform: rotate(-10deg); }
}
.state-working .paw-l { animation: pawTapL 0.22s steps(2) infinite; }
.state-working .paw-r { animation: pawTapR 0.22s steps(2) infinite; }
.state-working .key-active { animation: keyGlow 0.22s steps(2) infinite; }
.state-working .cat-tail { transform-origin: 24px 14px; animation: tailWagFast 0.44s ease-in-out infinite; }

/* Thinking */
@keyframes starPulse {
  0%, 100% { transform: translateY(0) scale(1) rotate(0deg); opacity: 0.9; }
  50% { transform: translateY(-3px) scale(1.15) rotate(45deg); opacity: 1; filter: drop-shadow(0 0 4px #c084fc); }
}
@keyframes eyeGlanceUp {
  0%, 100% { transform: translate(1px, -1px); }
  50% { transform: translate(1px, -2px); }
}
.state-thinking .sparkle { transform-origin: 14px 4px; animation: starPulse 1.8s ease-in-out infinite; }
.state-thinking .cat-eyes { animation: eyeGlanceUp 2s ease-in-out infinite; }
.state-thinking .cat-tail { transform-origin: 24px 14px; animation: tailWagSlow 2.8s ease-in-out infinite; }

/* Success */
@keyframes joyHop {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes tailCelebration {
  0%, 100% { transform: rotate(15deg); }
  50% { transform: rotate(-15deg); }
}
@keyframes confettiRise {
  0% { transform: translate(0, 4px); opacity: 0; }
  50% { opacity: 1; }
  100% { transform: translate(0, -8px); opacity: 0; }
}
.state-success .cat-body { animation: joyHop 0.5s ease-in-out infinite; }
.state-success .cat-tail { transform-origin: 25px 12px; animation: tailCelebration 0.25s ease-in-out infinite; }
.state-success .confetti-1 { animation: confettiRise 1.2s ease-out infinite; }
.state-success .confetti-2 { animation: confettiRise 1.2s 0.6s ease-out infinite; }

/* Alert */
@keyframes alertBounce {
  0%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
  60% { transform: translateY(-1px); }
}
@keyframes alertGlow {
  0%, 100% { fill: #ef4444; filter: drop-shadow(0 0 2px #ef4444); }
  50% { fill: #f59e0b; filter: drop-shadow(0 0 6px #f59e0b); }
}
.state-alert .mark { transform-origin: 10px 4px; animation: alertBounce 0.8s ease-in-out infinite, alertGlow 1.6s infinite; }
.state-alert .cat-body { animation: loafBreath 1.2s ease-in-out infinite; }

/* Error */
@keyframes glitchShake {
  0% { transform: translate(0, 0); }
  20% { transform: translate(-1px, 1px); }
  40% { transform: translate(1px, -1px); }
  60% { transform: translate(-1px, -1px); }
  80% { transform: translate(1px, 1px); }
  100% { transform: translate(0, 0); }
}
.state-error .cat-body { animation: glitchShake 0.15s steps(2) infinite; }
.state-error .sweat-drop { animation: loafBreath 0.6s infinite; }

/* Sleeping */
@keyframes zDrift {
  0% { transform: translate(0, 0) scale(0.6); opacity: 0; }
  40% { opacity: 1; }
  100% { transform: translate(6px, -12px) scale(1.1); opacity: 0; }
}
@keyframes deepSleep {
  0%, 100% { transform: scale(1, 1); }
  50% { transform: scale(1.02, 0.98); }
}
.state-sleeping .z-1 { animation: zDrift 2.4s ease-out infinite; }
.state-sleeping .z-2 { animation: zDrift 2.4s 1.2s ease-out infinite; }
.state-sleeping .cat-body { transform-origin: 16px 16px; animation: deepSleep 3.6s ease-in-out infinite; }

/* Juggling */
@keyframes juggleOrbitA {
  0% { transform: translate(0, 0); }
  25% { transform: translate(6px, -8px); }
  50% { transform: translate(12px, 0); }
  75% { transform: translate(6px, 6px); }
  100% { transform: translate(0, 0); }
}
@keyframes juggleOrbitB {
  0% { transform: translate(12px, 0); }
  25% { transform: translate(6px, 6px); }
  50% { transform: translate(0, 0); }
  75% { transform: translate(6px, -8px); }
  100% { transform: translate(12px, 0); }
}
.state-juggling .ball-a { animation: juggleOrbitA 1.4s ease-in-out infinite; }
.state-juggling .ball-b { animation: juggleOrbitB 1.4s ease-in-out infinite; }
.state-juggling .paw-wave { transform-origin: 12px 14px; animation: pawTapL 0.35s steps(2) infinite; }

/* Sweeping */
@keyframes broomSweep {
  0%, 100% { transform: rotate(-15deg); }
  50% { transform: rotate(15deg); }
}
@keyframes dustFly {
  0% { transform: translate(0, 0) scale(0.5); opacity: 1; }
  100% { transform: translate(8px, -4px) scale(1.2); opacity: 0; }
}
.state-sweeping .broom { transform-origin: 8px 14px; animation: broomSweep 0.5s ease-in-out infinite; }
.state-sweeping .dust { animation: dustFly 0.5s ease-out infinite; }

/* Reading */
@keyframes eyeScan {
  0%, 100% { transform: translateX(-1px); }
  50% { transform: translateX(2px); }
}
@keyframes pageTurn {
  0%, 100% { transform: scaleX(1); }
  50% { transform: scaleX(0.7); }
}
.state-reading .cat-eyes { animation: eyeScan 1.6s steps(3) infinite; }
.state-reading .book-page { transform-origin: 8px 14px; animation: pageTurn 2.4s ease-in-out infinite; }

/* Dizzy */
@keyframes eyeSpin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
@keyframes haloOrbit {
  0% { transform: rotate(0deg) translateX(8px) rotate(0deg); }
  100% { transform: rotate(360deg) translateX(8px) rotate(-360deg); }
}
.state-dizzy .dizzy-eye { transform-origin: 8px 12px; animation: eyeSpin 1.2s linear infinite; }
.state-dizzy .dizzy-star { transform-origin: 16px 5px; animation: haloOrbit 1.8s linear infinite; }
.state-dizzy .cat-body { animation: glitchShake 0.4s ease-in-out infinite; }

/* Peeking */
@keyframes peekRise {
  0%, 100% { transform: translateY(8px); }
  40%, 70% { transform: translateY(0); }
}
@keyframes peekLook {
  0%, 30%, 100% { transform: translateX(0); }
  45% { transform: translateX(-2px); }
  65% { transform: translateX(2px); }
}
.state-peeking .cat-peek { animation: peekRise 3.5s ease-in-out infinite; }
.state-peeking .cat-eyes { animation: peekLook 3.5s ease-in-out infinite; }
</style>
