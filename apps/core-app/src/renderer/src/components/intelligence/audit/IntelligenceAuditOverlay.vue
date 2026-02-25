<script setup lang="ts" name="IntelligenceAuditOverlay">
import { TxButton, TxFlipOverlay } from '@talex-touch/tuffex'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import IntelligenceAuditLogs from './IntelligenceAuditLogs.vue'

defineProps<{
  source?: HTMLElement | null
  callerId?: string
}>()

const visible = defineModel<boolean>({ default: false })

const { t } = useI18n()
const router = useRouter()

function handleViewFullAudit(close: () => void) {
  close()
  router.push('/intelligence/audit')
}
</script>

<template>
  <Teleport to="body">
    <TxFlipOverlay
      v-model="visible"
      :source="source"
      :duration="420"
      :rotate-x="6"
      :rotate-y="8"
      :speed-boost="1.1"
      transition-name="IntelligenceAuditOverlay-Mask"
      mask-class="IntelligenceAuditOverlay-Mask"
      card-class="IntelligenceAuditOverlay-Card"
      :header-title="t('intelligence.audit.logsTitle')"
      :header-desc="t('intelligence.audit.logsDescription')"
    >
      <template #header-actions="{ close }">
        <TxButton variant="flat" size="sm" @click="handleViewFullAudit(close)">
          <i class="i-carbon-launch" />
          {{ t('intelligence.audit.viewFullAudit') }}
        </TxButton>
      </template>
      <template #default>
        <div class="IntelligenceAuditOverlay">
          <div class="IntelligenceAuditOverlay-Body">
            <IntelligenceAuditLogs :caller-id="callerId" />
          </div>
        </div>
      </template>
    </TxFlipOverlay>
  </Teleport>
</template>

<style lang="scss" scoped>
.IntelligenceAuditOverlay {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.IntelligenceAuditOverlay-Header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 10px;
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.IntelligenceAuditOverlay-Body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 16px 18px;
}
</style>

<style lang="scss">
.IntelligenceAuditOverlay-Mask {
  position: fixed;
  inset: 0;
  background: rgba(12, 12, 14, 0.42);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  z-index: 1800;
  display: flex;
  align-items: center;
  justify-content: center;
  perspective: 1200px;
}

.IntelligenceAuditOverlay-Mask-enter-active,
.IntelligenceAuditOverlay-Mask-leave-active {
  transition: opacity 200ms ease;
}

.IntelligenceAuditOverlay-Mask-enter-from,
.IntelligenceAuditOverlay-Mask-leave-to {
  opacity: 0;
}

.IntelligenceAuditOverlay-Card {
  width: min(960px, 92vw);
  height: min(720px, 86vh);
  border-radius: 1.25rem;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.35);
  overflow: hidden;
  position: fixed;
  left: 50%;
  top: 50%;
  display: flex;
  flex-direction: column;
  transform-origin: 50% 50%;
  transform-style: preserve-3d;
  backface-visibility: hidden;
  will-change: transform;
}
</style>
