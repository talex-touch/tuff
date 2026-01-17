import { computed } from 'vue'

interface DashboardPluginResponse {
  plugins: DashboardPlugin[]
  featured: DashboardPlugin[]
  total: number
}

interface DashboardPluginAuthor {
  name: string
  avatarColor?: string
}

interface DashboardPluginVersion {
  id: string
  pluginId?: string
  channel: string
  version: string
  signature?: string
  packageUrl: string
  packageKey?: string
  packageSize?: number
  iconUrl?: string
  iconKey?: string
  readmeMarkdown?: string | null
  notes?: string | null
  manifest?: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

interface DashboardPlugin {
  id: string
  userId: string
  ownerOrgId?: string | null
  name: string
  summary: string
  category: string
  installs: number
  homepage?: string | null
  isOfficial: boolean
  badges: string[]
  author?: DashboardPluginAuthor | null
  createdAt: string
  updatedAt: string
  versions?: DashboardPluginVersion[]
  latestVersion?: DashboardPluginVersion | null
}

interface DashboardUpdate {
  id: string
  title: string
  timestamp: string
  summary: string
  tags: string[]
  link: string
}

interface DashboardTeam {
  name: string
  plan: string
  slots: {
    total: number
    used: number
  }
  members: Array<{
    id: string
    name: string
    role: string
    status: string
    email?: string
  }>
  invitations: unknown[]
  upcoming?: {
    label: string
    date: string
  }
  notes?: string
  organization?: {
    id: string
    name: string
    role: string
    membersCount?: number
  } | null
}

interface DashboardImage {
  key: string
  url: string
}

export function useDashboardPluginsData() {
  const state = useAsyncData('dashboard-plugins', () =>
    $fetch<DashboardPluginResponse>('/api/dashboard/plugins'))

  const plugins = computed(() => state.data.value?.plugins ?? [])
  const featured = computed(() => state.data.value?.featured ?? [])
  const total = computed(() => state.data.value?.total ?? 0)

  return {
    ...state,
    plugins,
    featured,
    total,
  }
}

export function useDashboardUpdatesData() {
  const state = useAsyncData('dashboard-updates', () =>
    $fetch<{ updates: DashboardUpdate[] }>('/api/dashboard/updates'))

  const updates = computed(() => state.data.value?.updates ?? [])

  return {
    ...state,
    updates,
  }
}

export function useDashboardTeamData() {
  const state = useAsyncData('dashboard-team', () =>
    $fetch<{ team: DashboardTeam }>('/api/dashboard/team'))

  const team = computed(() => state.data.value?.team)

  return {
    ...state,
    team,
  }
}

export function useDashboardImagesData(options: { lazy?: boolean } = {}) {
  const state = useAsyncData(
    'dashboard-images',
    () => $fetch<{ images: DashboardImage[], total: number }>('/api/images/list'),
    {
      lazy: options.lazy ?? true,
    },
  )

  const images = computed(() => state.data.value?.images ?? [])
  const total = computed(() => state.data.value?.total ?? 0)

  return {
    ...state,
    images,
    total,
  }
}

interface SubscriptionStatus {
  plan: 'FREE' | 'PRO' | 'PLUS' | 'TEAM' | 'ENTERPRISE'
  expiresAt: string | null
  activatedAt: string | null
  isActive: boolean
  features: {
    aiRequests: { limit: number, used: number }
    aiTokens: { limit: number, used: number }
    customModels: boolean
    prioritySupport: boolean
    apiAccess: boolean
  }
}

export function useSubscriptionData() {
  const state = useAsyncData('subscription-status', () =>
    $fetch<SubscriptionStatus>('/api/subscription/status'))

  const subscription = computed(() => state.data.value)
  const plan = computed(() => state.data.value?.plan ?? 'FREE')
  const isActive = computed(() => state.data.value?.isActive ?? true)

  return {
    ...state,
    subscription,
    plan,
    isActive,
  }
}

interface TeamInvite {
  id: string
  code: string
  email: string | null
  role: string
  status: string
  expiresAt: string | null
  createdAt: string
}

export function useTeamInvitesData() {
  const state = useAsyncData('team-invites', () =>
    $fetch<{ invites: TeamInvite[] }>('/api/dashboard/team/invites'))

  const invites = computed(() => state.data.value?.invites ?? [])

  return {
    ...state,
    invites,
  }
}
