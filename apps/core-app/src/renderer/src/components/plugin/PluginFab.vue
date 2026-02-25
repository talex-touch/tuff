<script setup lang="ts" name="PluginFab">
import { TxButton } from '@talex-touch/tuffex'
import { onBeforeUnmount, ref, watch } from 'vue'

type PluginFabSeverity = 'warning' | 'error'

const props = defineProps<{
  severity: PluginFabSeverity
  title: string
}>()

const emit = defineEmits<{
  (e: 'click'): void
  (e: 'source-change', source: HTMLElement | null): void
}>()

const buttonAnchorRef = ref<HTMLElement | null>(null)

watch(
  buttonAnchorRef,
  (source) => {
    emit('source-change', source)
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  emit('source-change', null)
})

function handleClick(): void {
  emit('click')
}
</script>

<template>
  <div class="PluginFab" :class="`is-${severity}`">
    <div v-if="severity === 'warning'" class="PluginFab-Waving" />

    <div ref="buttonAnchorRef" class="PluginFab-Anchor">
      <TxButton
        variant="flat"
        :type="severity === 'error' ? 'danger' : 'warning'"
        size="sm"
        class="PluginFab-Button"
        :title="title"
        :aria-label="title"
        @click="handleClick"
      >
        <span class="PluginFab-Symbol">?</span>
      </TxButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.PluginFab {
  --fab-size: 50px;
  --fab-right: 20px;
  --fab-bottom: 20px;
  position: absolute;
  inset: 0;
  z-index: 48;
  pointer-events: none;
  border-radius: inherit;
  overflow: hidden;
}

.PluginFab-Anchor {
  position: absolute;
  right: var(--fab-right);
  bottom: var(--fab-bottom);
  width: var(--fab-size);
  height: var(--fab-size);
  pointer-events: auto;
}

.PluginFab-Button {
  :deep(.tx-button) {
    width: var(--fab-size) !important;
    height: var(--fab-size) !important;
    min-width: var(--fab-size) !important;
    padding: 0 !important;
    --tx-button-radius: 16px;
    border-radius: 16px !important;
    overflow: visible;
    color: #d39a2d;
    border-color: rgba(245, 158, 11, 0.32);
    background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(247, 247, 247, 0.92));
    box-shadow:
      0 8px 22px rgba(0, 0, 0, 0.22),
      inset 0 1px 0 rgba(255, 255, 255, 0.65);
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;

    &:hover {
      transform: translateY(-2px) scale(1.03);
    }

    &:active {
      transform: scale(0.96);
    }
  }

  :deep(.tx-button__inner) {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
}

.PluginFab.is-warning .PluginFab-Button {
  :deep(.tx-button) {
    box-shadow:
      0 10px 24px rgba(161, 98, 7, 0.32),
      0 0 0 1px rgba(245, 158, 11, 0.42),
      inset 0 1px 0 rgba(255, 255, 255, 0.68);
  }
}

.PluginFab.is-error .PluginFab-Button {
  :deep(.tx-button) {
    color: #f97373;
    border-color: rgba(248, 113, 113, 0.48);
    box-shadow:
      0 10px 28px rgba(127, 29, 29, 0.6),
      0 0 0 1px rgba(248, 113, 113, 0.44),
      0 0 18px rgba(239, 68, 68, 0.62),
      inset 0 1px 0 rgba(255, 255, 255, 0.58);

    &::after {
      content: '';
      position: absolute;
      inset: -8px;
      border-radius: inherit;
      pointer-events: none;
      background: radial-gradient(
        circle,
        rgba(239, 68, 68, 0.5) 0%,
        rgba(239, 68, 68, 0.2) 55%,
        rgba(239, 68, 68, 0) 76%
      );
      animation: pluginFabErrorPulse 1.55s cubic-bezier(0.35, 0, 0.22, 1) infinite;
    }
  }
}

.PluginFab-Waving {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 0;

  &::before,
  &::after {
    content: '';
    position: absolute;
    width: 20px;
    height: 20px;
    left: calc(100% - var(--fab-right) - (var(--fab-size) / 2));
    top: calc(100% - var(--fab-bottom) - (var(--fab-size) / 2));
    border-radius: 999px;
    border: 1px solid rgba(245, 158, 11, 0.24);
    background: radial-gradient(
      circle,
      rgba(245, 158, 11, 0.16) 0%,
      rgba(245, 158, 11, 0.08) 34%,
      rgba(245, 158, 11, 0.03) 52%,
      rgba(245, 158, 11, 0) 74%
    );
    transform: translate(-50%, -50%) scale(1);
    animation: pluginFabWaving 3.2s cubic-bezier(0.42, 0, 0.98, 1) infinite;
  }

  &::after {
    animation-delay: 1.6s;
  }
}

.PluginFab-Symbol {
  position: relative;
  z-index: 1;
  font-size: 22px;
  font-weight: 700;
  line-height: 1;
}

@keyframes pluginFabWaving {
  0% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.44;
  }

  50% {
    opacity: 0.16;
  }

  78% {
    opacity: 0.06;
  }

  100% {
    transform: translate(-50%, -50%) scale(80);
    opacity: 0;
  }
}

@keyframes pluginFabErrorPulse {
  0%,
  100% {
    transform: scale(0.88);
    opacity: 0.56;
  }

  50% {
    transform: scale(1.16);
    opacity: 1;
  }
}
</style>
