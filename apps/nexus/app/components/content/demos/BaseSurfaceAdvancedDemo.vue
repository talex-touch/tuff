<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()

type SurfaceMode = 'blur' | 'glass' | 'refraction'
type RefractionProfile = 'soft' | 'filmic' | 'cinematic'
type RefractionTone = 'mist' | 'balanced' | 'vivid'

const mode = ref<SurfaceMode>('refraction')
const profile = ref<RefractionProfile>('filmic')
const tone = ref<RefractionTone>('vivid')

const blur = ref(22)
const overlayOpacity = ref(0.16)
const filterSaturation = ref(1.9)
const filterContrast = ref(1.12)
const filterBrightness = ref(1.08)

const refractionStrength = ref(74)
const refractionAngle = ref(-24)
const refractionHaloOpacity = ref(0.28)
const displace = ref(0.76)
const distortionScale = ref(-280)
const redOffset = ref(3)
const greenOffset = ref(14)
const blueOffset = ref(27)
const lightX = ref(0.28)
const lightY = ref(0.24)

const sliderCommon = { showValue: true as const }
const formatFixed2 = (value: number) => value.toFixed(2)
const formatDeg = (value: number) => `${Math.round(value)}deg`

const labels = computed(() => {
  if (locale.value === 'zh') {
    return {
      title: 'BaseSurface Advanced',
      subtitle: '用于材质层底层参数实验：filter / glass / refraction 组合调参',
      mode: '模式',
      profile: 'Profile',
      tone: 'Tone',
      filterTitle: 'Filter Layer',
      refractionTitle: 'Refraction Layer',
      blur: 'blur',
      overlayOpacity: 'overlay opacity',
      filterSaturation: 'filter saturation',
      filterContrast: 'filter contrast',
      filterBrightness: 'filter brightness',
      refractionStrength: 'refraction strength',
      refractionAngle: 'refraction angle',
      refractionHaloOpacity: 'halo opacity',
      displace: 'displace',
      distortionScale: 'distortion scale',
      redOffset: 'red offset',
      greenOffset: 'green offset',
      blueOffset: 'blue offset',
      lightX: 'light x',
      lightY: 'light y',
      modeBlur: 'blur',
      modeGlass: 'glass',
      modeRefraction: 'refraction',
      profileSoft: 'soft',
      profileFilmic: 'filmic',
      profileCinematic: 'cinematic',
      toneMist: 'mist',
      toneBalanced: 'balanced',
      toneVivid: 'vivid',
      previewTitle: '实时预览',
      previewDesc: '优先用于材质探索；业务卡片建议使用 TxCard。',
    }
  }

  return {
    title: 'BaseSurface Advanced',
    subtitle: 'Low-level material lab for filter / glass / refraction tuning',
    mode: 'Mode',
    profile: 'Profile',
    tone: 'Tone',
    filterTitle: 'Filter Layer',
    refractionTitle: 'Refraction Layer',
    blur: 'blur',
    overlayOpacity: 'overlay opacity',
    filterSaturation: 'filter saturation',
    filterContrast: 'filter contrast',
    filterBrightness: 'filter brightness',
    refractionStrength: 'refraction strength',
    refractionAngle: 'refraction angle',
    refractionHaloOpacity: 'halo opacity',
    displace: 'displace',
    distortionScale: 'distortion scale',
    redOffset: 'red offset',
    greenOffset: 'green offset',
    blueOffset: 'blue offset',
    lightX: 'light x',
    lightY: 'light y',
    modeBlur: 'blur',
    modeGlass: 'glass',
    modeRefraction: 'refraction',
    profileSoft: 'soft',
    profileFilmic: 'filmic',
    profileCinematic: 'cinematic',
    toneMist: 'mist',
    toneBalanced: 'balanced',
    toneVivid: 'vivid',
    previewTitle: 'Live Preview',
    previewDesc: 'Use this for material experimentation; prefer TxCard for product-level cards.',
  }
})
</script>

