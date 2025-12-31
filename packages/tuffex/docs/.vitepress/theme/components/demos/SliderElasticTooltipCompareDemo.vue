<script setup lang="ts">
import { ref, watch } from 'vue'

const value = ref(30)

type IndicatorVariant = 'solid' | 'outline' | 'glass' | 'blur'

const indicatorVariant = ref<IndicatorVariant>('blur')

const tiltMode = ref<'on' | 'off'>('on')
const placement = ref<'top' | 'bottom'>('top')
const trigger = ref<'drag' | 'hover' | 'always'>('drag')

type PresetKey = 'current' | 'tofu' | 'jelly' | 'soft' | 'snappy' | 'extreme'

const preset = ref<PresetKey>('jelly')

type Preset = {
  tiltMaxDeg: number
  offsetMaxPx: number
  accelBoost: number
  springStiffness: number
  springDamping: number
  motion: 'blur' | 'fade' | 'none'
  motionDuration: number
  motionBlurPx: number
  distortSkewDeg: number
  jelly: boolean
  jellyFrequency: number
  jellyDecay: number
  jellyRotateDeg: number
  jellySkewDeg: number
  jellySquash: number
  jellyTriggerAccel: number
}

const currentPreset: Preset = {
  tiltMaxDeg: 18,
  offsetMaxPx: 28,
  accelBoost: 0.65,
  springStiffness: 320,
  springDamping: 24,
  motion: 'blur' as const,
  motionDuration: 160,
  motionBlurPx: 10,
  distortSkewDeg: 8,
  jelly: true,
  jellyFrequency: 8.5,
  jellyDecay: 10,
  jellyRotateDeg: 10,
  jellySkewDeg: 12,
  jellySquash: 0.16,
  jellyTriggerAccel: 2800,
}

const tofuPreset: Preset = {
  tiltMaxDeg: 20,
  offsetMaxPx: 34,
  accelBoost: 0.75,
  springStiffness: 420,
  springDamping: 28,
  motion: 'blur' as const,
  motionDuration: 180,
  motionBlurPx: 12,
  distortSkewDeg: 12,
  jelly: true,
  jellyFrequency: 9.5,
  jellyDecay: 9,
  jellyRotateDeg: 16,
  jellySkewDeg: 18,
  jellySquash: 0.26,
  jellyTriggerAccel: 2200,
}

const jellyPreset: Preset = {
  tiltMaxDeg: 22,
  offsetMaxPx: 36,
  accelBoost: 0.8,
  springStiffness: 420,
  springDamping: 26,
  motion: 'blur' as const,
  motionDuration: 180,
  motionBlurPx: 12,
  distortSkewDeg: 14,
  jelly: true,
  jellyFrequency: 11,
  jellyDecay: 6,
  jellyRotateDeg: 18,
  jellySkewDeg: 22,
  jellySquash: 0.32,
  jellyTriggerAccel: 1600,
}

const softPreset: Preset = {
  tiltMaxDeg: 16,
  offsetMaxPx: 30,
  accelBoost: 0.55,
  springStiffness: 240,
  springDamping: 26,
  motion: 'blur' as const,
  motionDuration: 200,
  motionBlurPx: 10,
  distortSkewDeg: 8,
  jelly: true,
  jellyFrequency: 7.5,
  jellyDecay: 8,
  jellyRotateDeg: 10,
  jellySkewDeg: 12,
  jellySquash: 0.2,
  jellyTriggerAccel: 2200,
}

const snappyPreset: Preset = {
  tiltMaxDeg: 18,
  offsetMaxPx: 26,
  accelBoost: 0.65,
  springStiffness: 460,
  springDamping: 34,
  motion: 'fade' as const,
  motionDuration: 140,
  motionBlurPx: 0,
  distortSkewDeg: 10,
  jelly: true,
  jellyFrequency: 9,
  jellyDecay: 14,
  jellyRotateDeg: 12,
  jellySkewDeg: 14,
  jellySquash: 0.18,
  jellyTriggerAccel: 2400,
}

const extremePreset: Preset = {
  tiltMaxDeg: 24,
  offsetMaxPx: 42,
  accelBoost: 1,
  springStiffness: 520,
  springDamping: 22,
  motion: 'blur' as const,
  motionDuration: 160,
  motionBlurPx: 14,
  distortSkewDeg: 18,
  jelly: true,
  jellyFrequency: 13,
  jellyDecay: 4.5,
  jellyRotateDeg: 22,
  jellySkewDeg: 24,
  jellySquash: 0.42,
  jellyTriggerAccel: 1100,
}

