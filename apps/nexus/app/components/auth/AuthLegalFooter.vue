<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex'

const props = withDefaults(defineProps<{
  showAgreement?: boolean
}>(), {
  showAgreement: false,
})

const { t } = useI18n()

function goTo(path: string) {
  return navigateTo(path)
}
</script>

<template>
  <footer class="auth-footer-shell">
    <div class="w-full px-6 text-xs text-white/40">
      <div class="auth-footer-row">
        <span>{{ t('auth.copyright', '© 2026 Tuff. All rights reserved.') }}</span>
        <div class="flex items-center gap-2">
          <TxButton variant="ghost" size="sm" @click="goTo('/privacy')">
            {{ t('auth.privacyPolicy', 'Privacy Policy') }}
          </TxButton>
          <span class="text-white/20">·</span>
          <TxButton variant="ghost" size="sm" @click="goTo('/protocol')">
            {{ t('auth.termsOfService', 'Terms of Service') }}
          </TxButton>
        </div>
      </div>
      <div class="auth-footer-meta">
        <div class="text-xs text-white/35">
          {{ t('auth.designedBy', 'Designed by TDesignS') }}
        </div>
        <div v-if="props.showAgreement" class="auth-legal">
          <span>{{ t('auth.loginAgreementPrefix', 'By logging in, you agree to') }}</span>
          <TxButton variant="ghost" size="sm" @click="goTo('/protocol')">
            {{ t('auth.termsOfService', 'Terms of Service') }}
          </TxButton>
          <span>{{ t('auth.loginAgreementAnd', 'and') }}</span>
          <TxButton variant="ghost" size="sm" @click="goTo('/privacy')">
            {{ t('auth.privacyPolicy', 'Privacy Policy') }}
          </TxButton>
          <span>.</span>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.auth-footer-shell {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 6px;
}

.auth-footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  gap: 16px;
  line-height: 1.2;
}

.auth-footer-meta {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.auth-legal {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: rgba(255, 255, 255, 0.55);
}
</style>
