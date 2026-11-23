<script setup lang="ts">
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
        <!-- The agreement line below links the same two pages. -->
        <div v-if="!props.showAgreement" class="flex items-center gap-2">
          <button type="button" class="auth-footer-link" @click="goTo('/privacy')">
            {{ t('auth.privacyPolicy', 'Privacy Policy') }}
          </button>
          <span class="text-white/20">·</span>
          <button type="button" class="auth-footer-link" @click="goTo('/license')">
            {{ t('auth.termsOfService', 'Terms of Service') }}
          </button>
        </div>
      </div>
      <div class="auth-footer-meta">
        <div class="text-xs text-white/35">
          {{ t('auth.designedBy', 'Designed by TDesignS') }}
        </div>
        <div v-if="props.showAgreement" class="auth-legal">
          <span>{{ t('auth.loginAgreementPrefix', 'By logging in, you agree to') }}</span>
          <button type="button" class="auth-footer-link" @click="goTo('/license')">
            {{ t('auth.termsOfService', 'Terms of Service') }}
          </button>
          <span>{{ t('auth.loginAgreementAnd', 'and') }}</span>
          <button type="button" class="auth-footer-link" @click="goTo('/privacy')">
            {{ t('auth.privacyPolicy', 'Privacy Policy') }}
          </button>
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
  z-index: 20;
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

.auth-footer-link {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.72);
  font: inherit;
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.auth-footer-link:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.auth-footer-link:focus-visible {
  outline: 2px solid rgba(167, 139, 250, 0.75);
  outline-offset: 2px;
}
</style>
