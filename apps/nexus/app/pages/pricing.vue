<script setup lang="ts">
definePageMeta({
  layout: 'home',
  pageTransition: {
    name: 'fade',
    mode: 'out-in',
  },
})

const { t } = useI18n()

const plans = [
  {
    id: 'free',
    title: t('pricing.freeTitle', 'Free'),
    price: t('pricing.freePrice', '¥0 / 月'),
    desc: t('pricing.freeDesc', '基础功能与社区支持'),
    features: [
      t('pricing.freeFeature1', '基础插件市场'),
      t('pricing.freeFeature2', '个人设备同步'),
      t('pricing.freeFeature3', '有限 AI 积分'),
    ],
  },
  {
    id: 'plus',
    title: t('pricing.plusTitle', 'Plus'),
    price: t('pricing.plusPrice', '敬请期待'),
    desc: t('pricing.plusDesc', '面向个人的增强体验'),
    features: [
      t('pricing.plusFeature1', '更高 AI 积分额度'),
      t('pricing.plusFeature2', '高级自动化模板'),
      t('pricing.plusFeature3', '优先支持'),
    ],
  },
  {
    id: 'team',
    title: t('pricing.teamTitle', 'Team'),
    price: t('pricing.teamPrice', '即将开放'),
    desc: t('pricing.teamDesc', '团队协作与共享额度'),
    features: [
      t('pricing.teamFeature1', '团队积分池'),
      t('pricing.teamFeature2', '成员管理'),
      t('pricing.teamFeature3', '企业级安全'),
    ],
  },
]
</script>

<template>
  <section class="relative mx-auto w-full flex flex-col gap-12 px-24 py-24 lg:px-12 sm:px-8">
    <header class="text-center space-y-4">
      <p class="mx-auto inline-flex border border-primary/15 rounded-full bg-dark/5 px-4 py-1 text-xs text-black/80 font-semibold tracking-widest uppercase dark:border-light/20 dark:bg-light/10 dark:text-light/80">
        {{ t('nav.pricing') }}
      </p>
      <h1 class="text-3xl text-black font-semibold tracking-tight sm:text-4xl dark:text-light">
        {{ t('pricing.title') }}
      </h1>
      <p class="mx-auto max-w-2xl text-base text-black/70 dark:text-light/80">
        {{ t('pricing.subtitle') }}
      </p>
    </header>

    <div class="mx-auto grid w-full max-w-5xl gap-6 md:grid-cols-3">
      <article
        v-for="plan in plans"
        :key="plan.id"
        class="rounded-3xl border border-primary/10 bg-white/80 p-6 shadow-sm backdrop-blur-sm transition hover:shadow-lg dark:border-light/10 dark:bg-dark/70"
      >
        <div class="space-y-3">
          <p class="text-sm font-semibold uppercase tracking-widest text-black/60 dark:text-light/60">
            {{ plan.title }}
          </p>
          <p class="text-2xl font-semibold text-black dark:text-light">
            {{ plan.price }}
          </p>
          <p class="text-sm text-black/70 dark:text-light/70">
            {{ plan.desc }}
          </p>
        </div>
        <ul class="mt-6 space-y-2 text-sm text-black/70 dark:text-light/70">
          <li v-for="feature in plan.features" :key="feature" class="flex items-center gap-2">
            <span class="i-carbon-checkmark-filled text-green-500" />
            {{ feature }}
          </li>
        </ul>
        <NuxtLink
          to="/sign-up"
          class="mt-6 inline-flex w-full items-center justify-center rounded-full bg-dark px-4 py-2 text-sm text-white font-medium transition hover:bg-dark/90 dark:bg-light dark:text-black dark:hover:bg-light/90"
        >
          {{ t('pricing.cta', '开始体验') }}
        </NuxtLink>
      </article>
    </div>
  </section>
</template>
