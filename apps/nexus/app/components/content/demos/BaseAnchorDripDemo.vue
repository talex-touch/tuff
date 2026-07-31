<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value.startsWith('zh')) {
    return {
      title: 'Drip 液滴下坠',
      desc: '触发器本体与面板处于同一个 SVG goo 滤镜内，面板经由一段变细、收紧的颈部被撕下来，而不是从触发器背后滑出。灰边由合并后的轮廓推导，是一条连续的环。',
      trigger: '选择工作区',
      items: ['个人空间', '团队协作', '归档项目', '新建工作区'],
      note: '打开 260ms，关闭 150ms —— 明显更快，且走另一条更短的曲线，而不是打开的倒放。菜单项的淡入锚定面板自身的生长量，不会在面板长到能容纳它之前出现。',
      replay: '重播',
    }
  }

  return {
    title: 'Drip',
    desc: 'The trigger body and the panel share one SVG goo filter, so the panel is torn off through a neck that thins and pinches rather than sliding out from behind. The grey outline is derived from the merged silhouette as one continuous ring.',
    trigger: 'Select workspace',
    items: ['Personal space', 'Team collaboration', 'Archived projects', 'New workspace'],
    note: 'Opens in 260ms, closes in 150ms — markedly faster, on a different and shorter curve rather than the open reversed. Item fades are keyed to the panel\'s own growth, so nothing appears before the panel has grown to hold it.',
    replay: 'Replay',
  }
})

async function replayDemo() {
  open.value = false
  await nextTick()
  window.setTimeout(() => {
    open.value = true
  }, 220)
}

defineExpose({ replayDemo })
</script>

<template>
  <div class="base-anchor-drip-demo">
    <div class="base-anchor-drip-demo__header">
      <strong>{{ labels.title }}</strong>
      <span>{{ labels.desc }}</span>
    </div>

    <div class="base-anchor-drip-demo__stage">
      <TxBaseAnchor
        v-model="open"
        placement="bottom-start"
        :offset="16"
        :width="200"
        :panel-radius="14"
        :panel-padding="10"
        :animation="{ type: 'drip' }"
      >
        <template #reference>
          <!-- 200x40, radius 11: liquid measures the trigger and reuses its radius. -->
          <button class="base-anchor-drip-demo__trigger" type="button">
            {{ labels.trigger }}
          </button>
        </template>

        <div class="base-anchor-drip-demo__menu">
          <button
            v-for="item in labels.items"
            :key="item"
            data-liquid-item
            class="base-anchor-drip-demo__item"
            type="button"
          >
            {{ item }}
          </button>
        </div>
      </TxBaseAnchor>
    </div>

    <p class="base-anchor-drip-demo__note">
      {{ labels.note }}
    </p>
  </div>
</template>

<style scoped>
.base-anchor-drip-demo {
  display: grid;
  gap: 14px;
}

.base-anchor-drip-demo__header {
  display: grid;
  gap: 4px;
}

.base-anchor-drip-demo__header > strong {
  font-size: 14px;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 92%, transparent);
}

.base-anchor-drip-demo__header > span {
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 86%, transparent);
}

.base-anchor-drip-demo__stage {
  display: flex;
  justify-content: center;
  padding: 24px 0 200px;
}

/* The goo draws the silhouette underneath; the trigger only supplies its own
   opaque fill and text, and leaves the border to the derived outline ring. */
.base-anchor-drip-demo__trigger {
  width: 200px;
  height: 40px;
  padding: 0 14px;
  border: none;
  border-radius: 11px;
  background: var(--tx-fill-color-lighter, #fafafa);
  color: var(--tx-text-color-primary, #111827);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

/* 4 items x 30px + 3 gaps x 2px + 2 x 10px padding = 146px */
.base-anchor-drip-demo__menu {
  display: grid;
  gap: 2px;
}

.base-anchor-drip-demo__item {
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--tx-text-color-primary, #111827);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.base-anchor-drip-demo__item:hover {
  background: color-mix(in srgb, var(--tx-text-color-primary, #111827) 6%, transparent);
}

.base-anchor-drip-demo__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 82%, transparent);
}
</style>
