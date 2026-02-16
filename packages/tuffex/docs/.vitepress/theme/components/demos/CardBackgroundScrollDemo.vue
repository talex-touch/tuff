<script setup lang="ts">
import { computed, ref } from 'vue'

type Bg = 'blur' | 'glass' | 'refraction' | 'mask'
type CardVariant = 'solid' | 'dashed' | 'plain'
type CardShadow = 'none' | 'soft' | 'medium'
type RefractionProfile = 'soft' | 'filmic' | 'cinematic'
type RefractionTone = 'mist' | 'balanced' | 'vivid'
type RefractionPresetGroup = 'core' | 'filmic'

interface RefractionPreset {
  id: string
  name: string
  group: RefractionPresetGroup
  profile: RefractionProfile
  tone: RefractionTone
  strength: number
  angle: number
  blurAmount: number
  overlayOpacity: number
  followIntensity: number
  spring: boolean
  springStiffness: number
  springDamping: number
}

const refractionPresetGroups: Array<{ id: RefractionPresetGroup, name: string }> = [
  { id: 'filmic', name: 'Filmic Set' },
  { id: 'core', name: 'Core Set' },
]

const refractionPresets: RefractionPreset[] = [
  {
    id: 'soft-mist',
    name: 'Soft Mist',
    group: 'core',
    profile: 'soft',
    tone: 'mist',
    strength: 42,
    angle: -16,
    blurAmount: 16,
    overlayOpacity: 0.16,
    followIntensity: 0.34,
    spring: true,
    springStiffness: 0.14,
    springDamping: 0.88,
  },
  {
    id: 'filmic-classic',
    name: 'Filmic Classic',
    group: 'core',
    profile: 'filmic',
    tone: 'balanced',
    strength: 62,
    angle: -24,
    blurAmount: 22,
    overlayOpacity: 0.22,
    followIntensity: 0.5,
    spring: true,
    springStiffness: 0.18,
    springDamping: 0.84,
  },
  {
    id: 'cinematic-rgb',
    name: 'Cinematic RGB',
    group: 'core',
    profile: 'cinematic',
    tone: 'vivid',
    strength: 82,
    angle: -34,
    blurAmount: 26,
    overlayOpacity: 0.28,
    followIntensity: 0.64,
    spring: true,
    springStiffness: 0.24,
    springDamping: 0.78,
  },
  {
    id: 'sharp-glass',
    name: 'Sharp Glass',
    group: 'core',
    profile: 'filmic',
    tone: 'vivid',
    strength: 70,
    angle: 14,
    blurAmount: 10,
    overlayOpacity: 0.12,
    followIntensity: 0.46,
    spring: false,
    springStiffness: 0.2,
    springDamping: 0.8,
  },
  {
    id: 'filmic-bloom',
    name: 'Bloom Halo',
    group: 'filmic',
    profile: 'filmic',
    tone: 'vivid',
    strength: 66,
    angle: -18,
    blurAmount: 30,
    overlayOpacity: 0.34,
    followIntensity: 0.56,
    spring: true,
    springStiffness: 0.16,
    springDamping: 0.86,
  },
  {
    id: 'filmic-chrome',
    name: 'Chrome Split',
    group: 'filmic',
    profile: 'cinematic',
    tone: 'vivid',
    strength: 88,
    angle: -42,
    blurAmount: 24,
    overlayOpacity: 0.24,
    followIntensity: 0.7,
    spring: true,
    springStiffness: 0.28,
    springDamping: 0.76,
  },
  {
    id: 'filmic-prism',
    name: 'Prism Noir',
    group: 'filmic',
    profile: 'cinematic',
    tone: 'balanced',
    strength: 78,
    angle: 28,
    blurAmount: 18,
    overlayOpacity: 0.2,
    followIntensity: 0.62,
    spring: true,
    springStiffness: 0.22,
    springDamping: 0.8,
  },
]

