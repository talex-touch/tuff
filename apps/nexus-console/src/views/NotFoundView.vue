<script setup lang="ts">
import { TxEmptyState } from '@talex-touch/tuffex/empty-state'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
</script>

<template>
  <TxEmptyState
    variant="empty"
    :title="t('common.notFoundTitle')"
    :description="t('common.notFoundDesc')"
    :primary-action="{ label: t('app.backToDashboard'), variant: 'primary' }"
    @primary="router.push('/dashboard')"
  />
</template>
