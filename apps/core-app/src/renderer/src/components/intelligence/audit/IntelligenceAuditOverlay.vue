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
