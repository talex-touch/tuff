<script setup lang="ts">
import { ref } from 'vue'
const { locale } = useI18n()
const accelBoost = ref('')
const indicatorVariant = ref('')
const offsetMaxPx = ref('')
const placement = ref('')
const preset = ref('')
const springDamping = ref('')
const springStiffness = ref('')
const tiltMaxDeg = ref('')
const tiltMode = ref('')
const tooltipDistortSkewDeg = ref(false)
const tooltipJelly = ref('')
const tooltipJellyDecay = ref('')
const tooltipJellyFrequency = ref('')
const tooltipJellyRotateDeg = ref('')
const tooltipJellySkewDeg = ref('')
const tooltipJellySquash = ref('')
const tooltipJellyTriggerAccel = ref('')
const tooltipMotion = ref('')
const tooltipMotionBlurPx = ref('')
const tooltipMotionDuration = ref('')
const trigger = ref('')
const value = ref('')
</script>

<template>
  <div v-if="locale === 'zh'">
      <div style="display: flex; flex-direction: column; gap: 12px; width: 560px;">
        <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              preset
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="preset" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="current">
                  基础
                </TxRadio>
                <TxRadio value="tofu">
                  撞豆腐
                </TxRadio>
                <TxRadio value="jelly">
                  果冻超Q
                </TxRadio>
                <TxRadio value="soft">
                  软糯
                </TxRadio>
                <TxRadio value="snappy">
                  干脆
                </TxRadio>
                <TxRadio value="extreme">
                  极限
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              预设参数
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              indicator
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="indicatorVariant" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="solid">
                  实色
                </TxRadio>
                <TxRadio value="outline">
                  边框
                </TxRadio>
                <TxRadio value="glass">
                  玻璃
                </TxRadio>
                <TxRadio value="blur">
                  模糊
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              指示器风格
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              tilt
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="tiltMode" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="on">
                  On
                </TxRadio>
                <TxRadio value="off">
                  Off
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              是否启用倾斜/追尾
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              placement
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="placement" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="top">
                  Top
                </TxRadio>
                <TxRadio value="bottom">
                  Bottom
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              提示位置
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              trigger
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="trigger" type="button" :indicator-variant="indicatorVariant">
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
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              显示时机
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              motion
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="tooltipMotion" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="blur">
                  Blur
                </TxRadio>
                <TxRadio value="fade">
                  Fade
                </TxRadio>
                <TxRadio value="none">
                  None
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              出现/消失动效
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jelly
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="tooltipJelly" type="button" :indicator-variant="indicatorVariant">
                <TxRadio :value="true">
                  On
                </TxRadio>
                <TxRadio :value="false">
                  Off
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              果冻 Q 弹扭曲
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              tiltMaxDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tiltMaxDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              最大倾斜角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              offsetMaxPx
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="offsetMaxPx" :min="0" :max="48" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              最大追尾偏移
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              accelBoost
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="accelBoost" :min="0" :max="1" :step="0.05" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              加速度加成
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              springStiffness
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="springStiffness" :min="80" :max="520" :step="10" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              弹簧刚度（硬/快）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              springDamping
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="springDamping" :min="10" :max="60" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              弹簧阻尼（收敛）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              motionDuration
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipMotionDuration" :min="0" :max="360" :step="10" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              动效时长（ms）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              motionBlurPx
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipMotionBlurPx" :min="0" :max="20" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              模糊强度（px）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              distortSkewDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipDistortSkewDeg" :min="0" :max="18" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              挤压扭曲角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyFrequency
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyFrequency" :min="0" :max="18" :step="0.5" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              果冻频率（Hz）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyDecay
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyDecay" :min="0" :max="30" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              衰减（越大越快停）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyRotateDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyRotateDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              旋转角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellySkewDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellySkewDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              扭曲角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellySquash
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellySquash" :min="0" :max="0.5" :step="0.01" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              挤压强度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyTriggerAccel
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyTriggerAccel" :min="600" :max="6000" :step="100" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              触发阈值（越小越容易）
            </div>
          </div>
        </div>

        <div style="padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
          <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
            Playground
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
  </div>
  <div v-else>
      <div style="display: flex; flex-direction: column; gap: 12px; width: 560px;">
        <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              preset
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="preset" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="current">
                  基础
                </TxRadio>
                <TxRadio value="tofu">
                  撞豆腐
                </TxRadio>
                <TxRadio value="jelly">
                  果冻超Q
                </TxRadio>
                <TxRadio value="soft">
                  软糯
                </TxRadio>
                <TxRadio value="snappy">
                  干脆
                </TxRadio>
                <TxRadio value="extreme">
                  极限
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              预设参数
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              indicator
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="indicatorVariant" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="solid">
                  实色
                </TxRadio>
                <TxRadio value="outline">
                  边框
                </TxRadio>
                <TxRadio value="glass">
                  玻璃
                </TxRadio>
                <TxRadio value="blur">
                  模糊
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              指示器风格
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              tilt
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="tiltMode" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="on">
                  On
                </TxRadio>
                <TxRadio value="off">
                  Off
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              是否启用倾斜/追尾
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              placement
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="placement" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="top">
                  Top
                </TxRadio>
                <TxRadio value="bottom">
                  Bottom
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              提示位置
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              trigger
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="trigger" type="button" :indicator-variant="indicatorVariant">
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
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              显示时机
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              motion
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="tooltipMotion" type="button" :indicator-variant="indicatorVariant">
                <TxRadio value="blur">
                  Blur
                </TxRadio>
                <TxRadio value="fade">
                  Fade
                </TxRadio>
                <TxRadio value="none">
                  None
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              出现/消失动效
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jelly
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxRadioGroup v-model="tooltipJelly" type="button" :indicator-variant="indicatorVariant">
                <TxRadio :value="true">
                  On
                </TxRadio>
                <TxRadio :value="false">
                  Off
                </TxRadio>
              </TxRadioGroup>
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              果冻 Q 弹扭曲
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 10px; padding: 14px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              tiltMaxDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tiltMaxDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              最大倾斜角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              offsetMaxPx
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="offsetMaxPx" :min="0" :max="48" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              最大追尾偏移
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              accelBoost
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="accelBoost" :min="0" :max="1" :step="0.05" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              加速度加成
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              springStiffness
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="springStiffness" :min="80" :max="520" :step="10" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              弹簧刚度（硬/快）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              springDamping
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="springDamping" :min="10" :max="60" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              弹簧阻尼（收敛）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              motionDuration
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipMotionDuration" :min="0" :max="360" :step="10" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              动效时长（ms）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              motionBlurPx
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipMotionBlurPx" :min="0" :max="20" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              模糊强度（px）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              distortSkewDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipDistortSkewDeg" :min="0" :max="18" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              挤压扭曲角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyFrequency
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyFrequency" :min="0" :max="18" :step="0.5" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              果冻频率（Hz）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyDecay
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyDecay" :min="0" :max="30" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              衰减（越大越快停）
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyRotateDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyRotateDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              旋转角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellySkewDeg
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellySkewDeg" :min="0" :max="24" :step="1" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              扭曲角度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellySquash
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellySquash" :min="0" :max="0.5" :step="0.01" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              挤压强度
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 110px; font-size: 12px; opacity: 0.72;">
              jellyTriggerAccel
            </div>
            <div style="flex: 1; min-width: 0;">
              <TxSlider v-model="tooltipJellyTriggerAccel" :min="600" :max="6000" :step="100" show-value :show-tooltip="false" />
            </div>
            <div style="width: 140px; font-size: 12px; opacity: 0.62;">
              触发阈值（越小越容易）
            </div>
          </div>
        </div>

        <div style="padding: 16px; border: 1px solid var(--tx-border-color); border-radius: 12px;">
          <div style="font-size: 12px; opacity: 0.72; margin-bottom: 8px;">
            Playground
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
  </div>
</template>