const presets: Record<PresetKey, Preset> = {
  current: currentPreset,
  tofu: tofuPreset,
  jelly: jellyPreset,
  soft: softPreset,
  snappy: snappyPreset,
  extreme: extremePreset,
}

const tiltMaxDeg = ref(currentPreset.tiltMaxDeg)
const offsetMaxPx = ref(currentPreset.offsetMaxPx)
const accelBoost = ref(currentPreset.accelBoost)
const springStiffness = ref(currentPreset.springStiffness)
const springDamping = ref(currentPreset.springDamping)

const tooltipMotion = ref<'blur' | 'fade' | 'none'>(currentPreset.motion)
const tooltipMotionDuration = ref(currentPreset.motionDuration)
const tooltipMotionBlurPx = ref(currentPreset.motionBlurPx)
const tooltipDistortSkewDeg = ref(currentPreset.distortSkewDeg)

const tooltipJelly = ref(currentPreset.jelly)
const tooltipJellyFrequency = ref(currentPreset.jellyFrequency)
const tooltipJellyDecay = ref(currentPreset.jellyDecay)
const tooltipJellyRotateDeg = ref(currentPreset.jellyRotateDeg)
const tooltipJellySkewDeg = ref(currentPreset.jellySkewDeg)
const tooltipJellySquash = ref(currentPreset.jellySquash)
const tooltipJellyTriggerAccel = ref(currentPreset.jellyTriggerAccel)

function applyPreset(p: Preset) {
  tiltMaxDeg.value = p.tiltMaxDeg
  offsetMaxPx.value = p.offsetMaxPx
  accelBoost.value = p.accelBoost
  springStiffness.value = p.springStiffness
  springDamping.value = p.springDamping
  tooltipMotion.value = p.motion
  tooltipMotionDuration.value = p.motionDuration
  tooltipMotionBlurPx.value = p.motionBlurPx
  tooltipDistortSkewDeg.value = p.distortSkewDeg

  tooltipJelly.value = p.jelly
  tooltipJellyFrequency.value = p.jellyFrequency
  tooltipJellyDecay.value = p.jellyDecay
  tooltipJellyRotateDeg.value = p.jellyRotateDeg
  tooltipJellySkewDeg.value = p.jellySkewDeg
  tooltipJellySquash.value = p.jellySquash
  tooltipJellyTriggerAccel.value = p.jellyTriggerAccel
}