<template>
  <div class="bs-adv">
    <div class="bs-adv__controls">
      <div class="bs-adv__intro">
        <div class="bs-adv__title">
          {{ labels.title }}
        </div>
        <div class="bs-adv__subtitle">
          {{ labels.subtitle }}
        </div>
      </div>

      <div class="bs-adv__row">
        <span class="bs-adv__label">{{ labels.mode }}</span>
        <TxRadioGroup v-model="mode" size="small">
          <TxRadio value="refraction">
            {{ labels.modeRefraction }}
          </TxRadio>
          <TxRadio value="glass">
            {{ labels.modeGlass }}
          </TxRadio>
          <TxRadio value="blur">
            {{ labels.modeBlur }}
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div v-if="mode === 'refraction'" class="bs-adv__row">
        <span class="bs-adv__label">{{ labels.profile }}</span>
        <TxRadioGroup v-model="profile" size="small">
          <TxRadio value="filmic">
            {{ labels.profileFilmic }}
          </TxRadio>
          <TxRadio value="soft">
            {{ labels.profileSoft }}
          </TxRadio>
          <TxRadio value="cinematic">
            {{ labels.profileCinematic }}
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div v-if="mode === 'refraction'" class="bs-adv__row">
        <span class="bs-adv__label">{{ labels.tone }}</span>
        <TxRadioGroup v-model="tone" size="small">
          <TxRadio value="vivid">
            {{ labels.toneVivid }}
          </TxRadio>
          <TxRadio value="balanced">
            {{ labels.toneBalanced }}
          </TxRadio>
          <TxRadio value="mist">
            {{ labels.toneMist }}
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div class="bs-adv__section">
        <div class="bs-adv__section-title">
          {{ labels.filterTitle }}
        </div>
        <label class="bs-adv__control">
          <span>{{ labels.blur }}</span>
          <TxSlider v-model="blur" :min="0" :max="40" :step="1" v-bind="sliderCommon" class="bs-adv__slider" />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.overlayOpacity }}</span>
          <TxSlider
            v-model="overlayOpacity"
            :min="0"
            :max="0.7"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.filterSaturation }}</span>
          <TxSlider
            v-model="filterSaturation"
            :min="0"
            :max="2.6"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.filterContrast }}</span>
          <TxSlider
            v-model="filterContrast"
            :min="0.5"
            :max="1.8"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.filterBrightness }}</span>
          <TxSlider
            v-model="filterBrightness"
            :min="0.6"
            :max="1.5"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
      </div>

      <div v-if="mode === 'refraction'" class="bs-adv__section">
        <div class="bs-adv__section-title">
          {{ labels.refractionTitle }}
        </div>
        <label class="bs-adv__control">
          <span>{{ labels.refractionStrength }}</span>
          <TxSlider v-model="refractionStrength" :min="0" :max="100" :step="1" v-bind="sliderCommon" class="bs-adv__slider" />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.refractionAngle }}</span>
          <TxSlider
            v-model="refractionAngle"
            :min="-180"
            :max="180"
            :step="1"
            v-bind="sliderCommon"
            :format-value="formatDeg"
            class="bs-adv__slider"
          />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.refractionHaloOpacity }}</span>
          <TxSlider
            v-model="refractionHaloOpacity"
            :min="0"
            :max="1"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.displace }}</span>
          <TxSlider
            v-model="displace"
            :min="0"
            :max="2"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.distortionScale }}</span>
          <TxSlider v-model="distortionScale" :min="-520" :max="-20" :step="1" v-bind="sliderCommon" class="bs-adv__slider" />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.redOffset }}</span>
          <TxSlider v-model="redOffset" :min="-40" :max="40" :step="1" v-bind="sliderCommon" class="bs-adv__slider" />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.greenOffset }}</span>
          <TxSlider v-model="greenOffset" :min="-40" :max="40" :step="1" v-bind="sliderCommon" class="bs-adv__slider" />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.blueOffset }}</span>
          <TxSlider v-model="blueOffset" :min="-40" :max="40" :step="1" v-bind="sliderCommon" class="bs-adv__slider" />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.lightX }}</span>
          <TxSlider
            v-model="lightX"
            :min="0"
            :max="1"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
        <label class="bs-adv__control">
          <span>{{ labels.lightY }}</span>
          <TxSlider
            v-model="lightY"
            :min="0"
            :max="1"
            :step="0.01"
            v-bind="sliderCommon"
            :format-value="formatFixed2"
            class="bs-adv__slider"
          />
        </label>
      </div>
    </div>

    <div class="bs-adv__stage">
      <div class="bs-adv__bg" />
      <TxBaseSurface
        :mode="mode"
        preset="card"
        :radius="18"
        :blur="blur"
        :overlay-opacity="overlayOpacity"
        :filter-saturation="filterSaturation"
        :filter-contrast="filterContrast"
        :filter-brightness="filterBrightness"
        :refraction-profile="profile"
        :refraction-tone="tone"
        :refraction-strength="refractionStrength"
        :refraction-angle="refractionAngle"
        :refraction-halo-opacity="refractionHaloOpacity"
        :displace="displace"
        :distortion-scale="distortionScale"
        :red-offset="redOffset"
        :green-offset="greenOffset"
        :blue-offset="blueOffset"
        :refraction-light-x="lightX"
        :refraction-light-y="lightY"
        class="bs-adv__surface"
      >
        <div class="bs-adv__preview-title">
          {{ labels.previewTitle }}
        </div>
        <div class="bs-adv__preview-desc">
          {{ labels.previewDesc }}
        </div>
      </TxBaseSurface>
    </div>
  </div>
</template>

<style scoped>
.bs-adv {
  display: grid;
  gap: 12px;
}

.bs-adv__controls {
  display: grid;
  gap: 10px;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 70%, transparent);
  background: color-mix(in srgb, var(--tx-fill-color-lighter, #fafafa) 75%, transparent);
}

.bs-adv__intro {
  display: grid;
  gap: 4px;
}

.bs-adv__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary, #303133);
}

.bs-adv__subtitle {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.bs-adv__row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.bs-adv__label {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.bs-adv__section {
  display: grid;
  gap: 8px;
}

.bs-adv__section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--tx-text-color-regular, #606266);
}

.bs-adv__control {
  display: grid;
  grid-template-columns: 138px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.bs-adv__slider {
  width: 100%;
}

.bs-adv__stage {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  min-height: 220px;
}

.bs-adv__bg {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(680px 340px at 8% 4%, color-mix(in srgb, var(--tx-color-primary, #409eff) 38%, transparent), transparent 62%),
    radial-gradient(560px 280px at 92% 8%, color-mix(in srgb, var(--tx-color-success, #67c23a) 26%, transparent), transparent 62%),
    radial-gradient(560px 280px at 35% 115%, color-mix(in srgb, var(--tx-color-warning, #e6a23c) 24%, transparent), transparent 64%),
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--tx-text-color-primary, #303133) 14%, var(--tx-bg-color-overlay, #fff)),
      color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 94%, transparent)
    );
}

.bs-adv__surface {
  position: relative;
  z-index: 1;
  margin: 18px;
  min-height: 184px;
  padding: 16px;
  display: grid;
  align-content: start;
  gap: 8px;
}

.bs-adv__preview-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary, #303133);
}

.bs-adv__preview-desc {
  font-size: 12px;
  line-height: 1.6;
  color: var(--tx-text-color-secondary, #909399);
}
</style>