const bg = ref<Bg>('refraction')
const variant = ref<CardVariant>('solid')
const shadow = ref<CardShadow>('soft')
const radius = ref(18)
const padding = ref(14)
const clickable = ref(false)
const loading = ref(false)
const disabled = ref(false)
const inertial = ref(false)
const inertialMaxOffset = ref(22)
const inertialRebound = ref(0.12)

const glassBlur = ref(true)
const glassBlurAmount = ref(22)
const glassOverlay = ref(true)
const glassOverlayOpacity = ref(0.22)

const refractionStrength = ref(62)
const refractionProfile = ref<RefractionProfile>('filmic')
const refractionTone = ref<RefractionTone>('vivid')
const refractionAngle = ref(-24)
const refractionFollowMouse = ref(true)
const refractionFollowIntensity = ref(0.5)
const refractionLightSpring = ref(true)
const refractionLightSpringStiffness = ref(0.18)
const refractionLightSpringDamping = ref(0.84)
const activePresetGroup = ref<RefractionPresetGroup>('filmic')
const activePresetId = ref('filmic-bloom')

const visibleRefractionPresets = computed(() =>
  refractionPresets.filter(item => item.group === activePresetGroup.value),
)

const sliderCommon = { showValue: true as const }
const formatFixed2 = (value: number) => value.toFixed(2)
const formatDeg = (value: number) => `${Math.round(value)}deg`

function applyRefractionPreset(id: string) {
  const preset = refractionPresets.find(item => item.id === id)
  if (!preset)
    return

  activePresetId.value = preset.id
  activePresetGroup.value = preset.group
  bg.value = 'refraction'
  refractionProfile.value = preset.profile
  refractionTone.value = preset.tone
  refractionStrength.value = preset.strength
  refractionAngle.value = preset.angle
  glassBlurAmount.value = preset.blurAmount
  glassOverlayOpacity.value = preset.overlayOpacity
  refractionFollowIntensity.value = preset.followIntensity
  refractionLightSpring.value = preset.spring
  refractionLightSpringStiffness.value = preset.springStiffness
  refractionLightSpringDamping.value = preset.springDamping
}

function switchRefractionPresetGroup(group: RefractionPresetGroup) {
  activePresetGroup.value = group
  const nextPreset = refractionPresets.find(item => item.group === group)
  if (!nextPreset)
    return
  applyRefractionPreset(nextPreset.id)
}

applyRefractionPreset(activePresetId.value)
</script>

