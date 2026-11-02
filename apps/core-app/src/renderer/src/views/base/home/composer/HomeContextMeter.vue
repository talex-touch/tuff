<script lang="ts" name="HomeContextMeter" setup>
import { TxTextMorph } from '@talex-touch/tuffex/text-morph'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

/**
 * The strip along the top edge of the composer: how much of the model's context window the last
 * request occupied. The fill is the share, the percentage rides its end, and the window's own size
 * closes the track. Rendered only when both figures are known (`HomePage` passes `null` otherwise),
 * so an unreported usage or an unknown window never draws as an empty bar.
 */
const props = defineProps<{
  percent: number
  /** The window, formatted for the track's end: `1M`, `128k`. */
  windowText: string
}>()

const { t } = useI18n()

const fillWidth = computed(() => `${Math.max(0, Math.min(100, props.percent))}%`)
// Centre kept clear of both ends: half a label (2ch, `100%` is the widest) inside the left edge, and
// left of the window label by its own width plus a gap, so the two never print over each other.
const labelLeft = computed(
  () => `clamp(2ch, ${fillWidth.value}, calc(100% - ${props.windowText.length + 3}ch))`
)
</script>

<template>
  <div
    class="HomeContextMeter"
    role="meter"
    :aria-label="t('home.contextMeter.label')"
    aria-valuemin="0"
    aria-valuemax="100"
    :aria-valuenow="percent"
    :aria-valuetext="t('home.contextMeter.value', { percent, window: windowText })"
  >
    <div class="HomeContextMeter-Labels" aria-hidden="true">
      <span class="HomeContextMeter-Percent" :style="{ left: labelLeft }">
        <TxTextMorph :text="`${percent}%`" :duration-ms="420" />
      </span>
      <span class="HomeContextMeter-Window">{{ windowText }}</span>
    </div>
    <div class="HomeContextMeter-Track">
      <div class="HomeContextMeter-Fill" :style="{ width: fillWidth }" />
    </div>
  </div>
</template>

<style lang="scss" scoped>
.HomeContextMeter {
  position: relative;
  width: 100%;
  color: var(--shell-text-muted);
  font-family: var(--shell-font-mono, monospace);
  font-size: 11px;
  line-height: 1;
}

.HomeContextMeter-Track {
  // Bottom edge of the whole dock: this 2px bar is what lies over the composer's top border.
  height: 2px;
  overflow: hidden;
  border-radius: 1px;
  background: color-mix(in srgb, var(--shell-border) 80%, transparent);
}

.HomeContextMeter-Fill {
  height: 100%;
  border-radius: inherit;
  background: var(--shell-text-muted);
}

.HomeContextMeter-Labels {
  position: relative;
  height: 12px;
  margin-bottom: 3px;
}

.HomeContextMeter-Percent {
  position: absolute;
  top: 0;
  // Centred on the fill's end; `labelLeft` keeps the centre a half-label inside either edge.
  transform: translateX(-50%);
  min-width: 2ch;
  font-variant-numeric: tabular-nums;
}

@media (prefers-reduced-motion: no-preference) {
  .HomeContextMeter-Fill {
    transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .HomeContextMeter-Percent {
    transition: left 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  }
}

.HomeContextMeter-Window {
  position: absolute;
  top: 0;
  right: 0;
}
</style>
