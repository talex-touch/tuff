<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const { locale } = useI18n()
const open = ref(false)

const labels = computed(() => {
  if (locale.value.startsWith('zh')) {
    return {
      title: 'Bead 张力收腰',
      desc: '与 drip 同一套引擎与几何，唯一的区别是宽度：面板两侧被下落的速度拉细，最快的那一刻收得最紧，速度衰减到 0 时回到全宽。水滴报告的是自己的速度，而不是进度。',
      trigger: '选择工作区',
      items: ['个人空间', '团队协作', '归档项目', '新建工作区'],
      note: '收腰量由 |dp/dt| 驱动：线性匀速读作 1.0，达到 beadVelocityRef（默认 4）时收到最紧（每侧 beadPinch，默认 14px）。因为打开曲线只会减速，收腰必然单调衰减到 0。',
      replay: '重播',
    }
  }

  return {
    title: 'Bead',
    desc: 'Same engine and geometry as drip; only the width differs. The sheet is drawn in by how fast it is falling — tightest at peak speed, back to full width once the motion settles. The drop reports its own speed rather than its progress.',
    trigger: 'Select workspace',
    items: ['Personal space', 'Team collaboration', 'Archived projects', 'New workspace'],
    note: 'The pinch is driven by |dp/dt|: a linear ramp reads as 1.0 and beadVelocityRef (default 4) squeezes it fully — beadPinch per side, 14px by default. Because the open curve only ever decelerates, the pinch decays monotonically to nothing.',
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
  <div class="base-anchor-bead-demo">
    <div class="base-anchor-bead-demo__header">
      <strong>{{ labels.title }}</strong>
      <span>{{ labels.desc }}</span>
    </div>

    <div class="base-anchor-bead-demo__stage">
      <TxBaseAnchor
        v-model="open"
        placement="bottom-start"
        :offset="8"
        :width="200"
        :panel-radius="14"
        :panel-padding="10"
        :animation="{ type: 'bead' }"
      >
        <template #reference>
          <!-- 200x40, radius 11: liquid measures the trigger and reuses its radius. -->
          <button class="base-anchor-bead-demo__trigger" type="button">
            {{ labels.trigger }}
          </button>
        </template>

        <div class="base-anchor-bead-demo__menu">
          <button
            v-for="item in labels.items"
            :key="item"
            data-liquid-item
            class="base-anchor-bead-demo__item"
            type="button"
          >
            {{ item }}
          </button>
        </div>
      </TxBaseAnchor>
    </div>

    <p class="base-anchor-bead-demo__note">
      {{ labels.note }}
    </p>
  </div>
</template>

<style scoped>
.base-anchor-bead-demo {
  display: grid;
  gap: 14px;
}

.base-anchor-bead-demo__header {
  display: grid;
  gap: 4px;
}

.base-anchor-bead-demo__header > strong {
  font-size: 14px;
  color: color-mix(in srgb, var(--tx-text-color-primary, #111827) 92%, transparent);
}

.base-anchor-bead-demo__header > span {
  font-size: 12px;
  line-height: 1.5;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 86%, transparent);
}

.base-anchor-bead-demo__stage {
  display: flex;
  justify-content: center;
  padding: 24px 0 190px;
}

/* The goo draws the silhouette underneath; the trigger only supplies its own
   opaque fill and text, and leaves the border to the derived outline ring. */
.base-anchor-bead-demo__trigger {
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
.base-anchor-bead-demo__menu {
  display: grid;
  gap: 2px;
}

.base-anchor-bead-demo__item {
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

.base-anchor-bead-demo__item:hover {
  background: color-mix(in srgb, var(--tx-text-color-primary, #111827) 6%, transparent);
}

.base-anchor-bead-demo__note {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: color-mix(in srgb, var(--tx-text-color-secondary, #6b7280) 82%, transparent);
}
</style>