<template>
  <div class="tx-card-bg-demo">
    <TxRadioGroup v-model="bg">
      <TxRadio value="refraction">
        refraction
      </TxRadio>
      <TxRadio value="glass">
        glass
      </TxRadio>
      <TxRadio value="blur">
        blur
      </TxRadio>
      <TxRadio value="mask">
        mask
      </TxRadio>
    </TxRadioGroup>

    <div class="tx-card-bg-controls">
      <div class="tx-card-bg-control tx-card-bg-control--block">
        <span class="tx-card-bg-control-label">variant</span>
        <TxRadioGroup v-model="variant" size="small">
          <TxRadio value="solid">
            solid
          </TxRadio>
          <TxRadio value="dashed">
            dashed
          </TxRadio>
          <TxRadio value="plain">
            plain
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div class="tx-card-bg-control tx-card-bg-control--block">
        <span class="tx-card-bg-control-label">shadow</span>
        <TxRadioGroup v-model="shadow" size="small">
          <TxRadio value="none">
            none
          </TxRadio>
          <TxRadio value="soft">
            soft
          </TxRadio>
          <TxRadio value="medium">
            medium
          </TxRadio>
        </TxRadioGroup>
      </div>

      <label class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">radius</span>
        <TxSlider
          v-model="radius"
          :min="10"
          :max="28"
          :step="1"
          v-bind="sliderCommon"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">padding</span>
        <TxSlider
          v-model="padding"
          :min="8"
          :max="24"
          :step="1"
          v-bind="sliderCommon"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">clickable</span>
        <TxSwitch v-model="clickable" />
      </label>

      <label class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">loading</span>
        <TxSwitch v-model="loading" />
      </label>

      <label class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">disabled</span>
        <TxSwitch v-model="disabled" />
      </label>

      <label class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">inertial</span>
        <TxSwitch v-model="inertial" />
      </label>

      <label v-if="inertial" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">max offset</span>
        <TxSlider
          v-model="inertialMaxOffset"
          :min="0"
          :max="40"
          :step="1"
          v-bind="sliderCommon"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label v-if="inertial" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">rebound</span>
        <TxSlider
          v-model="inertialRebound"
          :min="0"
          :max="1"
          :step="0.02"
          v-bind="sliderCommon"
          :format-value="formatFixed2"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label v-if="bg === 'glass' || bg === 'refraction'" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">glass blur</span>
        <TxSwitch v-model="glassBlur" />
      </label>

      <label v-if="(bg === 'glass' || bg === 'refraction') && glassBlur" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">blur</span>
        <TxSlider
          v-model="glassBlurAmount"
          :min="0"
          :max="40"
          :step="1"
          v-bind="sliderCommon"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label v-if="bg === 'glass' || bg === 'refraction'" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">overlay</span>
        <TxSwitch v-model="glassOverlay" />
      </label>

      <label v-if="(bg === 'glass' || bg === 'refraction') && glassOverlay" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">opacity</span>
        <TxSlider
          v-model="glassOverlayOpacity"
          :min="0"
          :max="0.6"
          :step="0.02"
          v-bind="sliderCommon"
          :format-value="formatFixed2"
          class="tx-card-bg-control-slider"
        />
      </label>

      <div v-if="bg === 'refraction'" class="tx-card-bg-control tx-card-bg-control--block">
        <span class="tx-card-bg-control-label">preset</span>
        <div class="tx-card-bg-preset-group-row">
          <TxButton
            v-for="group in refractionPresetGroups"
            :key="group.id"
            class="tx-card-bg-preset-group"
            :variant="activePresetGroup === group.id ? 'primary' : 'outline'"
            size="small"
            @click="switchRefractionPresetGroup(group.id)"
          >
            {{ group.name }}
          </TxButton>
        </div>
        <div class="tx-card-bg-preset-row">
          <TxButton
            v-for="preset in visibleRefractionPresets"
            :key="preset.id"
            class="tx-card-bg-preset"
            :variant="activePresetId === preset.id ? 'primary' : 'outline'"
            size="small"
            @click="applyRefractionPreset(preset.id)"
          >
            {{ preset.name }}
          </TxButton>
        </div>
      </div>

      <label v-if="bg === 'refraction'" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">strength</span>
        <TxSlider
          v-model="refractionStrength"
          :min="0"
          :max="100"
          :step="1"
          v-bind="sliderCommon"
          class="tx-card-bg-control-slider"
        />
      </label>

      <div v-if="bg === 'refraction'" class="tx-card-bg-control tx-card-bg-control--block">
        <span class="tx-card-bg-control-label">profile</span>
        <TxRadioGroup v-model="refractionProfile" size="small">
          <TxRadio value="filmic">
            filmic
          </TxRadio>
          <TxRadio value="soft">
            soft
          </TxRadio>
          <TxRadio value="cinematic">
            cinematic
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div v-if="bg === 'refraction'" class="tx-card-bg-control tx-card-bg-control--block">
        <span class="tx-card-bg-control-label">tone</span>
        <TxRadioGroup v-model="refractionTone" size="small">
          <TxRadio value="vivid">
            vivid
          </TxRadio>
          <TxRadio value="balanced">
            balanced
          </TxRadio>
          <TxRadio value="mist">
            mist
          </TxRadio>
        </TxRadioGroup>
      </div>

      <label v-if="bg === 'refraction'" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">angle</span>
        <TxSlider
          v-model="refractionAngle"
          :min="-180"
          :max="180"
          :step="1"
          v-bind="sliderCommon"
          :format-value="formatDeg"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label v-if="bg === 'refraction'" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">follow mouse</span>
        <TxSwitch v-model="refractionFollowMouse" />
      </label>

      <label v-if="bg === 'refraction' && refractionFollowMouse" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">follow intensity</span>
        <TxSlider
          v-model="refractionFollowIntensity"
          :min="0"
          :max="1"
          :step="0.02"
          v-bind="sliderCommon"
          :format-value="formatFixed2"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label v-if="bg === 'refraction' && refractionFollowMouse" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">light spring</span>
        <TxSwitch v-model="refractionLightSpring" />
      </label>

      <label v-if="bg === 'refraction' && refractionFollowMouse && refractionLightSpring" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">spring stiffness</span>
        <TxSlider
          v-model="refractionLightSpringStiffness"
          :min="0.01"
          :max="0.55"
          :step="0.01"
          v-bind="sliderCommon"
          :format-value="formatFixed2"
          class="tx-card-bg-control-slider"
        />
      </label>

      <label v-if="bg === 'refraction' && refractionFollowMouse && refractionLightSpring" class="tx-card-bg-control">
        <span class="tx-card-bg-control-label">spring damping</span>
        <TxSlider
          v-model="refractionLightSpringDamping"
          :min="0.55"
          :max="0.99"
          :step="0.01"
          v-bind="sliderCommon"
          :format-value="formatFixed2"
          class="tx-card-bg-control-slider"
        />
      </label>
    </div>

    <div class="tx-card-bg-stage">
      <div class="tx-card-bg-scroll">
        <article class="tx-card-bg-article">
          <div class="tx-card-bg-hero" />

          <h3 class="tx-card-bg-title">
            Behind content: Article layout
          </h3>
          <p class="tx-card-bg-meta">
            Dec 25, 2025 · 5 min read
          </p>

          <p class="tx-card-bg-p">
            This demo intentionally uses neutral text and image blocks to help you judge how
            refraction / glass / blur / mask behaves on the same background.
          </p>

          <div class="tx-card-bg-grid">
            <div class="tx-card-bg-img" />
            <div class="tx-card-bg-img is-light" />
          </div>

          <p class="tx-card-bg-p">
            Scroll the content behind. The card stays floating above, similar to a sticky overlay.
            Use the switch to change background.
          </p>

          <div class="tx-card-bg-grid">
            <div class="tx-card-bg-img is-wide" />
            <div class="tx-card-bg-img is-wide is-light" />
          </div>

          <p class="tx-card-bg-p">
            End.
          </p>
          <div class="tx-card-bg-spacer" />
        </article>
      </div>

      <div class="tx-card-bg-overlay">
        <div class="tx-card-bg-card">
          <TxCard
            :variant="variant"
            :background="bg"
            :shadow="shadow"
            :radius="radius"
            :padding="padding"
            :clickable="clickable"
            :loading="loading"
            :disabled="disabled"
            :inertial="inertial"
            :inertial-max-offset="inertialMaxOffset"
            :inertial-rebound="inertialRebound"
            :glass-blur="glassBlur"
            :glass-blur-amount="glassBlurAmount"
            :glass-overlay="glassOverlay"
            :glass-overlay-opacity="glassOverlayOpacity"
            :refraction-strength="refractionStrength"
            :refraction-profile="refractionProfile"
            :refraction-tone="refractionTone"
            :refraction-angle="refractionAngle"
            :refraction-light-follow-mouse="refractionFollowMouse"
            :refraction-light-follow-intensity="refractionFollowIntensity"
            :refraction-light-spring="refractionLightSpring"
            :refraction-light-spring-stiffness="refractionLightSpringStiffness"
            :refraction-light-spring-damping="refractionLightSpringDamping"
            class="tx-card-bg-card__inner"
          >
            <template #header>
              <div class="tx-card-bg-card-header">
                <div class="tx-card-bg-card-title">
                  TxCard
                </div>
                <div class="tx-card-bg-card-meta">
                  bg={{ bg }} · {{ refractionProfile }} / {{ refractionTone }}
                </div>
              </div>
            </template>

            <div class="tx-card-bg-skeleton">
              <div class="tx-card-bg-skeleton-line" />
              <div class="tx-card-bg-skeleton-line tx-card-bg-skeleton-line--w78" />
              <div class="tx-card-bg-skeleton-line tx-card-bg-skeleton-line--w64" />
              <div class="tx-card-bg-skeleton-row">
                <div class="tx-card-bg-skeleton-avatar" />
                <div class="tx-card-bg-skeleton-col">
                  <div class="tx-card-bg-skeleton-line tx-card-bg-skeleton-line--small" />
                  <div class="tx-card-bg-skeleton-line tx-card-bg-skeleton-line--small tx-card-bg-skeleton-line--w70" />
                </div>
              </div>
            </div>
          </TxCard>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tx-card-bg-demo {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 100%;
}

