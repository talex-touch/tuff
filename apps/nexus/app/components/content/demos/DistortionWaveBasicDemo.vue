<script setup lang="ts">
import type { DistortionWaveHandle, DistortionWavePaletteName, DistortionWaveType } from '@talex-touch/tuffex/distortion-wave'
import { computed, ref } from 'vue'
import { TxButton, TxDistortionWave } from '#components'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

const copy = computed(() => zh.value
  ? {
      sendingTo: '转账给',
      sentTo: '已转账给',
      recipient: '林语汐 · Maya Chen',
      from: '付款账户',
      account: '日常账户 ·· 4821',
      arrives: '到账速度',
      arrived: '到账时间',
      inSeconds: '秒级到账',
      justNow: '刚刚',
      fee: '手续费',
      free: '免费',
      note: '备注',
      noteVal: '工作室租金',
      confirm: '确认转账',
      done: '完成并返回',
      typeLabel: '波浪方向',
      paletteLabel: '色彩方案',
      types: { vertical: '垂直波', horizontal: '水平波', center: '中心扩散' },
      palettes: { colorful: '炫彩', green: '翠绿', ocean: '海洋', sunset: '日落', mono: '单色' },
      hint: '点击「确认转账」或按钮偏左/偏右位置，色散折射波会顺着点击点倾斜扫过视图。',
    }
  : {
      sendingTo: 'Sending to',
      sentTo: 'Sent to',
      recipient: 'Maya Chen',
      from: 'From',
      account: 'Everyday ·· 4821',
      arrives: 'Arrives',
      arrived: 'Arrived',
      inSeconds: 'In seconds',
      justNow: 'Just now',
      fee: 'Fee',
      free: 'Free',
      note: 'Note',
      noteVal: 'Studio rent',
      confirm: 'Confirm',
      done: 'Done',
      typeLabel: 'Wave type',
      paletteLabel: 'Palette',
      types: { vertical: 'Vertical', horizontal: 'Horizontal', center: 'Center' },
      palettes: { colorful: 'Colorful', green: 'Green', ocean: 'Ocean', sunset: 'Sunset', mono: 'Mono' },
      hint: 'Click Confirm (left or right side of the button) to launch a chromatic lens wave leaning toward the press.',
    })

const sent = ref(false)
const waveType = ref<DistortionWaveType>('vertical')
const palette = ref<DistortionWavePaletteName>('colorful')
const confirmBtnRef = ref<HTMLButtonElement | null>(null)
const waveRef = ref<DistortionWaveHandle | null>(null)

const waveTypes: DistortionWaveType[] = ['vertical', 'horizontal', 'center']
const palettes: DistortionWavePaletteName[] = ['colorful', 'green', 'ocean', 'sunset', 'mono']

function toggleTransfer(): void {
  sent.value = !sent.value
}
</script>

<template>
  <div class="dw-demo not-prose">
    <div class="dw-demo__controls">
      <div class="dw-demo__group">
        <span class="dw-demo__label">{{ copy.typeLabel }}</span>
        <div class="dw-demo__pills">
          <TxButton
            v-for="item in waveTypes"
            :key="item"
            size="sm"
            :variant="waveType === item ? 'primary' : 'secondary'"
            @click="waveType = item"
          >
            {{ copy.types[item] }}
          </TxButton>
        </div>
      </div>
      <div class="dw-demo__group">
        <span class="dw-demo__label">{{ copy.paletteLabel }}</span>
        <div class="dw-demo__pills">
          <TxButton
            v-for="item in palettes"
            :key="item"
            size="sm"
            :variant="palette === item ? 'primary' : 'secondary'"
            @click="palette = item"
          >
            {{ copy.palettes[item] }}
          </TxButton>
        </div>
      </div>
    </div>

    <div class="dw-demo__stage">
      <TxDistortionWave
        ref="waveRef"
        class="dw-demo__wave"
        :revealed="sent"
        :type="waveType"
        :palette="palette"
        :source="confirmBtnRef"
        :corner-radius="24"
      >
        <div class="dw-demo__card">
          <div class="dw-demo__avatar" aria-hidden="true">
            MC
          </div>
          <p class="dw-demo__eyebrow">
            {{ copy.sendingTo }} <strong>{{ copy.recipient }}</strong>
          </p>
          <p class="dw-demo__amount">
            $1,250.00
          </p>
          <dl class="dw-demo__rows">
            <div><dt>{{ copy.from }}</dt><dd>{{ copy.account }}</dd></div>
            <div><dt>{{ copy.arrives }}</dt><dd>{{ copy.inSeconds }}</dd></div>
            <div><dt>{{ copy.fee }}</dt><dd>{{ copy.free }}</dd></div>
            <div><dt>{{ copy.note }}</dt><dd>{{ copy.noteVal }}</dd></div>
          </dl>
          <div class="dw-demo__spacer" />
        </div>

        <template #revealed>
          <div class="dw-demo__card dw-demo__card--sent">
            <div class="dw-demo__check" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <p class="dw-demo__eyebrow">
              {{ copy.sentTo }} <strong>{{ copy.recipient }}</strong>
            </p>
            <p class="dw-demo__amount">
              $1,250.00
            </p>
            <dl class="dw-demo__rows">
              <div><dt>{{ copy.from }}</dt><dd>{{ copy.account }}</dd></div>
              <div><dt>{{ copy.arrived }}</dt><dd>{{ copy.justNow }}</dd></div>
              <div><dt>{{ copy.fee }}</dt><dd>{{ copy.free }}</dd></div>
              <div><dt>{{ copy.note }}</dt><dd>{{ copy.noteVal }}</dd></div>
            </dl>
            <div class="dw-demo__spacer" />
          </div>
        </template>

        <template #overlay>
          <div class="dw-demo__overlay-bar">
            <button
              ref="confirmBtnRef"
              type="button"
              class="dw-demo__cta"
              @click="toggleTransfer"
            >
              {{ sent ? copy.done : copy.confirm }}
            </button>
          </div>
        </template>
      </TxDistortionWave>
    </div>

    <p class="dw-demo__hint">
      {{ copy.hint }}
    </p>
  </div>
