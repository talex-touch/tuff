<script setup lang="ts">
import { computed, ref } from 'vue'
import GlassSurfaceLensStage from './GlassSurfaceLensStage.vue'

const { locale } = useI18n()

const bezel = ref(22)
const thickness = ref(40)
const ior = ref(1.5)
const zoom = ref(1.1)
const dispersion = ref(0)
const rimSaturation = ref(4)
const profile = ref<'squircle' | 'circle'>('squircle')

const hint = computed(() => (locale.value === 'zh'
  ? '折射只发生在边缘一圈，中间几乎保持原样。'
  : 'Only the rim bends the page; the middle stays almost as it was.'))
</script>

<template>
  <div class="glass-lens-demo">
    <GlassSurfaceLensStage :hint="hint">
      <TxGlassSurface
        engine="lens"
        :width="220"
        :height="140"
        :border-radius="70"
        :bezel="bezel"
        :thickness="thickness"
        :ior="ior"
        :zoom="zoom"
        :profile="profile"
        :dispersion="dispersion"
        :rim-saturation="rimSaturation"
      />
    </GlassSurfaceLensStage>

    <div class="glass-lens-demo__controls">
      <div class="glass-lens-demo__row">
        <span>bezel (px)</span>
        <TxSlider v-model="bezel" :min="2" :max="40" :step="1" show-value />
      </div>
      <div class="glass-lens-demo__row">
        <span>thickness (px)</span>
        <TxSlider v-model="thickness" :min="4" :max="80" :step="1" show-value />
      </div>
      <div class="glass-lens-demo__row">
        <span>ior</span>
        <TxSlider v-model="ior" :min="1" :max="3" :step="0.05" show-value />
      </div>
      <div class="glass-lens-demo__row">
        <span>zoom</span>
        <TxSlider v-model="zoom" :min="1" :max="1.6" :step="0.01" show-value />
      </div>
      <div class="glass-lens-demo__row">
        <span>dispersion</span>
        <TxSlider v-model="dispersion" :min="0" :max="0.5" :step="0.01" show-value />
      </div>
      <div class="glass-lens-demo__row">
        <span>rimSaturation</span>
        <TxSlider v-model="rimSaturation" :min="1" :max="12" :step="0.5" show-value />
      </div>
      <div class="glass-lens-demo__row">
        <span>profile</span>
        <TxRadioGroup v-model="profile" type="button">
          <TxRadio value="squircle">
            squircle
          </TxRadio>
          <TxRadio value="circle">
            circle
          </TxRadio>
        </TxRadioGroup>
      </div>
    </div>
  </div>
</template>

<style scoped>
.glass-lens-demo {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.glass-lens-demo__controls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px 16px;
}

.glass-lens-demo__row {
  display: grid;
  gap: 6px;
}

.glass-lens-demo__row > span {
  color: var(--tx-text-color-secondary);
  font-size: 12px;
}
</style>