.tx-card-bg-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.tx-card-bg-control {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}

.tx-card-bg-control-slider {
  width: 240px;
}

.tx-card-bg-control--block {
  width: 100%;
  align-items: flex-start;
}

.tx-card-bg-control-label {
  color: var(--tx-text-color-secondary, #909399);
}

.tx-card-bg-preset-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tx-card-bg-preset-group-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 8px;
}

.tx-card-bg-stage {
  position: relative;
  height: 420px;
  border-radius: 16px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 65%, transparent);
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tx-fill-color-lighter, #fafafa) 75%, transparent) 0%,
      color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 82%, transparent) 100%
    );
}

.tx-card-bg-scroll {
  position: absolute;
  inset: 0;
  overflow-y: auto;
}

.tx-card-bg-article {
  padding: 22px;
  line-height: 1.7;
}

.tx-card-bg-hero {
  height: 120px;
  border-radius: 14px;
  background:
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--tx-text-color-primary, #303133) 8%, transparent),
      color-mix(in srgb, var(--tx-text-color-primary, #303133) 3%, transparent)
    );
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
  margin-bottom: 14px;
}

.tx-card-bg-title {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--tx-text-color-primary, #303133);
}

.tx-card-bg-meta {
  margin: 0 0 14px 0;
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-card-bg-p {
  margin: 0 0 14px 0;
  font-size: 13px;
  color: var(--tx-text-color-regular, #606266);
}

.tx-card-bg-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin: 14px 0;
}

.tx-card-bg-img {
  height: 96px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--tx-border-color-light, #e4e7ed) 72%, transparent);
}

.tx-card-bg-img.is-light {
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 6%, transparent);
}

.tx-card-bg-img.is-wide {
  height: 120px;
}

.tx-card-bg-spacer {
  height: 240px;
}

.tx-card-bg-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 22px;
  pointer-events: none;
}