watch(
  preset,
  (v) => {
    applyPreset(presets[v])
  },
  { immediate: true },
)
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px; width: 560px;">
    <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">preset</div>
        <div style="flex: 1; min-width: 0;">
          <TxRadioGroup v-model="preset" type="button" :indicator-variant="indicatorVariant">
            <TxRadio value="current">基础</TxRadio>
            <TxRadio value="tofu">撞豆腐</TxRadio>
            <TxRadio value="jelly">果冻超Q</TxRadio>
            <TxRadio value="soft">软糯</TxRadio>
            <TxRadio value="snappy">干脆</TxRadio>
            <TxRadio value="extreme">极限</TxRadio>
          </TxRadioGroup>
        </div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">预设参数</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">indicator</div>
        <div style="flex: 1; min-width: 0;">
          <TxRadioGroup v-model="indicatorVariant" type="button" :indicator-variant="indicatorVariant">
            <TxRadio value="solid">实色</TxRadio>
            <TxRadio value="outline">边框</TxRadio>
            <TxRadio value="glass">玻璃</TxRadio>
            <TxRadio value="blur">模糊</TxRadio>
          </TxRadioGroup>
        </div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">指示器风格</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">tilt</div>
        <div style="flex: 1; min-width: 0;">
          <TxRadioGroup v-model="tiltMode" type="button" :indicator-variant="indicatorVariant">
            <TxRadio value="on">On</TxRadio>
            <TxRadio value="off">Off</TxRadio>
          </TxRadioGroup>
        </div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">是否启用倾斜/追尾</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">placement</div>
        <div style="flex: 1; min-width: 0;">
          <TxRadioGroup v-model="placement" type="button" :indicator-variant="indicatorVariant">
            <TxRadio value="top">Top</TxRadio>
            <TxRadio value="bottom">Bottom</TxRadio>
          </TxRadioGroup>
        </div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">提示位置</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">trigger</div>
        <div style="flex: 1; min-width: 0;">
          <TxRadioGroup v-model="trigger" type="button" :indicator-variant="indicatorVariant">
            <TxRadio value="drag">Drag</TxRadio>
            <TxRadio value="hover">Hover</TxRadio>
            <TxRadio value="always">Always</TxRadio>
          </TxRadioGroup>
        </div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">显示时机</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">motion</div>
        <div style="flex: 1; min-width: 0;">
          <TxRadioGroup v-model="tooltipMotion" type="button" :indicator-variant="indicatorVariant">
            <TxRadio value="blur">Blur</TxRadio>
            <TxRadio value="fade">Fade</TxRadio>
            <TxRadio value="none">None</TxRadio>
          </TxRadioGroup>
        </div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">出现/消失动效</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">jelly</div>
        <div style="flex: 1; min-width: 0;">
          <TxRadioGroup v-model="tooltipJelly" type="button" :indicator-variant="indicatorVariant">
            <TxRadio :value="true">On</TxRadio>
            <TxRadio :value="false">Off</TxRadio>
          </TxRadioGroup>
        </div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">果冻 Q 弹扭曲</div>
      </div>
    </div>

    <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">tiltMaxDeg</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tiltMaxDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">最大倾斜角度</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">offsetMaxPx</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="offsetMaxPx" :min="0" :max="48" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">最大追尾偏移</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">accelBoost</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="accelBoost" :min="0" :max="1" :step="0.05" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">加速度加成</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">springStiffness</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="springStiffness" :min="80" :max="520" :step="10" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">弹簧刚度（硬/快）</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">springDamping</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="springDamping" :min="10" :max="60" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">弹簧阻尼（收敛）</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">motionDuration</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipMotionDuration" :min="0" :max="360" :step="10" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">动效时长（ms）</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">motionBlurPx</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipMotionBlurPx" :min="0" :max="20" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">模糊强度（px）</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">distortSkewDeg</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipDistortSkewDeg" :min="0" :max="18" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">挤压扭曲角度</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">jellyFrequency</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipJellyFrequency" :min="0" :max="18" :step="0.5" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">果冻频率（Hz）</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">jellyDecay</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipJellyDecay" :min="0" :max="30" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">衰减（越大越快停）</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">jellyRotateDeg</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipJellyRotateDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">旋转角度</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">jellySkewDeg</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipJellySkewDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">扭曲角度</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">jellySquash</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipJellySquash" :min="0" :max="0.5" :step="0.01" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">挤压强度</div>
      </div>

      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 110px; font-size: 12px; opacity: 0.72;">jellyTriggerAccel</div>
        <div style="flex: 1; min-width: 0;"><TxSlider v-model="tooltipJellyTriggerAccel" :min="600" :max="6000" :step="100" show-value :show-tooltip="false" /></div>
        <div style="width: 140px; font-size: 12px; opacity: 0.62;">触发阈值（越小越容易）</div>
      </div>
    </div>

    <div style="padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
      <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">Playground</div>

      <TxSlider
        v-model="value"
        :min="0"
        :max="100"
        :step="1"
        show-value
        :tooltip-tilt="tiltMode === 'on'"
        :tooltip-placement="placement"
        :tooltip-trigger="trigger"
        :tooltip-tilt-max-deg="tiltMaxDeg"
        :tooltip-offset-max-px="offsetMaxPx"
        :tooltip-accel-boost="accelBoost"
        :tooltip-spring-stiffness="springStiffness"
        :tooltip-spring-damping="springDamping"
        :tooltip-motion="tooltipMotion"
        :tooltip-motion-duration="tooltipMotionDuration"
        :tooltip-motion-blur-px="tooltipMotionBlurPx"
        :tooltip-distort-skew-deg="tooltipDistortSkewDeg"
        :tooltip-jelly="tooltipJelly"
        :tooltip-jelly-frequency="tooltipJellyFrequency"
        :tooltip-jelly-decay="tooltipJellyDecay"
        :tooltip-jelly-rotate-deg="tooltipJellyRotateDeg"
        :tooltip-jelly-skew-deg="tooltipJellySkewDeg"
        :tooltip-jelly-squash="tooltipJellySquash"
        :tooltip-jelly-trigger-accel="tooltipJellyTriggerAccel"
      />
    </div>
  </div>
</template>
