<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

const { locale } = useI18n()

const asyncEnabled = ref(false)
const committing = ref(false)
const loadingOff = ref(false)
const loadingOn = ref(true)

let commitTimer: ReturnType<typeof setTimeout> | undefined

const labels = computed(() => (locale.value === 'zh'
  ? {
      async: '异步提交',
      off: '加载中 / 关闭',
      on: '加载中 / 开启',
    }
  : {
      async: 'Async commit',
      off: 'Loading / off',
      on: 'Loading / on',
    }))

// The switch stays on its previous side until the commit lands, so the ring
// marks which value is still pending rather than a state already applied.
function commit(next: boolean): void {
  committing.value = true
  commitTimer = setTimeout(() => {
    asyncEnabled.value = next
    committing.value = false
  }, 1200)
}

onBeforeUnmount(() => {
  if (commitTimer)
    clearTimeout(commitTimer)
})
</script>

<template>
  <div class="switch-loading-demo">
    <label class="switch-loading-demo__item">
      <span>{{ labels.async }}</span>
      <TuffSwitch
        :model-value="asyncEnabled"
        :loading="committing"
        @change="commit"
      />
    </label>
    <label class="switch-loading-demo__item">
      <span>{{ labels.off }}</span>
      <TuffSwitch v-model="loadingOff" loading />
    </label>
    <label class="switch-loading-demo__item">
      <span>{{ labels.on }}</span>
      <TuffSwitch v-model="loadingOn" loading />
    </label>
  </div>
</template>

<style scoped>
.switch-loading-demo {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 14px;
}

.switch-loading-demo__item {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  color: var(--tx-text-color-secondary);
  font-size: 14px;
}
</style>