.tx-card-bg-card {
  position: relative;
  width: 100%;
  max-width: 320px;
  pointer-events: auto;
}

.tx-card-bg-card__inner {
  position: relative;
  z-index: 1;
  --tx-card-fake-background: color-mix(in srgb, var(--tx-bg-color-overlay, #fff) 94%, transparent);
}

.tx-card-bg-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.tx-card-bg-card-title {
  font-weight: 700;
  color: var(--tx-text-color-primary, #303133);
}

.tx-card-bg-card-meta {
  font-size: 12px;
  color: var(--tx-text-color-secondary, #909399);
}

.tx-card-bg-skeleton {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tx-card-bg-skeleton-row {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.tx-card-bg-skeleton-col {
  flex: 1;
  display: grid;
  gap: 6px;
}

.tx-card-bg-skeleton-line {
  height: 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 12%, transparent);
}

.tx-card-bg-skeleton-line--small {
  height: 10px;
}

.tx-card-bg-skeleton-line--w78 {
  width: 78%;
}

.tx-card-bg-skeleton-line--w70 {
  width: 70%;
}

.tx-card-bg-skeleton-line--w64 {
  width: 64%;
}

.tx-card-bg-skeleton-avatar {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--tx-text-color-primary, #303133) 12%, transparent);
}
</style>
