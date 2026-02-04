<script setup lang="ts">
import { computed } from 'vue'

const { t } = useI18n()

defineI18nRoute(false)

const { user, pending } = useAuthUser()

const fallbackName = computed(() => t('dashboard.header.defaultName'))

const greetingName = computed(() => {
  if (pending.value || !user.value)
    return fallbackName.value
  return user.value.name || user.value.email || fallbackName.value
})

const greetingLine = computed(() => t('dashboard.header.greeting', { name: greetingName.value }))

const overviewItems = computed(() => [
  {
    icon: 'i-carbon-rocket',
    text: t('dashboard.sections.overview.items.betaAccess'),
  },
  {
    icon: 'i-carbon-notification',
    text: t('dashboard.sections.overview.items.releaseNotify'),
  },
  {
    icon: 'i-carbon-chart-combo',
    text: t('dashboard.sections.overview.items.insights'),
  },
])

const nextStepItems = computed(() => [
  {
    icon: 'i-carbon-link',
    text: t('dashboard.sections.nextSteps.items.connectWorkspace'),
  },
  {
    icon: 'i-carbon-calendar',
    text: t('dashboard.sections.nextSteps.items.scheduleOnboarding'),
  },
  {
    icon: 'i-carbon-user-multiple',
    text: t('dashboard.sections.nextSteps.items.inviteTeammates'),
  },
])

const shortcutLinks = computed(() => [
  {
    to: '/docs/getting-started',
    label: t('dashboard.sections.shortcuts.links.gettingStarted'),
  },
  {
    to: '/marketplace',
    label: t('dashboard.sections.shortcuts.links.marketplace'),
  },
  {
    to: '/developers',
    label: t('dashboard.sections.shortcuts.links.developers'),
  },
])
</script>

<template>
  <div class="space-y-4">
    <header>
      <div>
        <p class="text-sm text-black/70 tracking-widest uppercase dark:text-light/80">
          {{ t('dashboard.header.badge') }}
        </p>
        <h1 class="mt-2 text-2xl text-black font-semibold tracking-tight sm:text-3xl dark:text-light">
          {{ greetingLine }}
        </h1>
        <p class="mt-3 max-w-2xl text-base text-black/70 dark:text-light/80">
          {{ t('dashboard.header.intro') }}
        </p>
        <div class="mt-6 flex flex-shrink-0 flex-wrap items-center justify-start gap-3">
          <NuxtLink
            to="/docs"
            class="border border-primary/20 rounded-full bg-dark/5 px-4 py-2 text-sm text-black font-medium transition dark:border-light/20 hover:border-primary/40 dark:bg-light/10 hover:bg-dark/10 dark:text-light"
          >
            {{ t('dashboard.header.docsCta') }}
          </NuxtLink>
          <NuxtLink
            to="/marketplace"
            class="rounded-full bg-dark px-4 py-2 text-sm text-white font-semibold shadow-lg shadow-primary/30 transition dark:bg-light hover:bg-dark/90 dark:text-black dark:shadow-light/40 dark:hover:bg-light/90"
          >
            {{ t('dashboard.header.marketplaceCta') }}
          </NuxtLink>
        </div>
      </div>
    </header>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.sections.overview.title') }}
      </h2>
      <ul class="mt-4 text-sm text-black/70 space-y-3 dark:text-light/80">
        <li
          v-for="item in overviewItems"
          :key="item.icon"
          class="flex items-center gap-2"
        >
          <span class="text-lg text-black dark:text-light" :class="[item.icon]" />
          {{ item.text }}
        </li>
      </ul>
    </section>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.sections.nextSteps.title') }}
      </h2>
      <ul class="mt-4 text-sm text-black/70 space-y-3 dark:text-light/80">
        <li
          v-for="item in nextStepItems"
          :key="item.icon"
          class="flex items-center gap-2"
        >
          <span class="text-lg text-black dark:text-light" :class="[item.icon]" />
          {{ item.text }}
        </li>
      </ul>
    </section>

    <section class="border border-primary/10 rounded-3xl bg-white/70 p-6 shadow-sm backdrop-blur-sm dark:border-light/10 dark:bg-dark/60">
      <h2 class="text-lg text-black font-semibold dark:text-light">
        {{ t('dashboard.sections.shortcuts.title') }}
      </h2>
      <div class="grid grid-cols-1 mt-4 gap-3 text-sm">
        <NuxtLink
          v-for="shortcut in shortcutLinks"
          :key="shortcut.to"
          :to="shortcut.to"
          class="flex items-center justify-between border border-primary/15 rounded-2xl bg-dark/5 px-4 py-3 text-black font-medium no-underline transition dark:border-light/15 hover:border-primary/30 dark:bg-light/10 hover:bg-light/5 dark:text-light"
        >
          {{ shortcut.label }}
          <span class="i-carbon-arrow-right text-base" />
        </NuxtLink>
      </div>
    </section>
  </div>
</template>
