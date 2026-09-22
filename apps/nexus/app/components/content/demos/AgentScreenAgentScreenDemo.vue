<script setup lang="ts">
import { computed, ref } from 'vue'

const { locale } = useI18n()
const zh = computed(() => locale.value === 'zh')

// The Working / Loading switch is a demo affordance, not a component feature —
// upstream drives its own showcase the same way. The component just takes a
// `state`.
const state = ref<'working' | 'loading'>('working')

const copy = computed(() => (zh.value
  ? {
      label: '智能体的屏幕',
      working: '工作中',
      loading: '加载中',
      cursor: '正在打开「照片」',
      waiting: '等待智能体的屏幕',
      aria: '智能体屏幕',
    }
  : {
      label: "Agent's screen",
      working: 'Working',
      loading: 'Loading',
      cursor: 'Opening Photos',
      waiting: "Waiting for the agent's screen",
      aria: 'Agent screen',
    }))
</script>

<template>
  <div class="agent-screen-demo">
    <TxAgentScreen
      :state="state"
      :label="copy.label"
      :aria-label="copy.aria"
      :loading-label="copy.waiting"
      :cursor="{ x: 46, y: 62, label: copy.cursor }"
    >
      <!-- A painted stand-in rather than a bundled screenshot: the demo should
           not ship a 300 KB PNG, and the component takes any surface. -->
      <div class="agent-screen-demo__desktop">
        <div class="agent-screen-demo__window is-back">
          <span class="agent-screen-demo__bar" />
        </div>
        <div class="agent-screen-demo__window is-front">
          <span class="agent-screen-demo__bar" />
          <span class="agent-screen-demo__grid">
            <i v-for="n in 6" :key="n" />
          </span>
        </div>
        <div class="agent-screen-demo__dock">
          <i v-for="n in 7" :key="n" />
        </div>
      </div>
    </TxAgentScreen>

    <TxFlatRadio v-model="state" class="agent-screen-demo__switch" size="sm">
      <TxFlatRadioItem value="working" :label="copy.working" />
      <TxFlatRadioItem value="loading" :label="copy.loading" />
    </TxFlatRadio>
  </div>
</template>

<style scoped>
.agent-screen-demo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: 100%;
  max-width: 340px;
  margin: 0 auto;
}

.agent-screen-demo__switch {
  align-self: center;
}

.agent-screen-demo__desktop {
  position: relative;
  width: 100%;
  height: 100%;
  background: linear-gradient(145deg, #ff8a7a 0%, #c86cf0 42%, #4f7df3 100%);
}

.agent-screen-demo__window {
  position: absolute;
  border-radius: 6px;
  background: #fffffff2;
  box-shadow: 0 6px 16px #0000002e;
  overflow: hidden;
}

.agent-screen-demo__window.is-back {
  top: 12%;
  left: 26%;
  width: 62%;
  height: 46%;
}

.agent-screen-demo__window.is-front {
  top: 30%;
  left: 8%;
  width: 62%;
  height: 52%;
}

.agent-screen-demo__bar {
  display: block;
  height: 9px;
  background: #00000010;
}

.agent-screen-demo__grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 3px;
  padding: 4px;
}

.agent-screen-demo__grid i {
  aspect-ratio: 1;
  border-radius: 2px;
  background: #00000014;
}

.agent-screen-demo__dock {
  position: absolute;
  bottom: 3%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 3px;
  padding: 3px 5px;
  border-radius: 6px;
  background: #ffffff38;
}

.agent-screen-demo__dock i {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: #ffffffb0;
}
</style>
