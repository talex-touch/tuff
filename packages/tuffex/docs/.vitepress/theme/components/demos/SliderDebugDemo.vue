<script setup lang="ts">
import { ref } from 'vue'

const value = ref(50)
</script>

<template>
  <div style="display: flex; flex-direction: column; gap: 20px; width: 500px;">
    <div>
      <h4>Test 1: 始终显示tooltip + 旋转开启</h4>
      <TxSlider
        v-model="value"
        :min="0"
        :max="100"
        :step="1"
        show-value
        show-tooltip
        tooltip-trigger="always"
        :tooltip-tilt="true"
        :tooltip-tilt-max-deg="20"
        :tooltip-offset-max-px="25"
      />
    </div>

    <div>
      <h4>Test 2: 拖动显示 + 旋转开启 + 更敏感参数</h4>
      <TxSlider
        v-model="value"
        :min="0"
        :max="100"
        :step="1"
        show-value
        show-tooltip
        tooltip-trigger="drag"
        :tooltip-tilt="true"
        :tooltip-tilt-max-deg="30"
        :tooltip-offset-max-px="40"
        :tooltip-accel-boost="0.8"
        :tooltip-spring-stiffness="100"
        :tooltip-spring-damping="15"
      />
    </div>

    <div>
      <h4>Test 3: hover显示 + 旋转开启</h4>
      <TxSlider
        v-model="value"
        :min="0"
        :max="100"
        :step="1"
        show-value
        show-tooltip
        tooltip-trigger="hover"
        :tooltip-tilt="true"
        :tooltip-tilt-max-deg="15"
        :tooltip-offset-max-px="20"
      />
    </div>

    <div style="margin-top: 20px; padding: 12px; background: rgba(255,255,255,0.05); border-radius: 8px;">
      <div style="font-size: 12px; opacity: 0.8;">
        当前值: {{ value }}<br>
        测试说明：<br>
        - Test 1: tooltip应该始终可见，快速拖动应该看到旋转<br>
        - Test 2: 只在拖动时显示tooltip，使用更敏感的参数<br>
        - Test 3: hover或拖动时显示tooltip
      </div>
    </div>
  </div>
</template>