</template>

<style scoped>
.dw-demo {
  display: grid;
  gap: 16px;
  color: var(--tx-text-color-primary);
  font-size: 13px;
}

.dw-demo__controls {
  display: flex;
  flex-wrap: wrap;
  gap: 14px 24px;
  align-items: center;
}

.dw-demo__group {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.dw-demo__label {
  font-size: 12px;
  color: var(--tx-text-color-regular);
}

.dw-demo__pills {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.dw-demo__stage {
  display: flex;
  justify-content: center;
  padding: 28px 16px;
  border-radius: 16px;
  background: var(--tx-fill-color-lighter);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dw-demo__wave {
  width: min(360px, 100%);
  border-radius: 24px;
  overflow: hidden;
  box-shadow:
    inset 0 0 0 1px var(--tx-border-color),
    0 20px 44px -26px rgba(0, 0, 0, 0.45);
}

.dw-demo__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 26px 20px 20px;
  background: var(--tx-bg-color-overlay, var(--tx-bg-color));
  color: var(--tx-text-color-primary);
}

.dw-demo__card--sent {
  background: var(--tx-bg-color);
}

.dw-demo__avatar,
.dw-demo__check {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  margin-bottom: 12px;
  border-radius: 50%;
  font-size: 16px;
  font-weight: 600;
}

.dw-demo__avatar {
  background: linear-gradient(135deg, #2a3441, #4a5568);
  color: #fff;
}

.dw-demo__check {
  background: #22c55e;
  color: #fff;
}

.dw-demo__eyebrow {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--tx-text-color-regular);
}

.dw-demo__eyebrow strong {
  font-weight: 500;
  color: var(--tx-text-color-primary);
}

.dw-demo__amount {
  margin: 0 0 18px;
  font-size: 28px;
  font-weight: 600;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.dw-demo__rows {
  width: 100%;
  margin: 0;
  padding: 4px 14px;
  border-radius: 14px;
  background: var(--tx-fill-color-light);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter);
}

.dw-demo__rows > div {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 9px 0;
  font-size: 13px;
}

.dw-demo__rows > div + div {
  border-top: 1px solid var(--tx-border-color-lighter);
}

.dw-demo__rows dt {
  color: var(--tx-text-color-regular);
}

.dw-demo__rows dd {
  margin: 0;
  font-weight: 500;
}

.dw-demo__spacer {
  height: 62px;
}

.dw-demo__overlay-bar {
  display: flex;
  align-items: flex-end;
  width: 100%;
  height: 100%;
  padding: 20px;
  box-sizing: border-box;
  pointer-events: none;
}

.dw-demo__cta {
  width: 100%;
  height: 44px;
  border: 0;
  border-radius: 999px;
  background: var(--tx-text-color-primary);
  color: var(--tx-bg-color);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  pointer-events: auto;
}

.dw-demo__cta:focus-visible {
  outline: 2px solid var(--tx-color-primary);
  outline-offset: 2px;
}

.dw-demo__hint {
  margin: 0;
  font-size: 12px;
  color: var(--tx-text-color-regular);
}
</style>
