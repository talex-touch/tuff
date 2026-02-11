<script setup lang="ts">
import { TxStatusBadge } from '@talex-touch/tuffex'

const props = defineProps<{
  title: string
  description: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

const { t } = useI18n()
</script>

<template>
  <div class="AssetBetaStep">
    <div class="AssetBetaStep-Card">
      <div class="AssetBetaStep-Header">
        <p class="AssetBetaStep-Title">
          {{ props.title }}
        </p>
        <TxStatusBadge text="Beta" status="warning" size="sm" />
      </div>

      <p class="AssetBetaStep-Desc">
        {{ props.description }}
      </p>

      <p class="AssetBetaStep-Hint">
        <span class="i-carbon-information" />
        {{
          props.disabled
            ? t(
                'dashboard.sections.plugins.assetCreate.betaLocked',
                'This type is visible but not open yet. We will unlock it in later beta versions.'
              )
            : t(
                'dashboard.sections.plugins.assetCreate.betaOpenLater',
                'This type is currently in beta preview. Publishing flow is being integrated.'
              )
        }}
      </p>

      <div class="AssetBetaStep-Actions">
        <TxButton variant="secondary" size="small" @click="emit('back')">
          <span class="i-carbon-arrow-left mr-1" />
          {{ t('dashboard.sections.plugins.assetCreate.backToTypes', 'Back to Type Selection') }}
        </TxButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.AssetBetaStep {
  width: min(760px, 90vw);
  padding: 12px;
}

.AssetBetaStep-Card {
  border-radius: 16px;
  border: 1px solid rgba(0, 0, 0, 0.08);
  background: rgba(255, 255, 255, 0.92);
  padding: 18px;

  .dark & {
    border-color: rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.04);
  }
}

.AssetBetaStep-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.AssetBetaStep-Title {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: rgba(0, 0, 0, 0.88);

  .dark & {
    color: rgba(255, 255, 255, 0.9);
  }
}

.AssetBetaStep-Desc {
  margin: 12px 0 0;
  font-size: 13px;
  line-height: 1.6;
  color: rgba(0, 0, 0, 0.58);

  .dark & {
    color: rgba(255, 255, 255, 0.6);
  }
}

.AssetBetaStep-Hint {
  margin: 14px 0 0;
  display: inline-flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  line-height: 1.5;
  color: rgba(0, 0, 0, 0.6);

  .dark & {
    color: rgba(255, 255, 255, 0.62);
  }
}

.AssetBetaStep-Actions {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
