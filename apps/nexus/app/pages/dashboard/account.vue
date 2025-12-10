<script setup lang="ts">
import { UserProfile } from '@clerk/nuxt/components'

defineI18nRoute(false)

const { t } = useI18n()
</script>

<template>
  <div class="space-y-6">
    <header>
      <h1 class="text-2xl text-black font-semibold tracking-tight dark:text-light">
        {{ t('dashboard.account.title', '账户设置') }}
      </h1>
      <p class="mt-2 text-sm text-black/70 dark:text-light/80">
        {{ t('dashboard.account.description', '管理您的个人资料和账户信息') }}
      </p>
    </header>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <UserProfile
        :appearance="{
          elements: {
            rootBox: 'w-full',
            card: 'shadow-none border-0 bg-transparent',
            navbar: 'hidden',
            pageScrollBox: 'p-0',
          },
        }"
      />
    </section>
  </div>
</template>
