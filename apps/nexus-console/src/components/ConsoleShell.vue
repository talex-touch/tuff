<script setup lang="ts">
import type { SidebarNavGroup, SidebarNavItem, SidebarNavValue } from '@talex-touch/tuffex/sidebar-nav'
import { TxButton } from '@talex-touch/tuffex/button'
import { TxSidebarNav } from '@talex-touch/tuffex/sidebar-nav'
import { TxStatusBadge } from '@talex-touch/tuffex/status-badge'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { useSession } from '@/composables/useSession'
import { useTheme } from '@/composables/useTheme'
import { toggleConsoleLocale } from '@/i18n'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const session = useSession()
const theme = useTheme()
const mobileOpen = ref(false)

const navGroups = computed<SidebarNavGroup[]>(() => {
  const groups: SidebarNavGroup[] = [
    { key: 'user', label: t('nav.userGroup') },
  ]
  if (session.isAdmin.value)
    groups.push({ key: 'admin', label: t('nav.adminGroup') })
  return groups
})

const navItems = computed<SidebarNavItem[]>(() => {
  const items: SidebarNavItem[] = [
    { value: '/dashboard', label: t('nav.overview'), group: 'user', icon: 'i-carbon-dashboard' },
    { value: '/dashboard/account', label: t('nav.account'), group: 'user', icon: 'i-carbon-user-avatar' },
    { value: '/dashboard/devices', label: t('nav.devices'), group: 'user', icon: 'i-carbon-laptop' },
    { value: '/dashboard/plugins', label: t('nav.plugins'), group: 'user', icon: 'i-carbon-plug' },
    { value: '/dashboard/team', label: t('nav.team'), group: 'user', icon: 'i-carbon-group' },
    { value: '/dashboard/credits', label: t('nav.credits'), group: 'user', icon: 'i-carbon-currency' },
    { value: '/dashboard/notifications', label: t('nav.notifications'), group: 'user', icon: 'i-carbon-notification' },
  ]
  if (session.isAdmin.value) {
    items.push(
      { value: '/admin', label: t('nav.adminUsage'), group: 'admin', icon: 'i-carbon-chart-line-data' },
      { value: '/admin/users', label: t('nav.adminUsers'), group: 'admin', icon: 'i-carbon-user-multiple' },
      { value: '/admin/store', label: t('nav.adminStore'), group: 'admin', icon: 'i-carbon-store' },
      { value: '/admin/releases', label: t('nav.adminReleases'), group: 'admin', icon: 'i-carbon-rocket' },
      { value: '/admin/ai', label: t('nav.adminAi'), group: 'admin', icon: 'i-carbon-machine-learning-model' },
      { value: '/admin/credits', label: t('nav.adminCredits'), group: 'admin', icon: 'i-carbon-wallet' },
    )
  }
  return items
})

const activePath = computed<SidebarNavValue>({
  get: () => route.path,
  set: (value) => {
    const path = String(value)
    if (path !== route.path)
      void router.push(path)
    mobileOpen.value = false
  },
})

function onSelect(item: SidebarNavItem) {
  const target = String(item.value)
  if (target !== route.path)
    void router.push(target)
  mobileOpen.value = false
}

async function handleSignOut() {
  await session.signOut()
  await router.replace('/sign-in')
}
</script>

<template>
  <div class="ConsoleShell">
    <header class="ConsoleShell-Topbar">
      <div class="ConsoleShell-BrandGroup">
        <TxButton
          class="ConsoleShell-MenuBtn"
          variant="ghost"
          size="sm"
          icon="i-carbon-menu"
          :aria-label="t('app.name')"
          @click="mobileOpen = !mobileOpen"
        />
        <RouterLink to="/dashboard" class="ConsoleShell-Brand">
          <span class="ConsoleShell-Logo" aria-hidden="true">T</span>
          <span class="ConsoleShell-BrandText">{{ t('app.name') }}</span>
        </RouterLink>
        <nav class="ConsoleShell-ExternalLinks" aria-label="External sites">
          <a href="https://tuff.tagzxia.com/" class="ConsoleShell-ExtLink">
            {{ t('app.publicSite') }}
          </a>
          <a href="/tuffex/" class="ConsoleShell-ExtLink">
            {{ t('app.tuffexDocs') }}
          </a>
        </nav>
      </div>

      <div class="ConsoleShell-Actions">
        <TxStatusBadge
          v-if="session.isAdmin.value"
          :text="t('app.admin')"
          status="info"
          size="sm"
        />
        <span v-if="session.user.value?.email" class="ConsoleShell-UserEmail">
          {{ session.user.value.name || session.user.value.email }}
        </span>
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
        <TxButton variant="secondary" size="sm" @click="handleSignOut">
          {{ t('app.signOut') }}
        </TxButton>
      </div>
    </header>

    <div class="ConsoleShell-Frame">
      <aside class="ConsoleShell-Sidebar" :class="{ 'is-open': mobileOpen }">
        <TxSidebarNav
          v-model="activePath"
          :items="navItems"
          :groups="navGroups"
          :aria-label="t('app.name')"
          @select="onSelect"
        />
      </aside>

      <main class="ConsoleShell-Main">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.ConsoleShell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--tx-bg-color-page);
}

.ConsoleShell-Topbar {
  position: sticky;
  top: 0;
  z-index: 40;
  height: 56px;
  padding: 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: var(--tx-bg-color);
  border-bottom: 1px solid var(--tx-border-color-lighter);
}

.ConsoleShell-BrandGroup {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.ConsoleShell-MenuBtn {
  display: none;
}

.ConsoleShell-Brand {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--tx-text-color-primary);
}

.ConsoleShell-Logo {
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

.ConsoleShell-ExternalLinks {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  padding-left: 12px;
  border-left: 1px solid var(--tx-border-color-lighter);
}

.ConsoleShell-ExtLink {
  font-size: 13px;
  color: var(--tx-text-color-regular);
}

.ConsoleShell-ExtLink:hover {
  color: var(--tx-text-color-primary);
}

.ConsoleShell-Actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ConsoleShell-UserEmail {
  font-size: 13px;
  color: var(--tx-text-color-regular);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ConsoleShell-Frame {
  flex: 1;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
  max-width: 1440px;
  width: 100%;
  margin: 0 auto;
  gap: 24px;
  padding: 20px;
}

.ConsoleShell-Sidebar {
  position: sticky;
  top: 76px;
  align-self: start;
  min-width: 0;
}

.ConsoleShell-Main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

@media (max-width: 960px) {
  .ConsoleShell-MenuBtn {
    display: inline-flex;
  }

  .ConsoleShell-ExternalLinks,
  .ConsoleShell-UserEmail {
    display: none;
  }

  .ConsoleShell-Frame {
    grid-template-columns: minmax(0, 1fr);
    padding: 16px;
  }

  .ConsoleShell-Sidebar {
    display: none;
    position: static;
  }

  .ConsoleShell-Sidebar.is-open {
    display: block;
  }
}
</style>
