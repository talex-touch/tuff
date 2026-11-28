<script setup lang="ts">
import { TxButton } from '@talex-touch/tuffex/button'
import { useI18n } from 'vue-i18n'
import { useTheme } from '@/composables/useTheme'
import { toggleConsoleLocale } from '@/i18n'

const { t } = useI18n()
const theme = useTheme()
</script>

<template>
  <div class="AuthShell">
    <header class="AuthShell-Header">
      <a href="https://tuff.tagzxia.com/" class="AuthShell-Brand">
        <span class="AuthShell-Logo" aria-hidden="true">T</span>
        <span>{{ t('app.name') }}</span>
      </a>
      <div class="AuthShell-Links">
        <a href="https://tuff.tagzxia.com/" class="AuthShell-Link">{{ t('app.publicSite') }}</a>
        <a href="/tuffex/" class="AuthShell-Link">{{ t('app.tuffexDocs') }}</a>
        <TxButton variant="ghost" size="sm" @click="toggleConsoleLocale()">
          {{ t('app.switchLocale') }}
        </TxButton>
        <TxButton
          variant="ghost"
          size="sm"
          :icon="theme.isDark.value ? 'i-carbon-sun' : 'i-carbon-moon'"
          :aria-label="theme.isDark.value ? t('app.themeLight') : t('app.themeDark')"
          @click="theme.toggleTheme()"
        />
      </div>
    </header>

    <main class="AuthShell-Body">
      <div class="AuthShell-Card">
        <slot />
      </div>
    </main>
  </div>
</template>

<style scoped>
.AuthShell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--tx-bg-color-page);
}

.AuthShell-Header {
  height: 56px;
  padding: 0 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--tx-border-color-lighter);
  background: var(--tx-bg-color);
}

.AuthShell-Brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.AuthShell-Logo {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  background: var(--tx-color-primary);
  color: var(--tx-color-on-primary, #fff);
}

.AuthShell-Links {
  display: flex;
  align-items: center;
  gap: 12px;
}

.AuthShell-Link {
  font-size: 13px;
  color: var(--tx-text-color-regular);
}

.AuthShell-Link:hover {
  color: var(--tx-text-color-primary);
}

.AuthShell-Body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px 16px;
}

.AuthShell-Card {
  width: 100%;
  max-width: 460px;
  padding: 28px;
  border-radius: 20px;
  background: var(--tx-bg-color);
  box-shadow: inset 0 0 0 1px var(--tx-border-color-lighter), var(--tx-elevation-2);
}
</style>
