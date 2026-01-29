<script setup lang="ts">
import { ref } from 'vue'

const value = ref(30)
const tiltMode = ref<'on' | 'off'>('on')
const placement = ref<'top' | 'bottom'>('top')
const trigger = ref<'drag' | 'hover' | 'always'>('drag')

const tiltMaxDeg = ref(18)
const offsetMaxPx = ref(28)
const accelBoost = ref(0.65)
const springStiffness = ref(320)
const springDamping = ref(24)
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 12px; width: 420px;">
    <div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px;">
      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          tilt
        </div>
        <TxRadioGroup v-model="tiltMode" type="button">
          <TxRadio value="on">
            On
          </TxRadio>
          <TxRadio value="off">
            Off
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          placement
        </div>
        <TxRadioGroup v-model="placement" type="button">
          <TxRadio value="top">
            Top
          </TxRadio>
          <TxRadio value="bottom">
            Bottom
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          trigger
        </div>
        <TxRadioGroup v-model="trigger" type="button">
          <TxRadio value="drag">
            Drag
          </TxRadio>
          <TxRadio value="hover">
            Hover
          </TxRadio>
          <TxRadio value="always">
            Always
          </TxRadio>
        </TxRadioGroup>
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          value
        </div>
        <TxSlider v-model="value" :min="0" :max="100" :step="1" show-value :show-tooltip="false" />
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          tiltMaxDeg
        </div>
        <TxSlider v-model="tiltMaxDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" />
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          offsetMaxPx
        </div>
        <TxSlider v-model="offsetMaxPx" :min="0" :max="32" :step="1" show-value :show-tooltip="false" />
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          accelBoost
        </div>
        <TxSlider v-model="accelBoost" :min="0" :max="1" :step="0.05" show-value :show-tooltip="false" />
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          springStiffness
        </div>
        <TxSlider v-model="springStiffness" :min="80" :max="520" :step="10" show-value :show-tooltip="false" />
      </div>

      <div>
        <div style="font-size: 12px; opacity: 0.72; margin-bottom: 6px;">
          springDamping
        </div>
        <TxSlider v-model="springDamping" :min="10" :max="60" :step="1" show-value :show-tooltip="false" />
      </div>
    </div>

    <div style="padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
      <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
        Drag quickly / reverse direction
      </div>

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
      />
    </div>
  </div>
</template>
