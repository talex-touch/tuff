<script setup lang="ts">
import TuffBanner from './TuffBanner.vue'
import TuffLandingFooter from './landing/TuffLandingFooter.vue'

const heroPoints = [
  '统一指挥所有工作区的启动、自动化与上下文。',
  '设备无缝切换，状态实时同步。',
  '可信扩展生态，加速团队交付节奏。',
]

const essentials = [
  {
    badge: '市场 · 扩展',
    title: '精选扩展市场',
    copy: '签名发布、版本托管与分阶段上线，确保团队始终放心使用。',
    link: { to: '/marketplace', label: '浏览市场' },
  },
  {
    badge: '开源',
    title: '透明的内核',
    copy: '审阅编排引擎代码、在 GitHub 参与共建，亦可利用官方镜像自建部署。',
    link: { to: 'https://github.com/tuff-docs/tuff-nexus', label: '前往仓库' },
  },
  {
    badge: '全平台',
    title: '多端同节奏',
    copy: '原生桌面、Web、移动端与 CLI 全覆盖，实时同步体验一致。',
    link: { to: '/docs/platforms', label: '查看平台指南' },
  },
  {
    badge: '链接一切',
    title: '天生联动',
    copy: '凭借 FlowScript 与实时协作，把 SaaS、本地运行器与共享画布串联起来。',
    link: { to: '/docs/flows', label: '设计流程' },
  },
]

const builderFocus = [
  {
    badge: '开发者',
    title: '为创造者提速',
    copy: '类型安全 SDK、热重载沙箱与 CI 模板，让每次发布都干净利落。',
    link: { to: '/docs/sdk', label: '开始构建' },
  },
  {
    badge: '文档',
    title: '随手可查的答案',
    copy: '实战手册、API 交互式体验与设计令牌，帮助团队从原型到上线保持一致。',
    link: { to: '/docs', label: '查阅文档' },
  },
]

const waitlistPerks = [
  '免费使用期持续至 2027·01·01。',
  '抢先体验新版本与深度迁移指南。',
  '核心团队提供一对一专属支持。',
]

useHead({
  htmlAttrs: { class: 'dark' },
  bodyAttrs: { class: 'bg-[#040406] text-light antialiased' },
})
</script>

