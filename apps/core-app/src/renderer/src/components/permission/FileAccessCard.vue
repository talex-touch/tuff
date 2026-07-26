<!--
  FileAccessCard

  The single file-access permission surface, shared by the onboarding step and the settings page.
  Granting is one click: the main process reads every protected root, which is what raises the
  macOS consent dialogs. There is no silent path, so the card explains the dialogs while they run.
-->
<script setup lang="ts" name="FileAccessCard">
import { TxButton } from '@talex-touch/tuffex/button'
import { useI18n } from 'vue-i18n'
import { useFileAccessPermission } from '~/composables/useFileAccessPermission'

withDefaults(
  defineProps<{
    /**
     * Hosts that already own a primary action (the onboarding wizard drives it from its footer)
     * pass false so the screen keeps exactly one primary button.
     */
    showAction?: boolean
  }>(),
  { showAction: true }
)

const { t } = useI18n()
const { isGranted, isRequesting, requiredRootLabels, request } = useFileAccessPermission()
</script>

<template>
  <div class="FileAccessCard" :class="{ granted: isGranted }">
    <span class="FileAccessCard-Icon">
      <i :class="isGranted ? 'i-carbon-checkmark-outline' : 'i-carbon-folder-open'" />
    </span>

    <div class="FileAccessCard-Meta">
      <strong>{{ t('setupPermissions.fileAccess') }}</strong>
      <p>{{ t('setupPermissions.fileAccessShortDesc') }}</p>
      <small v-if="isRequesting" class="granting">
        {{ t('setupPermissions.grantingHint') }}
      </small>
      <small v-else-if="isGranted" class="granted">
        {{ t('setupPermissions.grantedRoots') }}&#12288;{{ requiredRootLabels.join(' · ') }}
      </small>
      <small v-else>{{ requiredRootLabels.join(' · ') }}</small>
    </div>

    <TxButton
      v-if="showAction && !isGranted"
      type="primary"
      size="sm"
      :loading="isRequesting"
      @click="request"
    >
      {{ t('setupPermissions.grantFileAccess') }}
    </TxButton>
  </div>
</template>

<style lang="scss" scoped>
.FileAccessCard {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--tx-border-color-lighter);
  border-radius: 12px;
  background-color: var(--tx-fill-color-lighter);

  &-Icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 42px;
    height: 42px;
    border-radius: 10px;
    background-color: color-mix(in srgb, var(--tx-color-primary) 12%, transparent);
    color: var(--tx-color-primary);
    font-size: 20px;
  }

  &.granted &-Icon {
    background-color: color-mix(in srgb, var(--tx-color-success) 12%, transparent);
    color: var(--tx-color-success);
  }

  &-Meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;

    strong {
      font-size: 1rem;
      font-weight: 600;
      color: var(--tx-text-color-primary);
    }

    p {
      margin: 0;
      font-size: 0.8125rem;
      line-height: 1.55;
      color: var(--tx-text-color-regular);
    }

    small {
      font-size: 0.75rem;
      color: var(--tx-text-color-secondary);

      &.granted {
        color: var(--tx-color-success);
      }

      &.granting {
        color: var(--tx-color-primary);
      }
    }
  }
}
</style>
