<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  configureSound,
  sound,
  playSound,
  type SoundType,
} from '@talex-touch/tuffex/utils'

const { locale } = useI18n()
const isZh = computed(() => locale.value === 'zh')

const soundEnabled = ref(true)
const volume = ref(70)
const lastPlayed = ref<string | null>(null)
const playCount = ref(0)
const testInputText = ref('')
const testToggleState = ref(false)

const presets: Array<{
  type: SoundType
  labelZh: string
  labelEn: string
  descZh: string
  descEn: string
  icon: string
  duration: string
  peak: string
}> = [
  {
    type: 'click',
    labelZh: '点击 (Click)',
    labelEn: 'Click',
    descZh: '按钮按下即时反馈',
    descEn: 'Button press feedback',
    icon: 'i-carbon-touch-1',
    duration: '40ms',
    peak: '0.103',
  },
  {
    type: 'key',
    labelZh: '按键 (Key)',
    labelEn: 'Key',
    descZh: '文本框逐字符敲击',
    descEn: 'Keystroke tap',
    icon: 'i-carbon-keyboard',
    duration: '27ms',
    peak: '0.056',
  },
  {
    type: 'toggle',
    labelZh: '切换 (Toggle)',
    labelEn: 'Toggle',
    descZh: '开关 / 复选框状态翻转',
    descEn: 'Switch / checkbox toggle',
    icon: 'i-carbon-switcher',
    duration: '65ms',
    peak: '0.089',
  },
  {
    type: 'success',
    labelZh: '成功 (Success)',
    labelEn: 'Success',
    descZh: '动作完成（上行两音）',
    descEn: 'Action complete (rising tones)',
    icon: 'i-carbon-checkmark-filled',
    duration: '188ms',
    peak: '0.090',
  },
  {
    type: 'error',
    labelZh: '失败 (Error)',
    labelEn: 'Error',
    descZh: '动作被拒（下行两音）',
    descEn: 'Action rejected (falling tones)',
    icon: 'i-carbon-warning-filled',
    duration: '216ms',
    peak: '0.100',
  },
  {
    type: 'open',
    labelZh: '展开 (Open)',
    labelEn: 'Open',
    descZh: '面板 / 对话框展开滑音',
    descEn: 'Panel / modal open glide',
    icon: 'i-carbon-popup',
    duration: '91ms',
    peak: '0.078',
  },
  {
    type: 'close',
    labelZh: '收起 (Close)',
    labelEn: 'Close',
    descZh: '面板 / 对话框收起滑音',
    descEn: 'Panel / modal close glide',
    icon: 'i-carbon-close-outline',
    duration: '91ms',
    peak: '0.077',
  },
]

function applyConfig() {
  configureSound({
    enabled: soundEnabled.value,
    volume: volume.value / 100,
  })
}

function handlePlay(type: SoundType) {
  applyConfig()
  const ok = playSound(type)
  if (ok) {
    lastPlayed.value = type
    playCount.value++
  }
}

function handleKeyInput() {
  if (!soundEnabled.value) return
  applyConfig()
  sound.key()
  lastPlayed.value = 'key'
  playCount.value++
}

function handleToggleTest(val: boolean) {
  testToggleState.value = val
  if (!soundEnabled.value) return
  applyConfig()
  sound.toggle()
  lastPlayed.value = 'toggle'
  playCount.value++
}

function handleMasterToggle(val: boolean) {
  soundEnabled.value = val
  applyConfig()
  if (val) {
    sound.toggle()
    lastPlayed.value = 'toggle'
  }
}

onMounted(() => {
  applyConfig()
})
</script>