<template>
  <div class="relative flex min-h-screen flex-col gap-24 bg-[#040406] pb-32 text-light lg:gap-28">
    <section class="relative overflow-hidden px-6 pt-28 pb-16 sm:pt-32">
      <div class="absolute inset-x-0 top-0 -z-10 h-[420px] bg-[radial-gradient(circle_at_top,_rgba(64,118,255,0.32),_rgba(4,4,6,0))]" />
      <div class="mx-auto grid max-w-5xl gap-12 lg:max-w-6xl lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <div class="flex flex-col gap-7">
          <span class="inline-flex w-max items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.32em] text-white/70">
            Tuff 启动器
          </span>
          <h1 class="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-[3.5rem] lg:leading-tight">
            启动、编排并共享你的全流程工作体验。
          </h1>
          <p class="max-w-xl text-base text-white/70 sm:text-lg">
            Tuff 让指令面板、自动化与上下文在任意设备中保持同步，让团队无需放慢脚步。
          </p>
          <ul class="space-y-2 text-sm text-white/60">
            <li
              v-for="point in heroPoints"
              :key="point"
              class="flex items-start gap-3"
            >
              <span class="mt-1 h-2 w-2 flex-shrink-0 rounded-full bg-white/40" />
              <span>{{ point }}</span>
            </li>
          </ul>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
            <NuxtLink
              to="#download"
              class="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-md transition hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              <span class="i-carbon-play-filled text-base" />
              加入等候名单
            </NuxtLink>
            <NuxtLink
              to="/marketplace"
              class="inline-flex items-center justify-center gap-2 rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            >
              <span class="i-carbon-catalog text-base" />
              了解扩展市场
            </NuxtLink>
            <span class="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] text-white/60">
              免费至 2027·01·01
            </span>
          </div>
        </div>
        <div class="relative">
          <div class="absolute inset-0 -z-10 translate-x-10 blur-[130px] bg-[radial-gradient(circle_at_center,_rgba(92,142,255,0.28),_transparent_75%)]" />
          <div class="overflow-hidden rounded-[32px] border border-white/10 bg-white/5 shadow-[0_35px_140px_rgba(0,0,0,0.6)]">
            <TuffBanner>
              <template #center>
                <div class="flex w-full flex-col items-center gap-6 px-10 py-16 text-center text-white/75">
                  <span class="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/60">
                    指令界面
                  </span>
                  <p class="max-w-sm text-base">
                    在 WebGL 舞台中预览扩展、触发自动化与协作会话，视觉沉浸且响应迅速。
                  </p>
                </div>
              </template>
            </TuffBanner>
          </div>
        </div>
      </div>
    </section>

    <section class="px-6">
      <div class="mx-auto max-w-6xl">
        <div class="mb-10 flex flex-col gap-4">
          <span class="inline-flex w-max items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/65">
            核心能力
          </span>
          <h2 class="text-3xl font-semibold text-white sm:text-4xl">
            现代启动器的标配，我们做得再精致一些。
          </h2>
        </div>
        <div class="grid gap-6 md:grid-cols-2">
          <article
            v-for="item in essentials"
            :key="item.title"
            class="group flex h-full flex-col justify-between gap-4 rounded-[28px] border border-white/10 bg-[#06070c]/90 p-8 shadow-[0_28px_110px_rgba(0,0,0,0.5)] transition hover:-translate-y-1 hover:border-white/20 hover:bg-[#080910]"
          >
            <div class="space-y-4">
              <span class="inline-flex w-max items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/60">
                {{ item.badge }}
              </span>
              <h3 class="text-xl font-semibold text-white">
                {{ item.title }}
              </h3>
              <p class="text-sm text-white/65">
                {{ item.copy }}
              </p>
            </div>
            <NuxtLink
              :to="item.link.to"
              class="inline-flex w-max items-center gap-2 text-sm font-semibold text-white/70 transition group-hover:text-white"
            >
              <span>{{ item.link.label }}</span>
              <span class="i-carbon-arrow-right text-base" />
            </NuxtLink>
          </article>
        </div>
      </div>
    </section>

    <section class="px-6">
      <div class="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <article
          v-for="item in builderFocus"
          :key="item.title"
          class="flex flex-col gap-6 overflow-hidden rounded-[28px] border border-white/10 bg-[#06070c]/90 p-10 shadow-[0_28px_110px_rgba(0,0,0,0.5)] transition hover:-translate-y-1 hover:border-white/20 hover:bg-[#080910]"
        >
          <div class="space-y-4">
            <span class="inline-flex w-max items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-white/60">
              {{ item.badge }}
            </span>
            <h2 class="text-3xl font-semibold text-white">
              {{ item.title }}
            </h2>
            <p class="text-sm text-white/65">
              {{ item.copy }}
            </p>
          </div>
          <NuxtLink
            :to="item.link.to"
            class="inline-flex w-max items-center gap-2 text-sm font-semibold text-white/70 transition hover:text-white"
          >
            <span>{{ item.link.label }}</span>
            <span class="i-carbon-arrow-right text-base" />
          </NuxtLink>
        </article>
      </div>
    </section>

    <section id="download" class="px-6">
      <div class="mx-auto max-w-5xl overflow-hidden rounded-[32px] border border-white/10 bg-[#06070c]/95 px-8 py-16 text-center shadow-[0_28px_110px_rgba(0,0,0,0.5)] sm:px-12">
        <div class="mx-auto flex max-w-2xl flex-col items-center gap-6">
          <span class="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-white/65">
            等候名单
          </span>
          <h2 class="text-3xl font-semibold text-white sm:text-4xl">
            抢先体验 Tuff 生态。
          </h2>
          <p class="text-base text-white/70">
            留下邮箱即可收到下一批启动器版本、迁移手册与专属研讨邀请。
          </p>
          <form
            class="flex w-full max-w-md flex-col gap-3 sm:flex-row"
            action="/waitlist"
            method="post"
          >
            <input
              type="email"
              name="email"
              required
              autocomplete="email"
              placeholder="you@studio.com"
              class="w-full rounded-full border border-white/25 bg-transparent px-5 py-3 text-sm text-white placeholder:text-white/40 focus:border-white focus:outline-none focus:ring-2 focus:ring-white/30"
            >
            <button
              type="submit"
              class="inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black shadow-md transition hover:-translate-y-0.5 hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 sm:w-auto"
            >
              <span class="i-carbon-send text-base" />
              通知我
            </button>
          </form>
          <ul class="flex flex-col gap-2 text-sm text-white/60 sm:flex-row sm:items-center sm:gap-6">
            <li
              v-for="perk in waitlistPerks"
              :key="perk"
              class="flex items-center gap-2"
            >
              <span class="h-1.5 w-1.5 rounded-full bg-white/40" />
              <span>{{ perk }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>
    <TuffLandingFooter />
  </div>
</template>
