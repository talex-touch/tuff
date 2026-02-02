<script setup lang="ts">
import { ref, watch } from 'vue'
import TuffAiChatDemo from './TuffAiChatDemo.vue'
import TuffAiAssistDemo from './TuffAiAssistDemo.vue'
import TuffAiPreviewDemo from './TuffAiPreviewDemo.vue'
import type { AiDemoScenario } from './types'

const props = withDefaults(defineProps<{
  autoPlay?: boolean
  activeScenario?: AiDemoScenario['id']
}>(), {
  autoPlay: true,
  activeScenario: 'chat',
})

const activeScenario = ref<AiDemoScenario['id']>(props.activeScenario)

watch(() => props.activeScenario, (newVal) => {
  activeScenario.value = newVal
}, { immediate: true })
</script>

<template>
  <div class="ai-demo">
    <div class="ai-demo__content">
      <Transition name="fade" mode="out-in">
        <TuffAiChatDemo
          v-if="activeScenario === 'chat'"
          :active="activeScenario === 'chat'"
          :auto-play="autoPlay"
        />
        <TuffAiAssistDemo
          v-else-if="activeScenario === 'assist'"
          :active="activeScenario === 'assist'"
          :auto-play="autoPlay"
        />
        <TuffAiPreviewDemo
          v-else-if="activeScenario === 'preview'"
          :active="activeScenario === 'preview'"
          :auto-play="autoPlay"
        />
      </Transition>
    </div>
  </div>
</template>

<style scoped>
.ai-demo {
  width: 100%;
  height: 100%;
  min-height: 560px;
}

.ai-demo__content {
  width: 100%;
  height: 100%;
  position: relative;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.4s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