<template>
  <div class="sound-audition-demo not-prose">
    <!-- Header Control Bar -->
    <div class="sound-audition-toolbar">
      <div class="sound-audition-toggle">
        <span class="toolbar-label">{{ isZh ? '交互音效总开关' : 'Sound Effects' }}</span>
        <TxSwitch
          :model-value="soundEnabled"
          @update:model-value="handleMasterToggle"
        />
        <span class="status-indicator" :class="{ 'is-active': soundEnabled }">
          {{ soundEnabled ? (isZh ? '已开启' : 'Enabled') : (isZh ? '已关闭' : 'Disabled') }}
        </span>
      </div>

      <div class="sound-audition-volume">
        <span class="toolbar-label">{{ isZh ? '主音量' : 'Volume' }}: {{ volume }}%</span>
        <input
          v-model.number="volume"
          type="range"
          min="0"
          max="100"
          step="5"
          class="volume-slider"
          @input="applyConfig"
        >
      </div>

      <div v-if="lastPlayed" class="sound-audition-feedback">
        <span class="i-carbon-volume-up text-primary animate-pulse" />
        <span class="feedback-text">{{ isZh ? '最近触发' : 'Triggered' }}: <code>{{ lastPlayed }}</code></span>
      </div>
    </div>

    <!-- Presets Grid -->
    <div class="sound-presets-grid">
      <div
        v-for="item in presets"
        :key="item.type"
        class="sound-preset-card"
        :class="{ 'is-highlight': lastPlayed === item.type }"
        @click="handlePlay(item.type)"
      >
        <div class="preset-card-head">
          <div class="preset-icon-wrap">
            <span :class="item.icon" class="preset-icon" />
          </div>
          <div class="preset-meta">
            <span class="preset-name">{{ isZh ? item.labelZh : item.labelEn }}</span>
            <span class="preset-specs">{{ item.duration }} · 峰值 {{ item.peak }}</span>
          </div>
        </div>

        <p class="preset-desc">
          {{ isZh ? item.descZh : item.descEn }}
        </p>

        <div class="preset-action">
          <TxButton
            size="sm"
            variant="primary"
            icon="i-carbon-play-filled-alt"
            :disabled="!soundEnabled"
            @click.stop="handlePlay(item.type)"
          >
            {{ isZh ? '试听音效' : 'Audition' }}
          </TxButton>
        </div>
      </div>
    </div>

    <!-- Interactive Playground Row -->
    <div class="sound-playground">
      <div class="playground-title">
        <span class="i-carbon-game-console" />
        <span>{{ isZh ? '实景交互试听演练' : 'Interactive Playground' }}</span>
      </div>

      <div class="playground-row">
        <!-- Keystroke test input -->
        <div class="playground-item">
          <span class="item-label">{{ isZh ? '打字试听 (key)' : 'Type to test key sound' }}:</span>
          <input
            v-model="testInputText"
            type="text"
            :placeholder="isZh ? '在此输入体验逐字按键音...' : 'Type here to hear key clicks...'"
            class="interactive-input"
            @input="handleKeyInput"
          >
        </div>

        <!-- Switch toggle test -->
        <div class="playground-item">
          <span class="item-label">{{ isZh ? '开关试听 (toggle)' : 'Toggle switch sound' }}:</span>
          <TxSwitch
            :model-value="testToggleState"
            @update:model-value="handleToggleTest"
          />
        </div>

        <!-- Success & Error test -->
        <div class="playground-item playground-actions">
          <TxButton
            size="sm"
            variant="ghost"
            icon="i-carbon-checkmark-outline"
            @click="handlePlay('success')"
          >
            {{ isZh ? '触发成功' : 'Success' }}
          </TxButton>
          <TxButton
            size="sm"
            variant="ghost"
            icon="i-carbon-misuse-outline"
            @click="handlePlay('error')"
          >
            {{ isZh ? '触发失败' : 'Error' }}
          </TxButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.sound-audition-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  background: var(--tx-fill-color-blank, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--tx-border-color, #e2e8f0);
  border-radius: 12px;
}

.sound-audition-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--tx-bg-color, #ffffff);
  border: 1px solid var(--tx-border-color-light, #edf2f7);
  border-radius: 8px;
}

.sound-audition-toggle,
.sound-audition-volume,
.sound-audition-feedback {
  display: flex;
  align-items: center;
  gap: 10px;
}

.toolbar-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--tx-text-color-primary, #1e293b);
}

.status-indicator {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--tx-fill-color, #f1f5f9);
  color: var(--tx-text-color-secondary, #64748b);

  &.is-active {
    background: var(--tx-color-success-light-9, rgba(74, 222, 128, 0.15));
    color: var(--tx-color-success, #16a34a);
  }
}

.volume-slider {
  width: 100px;
  accent-color: var(--tx-color-primary, #3b82f6);
  cursor: pointer;
}

.sound-audition-feedback {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #64748b);

  code {
    font-size: 11px;
    padding: 1px 4px;
    background: var(--tx-fill-color-light, #f8fafc);
    border-radius: 3px;
    color: var(--tx-color-primary, #3b82f6);
  }
}

.sound-presets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: 12px;
}

.sound-preset-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: var(--tx-bg-color, #ffffff);
  border: 1px solid var(--tx-border-color-light, #edf2f7);
  border-radius: 8px;
  cursor: pointer;
  transition: all 180ms ease-out;

  &:hover {
    border-color: var(--tx-color-primary-light-5, #93c5fd);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  &.is-highlight {
    border-color: var(--tx-color-primary, #3b82f6);
    box-shadow: 0 0 0 1px var(--tx-color-primary, #3b82f6);
  }
}

.preset-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.preset-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--tx-fill-color, #f1f5f9);
  color: var(--tx-color-primary, #3b82f6);
}

.preset-meta {
  display: flex;
  flex-direction: column;
}

.preset-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #0f172a);
}

.preset-specs {
  font-size: 11px;
  color: var(--tx-text-color-secondary, #64748b);
}

.preset-desc {
  font-size: 12px;
  color: var(--tx-text-color-regular, #334155);
  line-height: 1.4;
  margin: 0;
  min-height: 34px;
}

.preset-action {
  margin-top: 4px;
}

.sound-playground {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  background: var(--tx-bg-color, #ffffff);
  border: 1px solid var(--tx-border-color-light, #edf2f7);
  border-radius: 8px;
}

.playground-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #0f172a);
}

.playground-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
}

.playground-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-label {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #64748b);
}

.interactive-input {
  width: 220px;
  padding: 6px 10px;
  font-size: 13px;
  border: 1px solid var(--tx-border-color, #cbd5e1);
  border-radius: 6px;
  background: var(--tx-fill-color-blank, transparent);
  color: var(--tx-text-color-primary, inherit);
  outline: none;

  &:focus {
    border-color: var(--tx-color-primary, #3b82f6);
    box-shadow: 0 0 0 2px var(--tx-color-primary-light-7, rgba(59, 130, 246, 0.2));
  }
}

.playground-actions {
  display: flex;
  gap: 8px;
}
</style>
