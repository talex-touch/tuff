import type { DashboardPluginResponse } from '~/types/dashboard-plugin'
import { computed } from 'vue'

type RequestLike = typeof $fetch

function resolveRequest(): RequestLike {
  return (import.meta.server ? useRequestFetch() : $fetch) as RequestLike
}

interface LocalizedText {
  zh: string
  en: string
}

interface DashboardUpdate {
  id: string
  type: 'news' | 'release'
  releaseTag: string | null
  title: LocalizedText
  timestamp: string
  summary: LocalizedText
  tags: string[]
  link: string
}

interface DashboardTeam {
  id: string
  name: string
  type: 'personal' | 'organization'
  role: 'owner' | 'admin' | 'member'
  plan: string
  collaborationEnabled: boolean
  seats: {
    total: number
    used: number
  }
  quota: {
    aiRequests: {
      limit: number
      used: number
    }
    aiTokens: {
      limit: number
      used: number
    }
  }
  permissions: {
    canInvite: boolean
    canManageMembers: boolean
    canDisband: boolean
    canCreateTeam: boolean
  }
  upgrade: {
    required: boolean
    targetPlan: 'TEAM' | null
  }
  members: Array<{
    id: string
    userId: string
    name: string
    role: string
    status: string
    email?: string
  }>
  invites: unknown[]
}

interface DashboardImage {
  key: string
  url: string
}

export function useDashboardPluginsData() {
  const request = resolveRequest()
  const state = useAsyncData(
    'dashboard-plugins',
    () => request<DashboardPluginResponse>('/api/dashboard/plugins', { timeout: 10000 }),
    {
      default: () => ({
        plugins: [],
        featured: [],
        total: 0,
      }),
    },
  )

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
  const request = resolveRequest()
  const state = useAsyncData('dashboard-updates', () =>
    request<{ updates: DashboardUpdate[] }>('/api/dashboard/updates'))

  const updates = computed(() => state.data.value?.updates ?? [])

  return {
    ...state,
    updates,
  }
}

export function useDashboardTeamData() {
  const request = resolveRequest()
  const state = useAsyncData('dashboard-team', () =>
    request<{ team: DashboardTeam }>('/api/dashboard/team'))

  const team = computed(() => state.data.value?.team)

  return {
    ...state,
    team,
  }
}

export function useDashboardImagesData(options: { lazy?: boolean } = {}) {
  const request = resolveRequest()
  const state = useAsyncData(
    'dashboard-images',
    () => request<{ images: DashboardImage[], total: number }>('/api/images/list'),
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
  team?: {
    id: string
    name: string
    type: 'personal' | 'organization'
    role: 'owner' | 'admin' | 'member'
    collaborationEnabled: boolean
    seats: { total: number, used: number }
    permissions: {
      canInvite: boolean
      canManageMembers: boolean
      canDisband: boolean
      canCreateTeam: boolean
    }
    upgrade: {
      required: boolean
      targetPlan: 'TEAM' | null
    }
    manageUrl: string
  }
}

export function useSubscriptionData() {
  const request = resolveRequest()
  const state = useAsyncData('subscription-status', () =>
    request<SubscriptionStatus>('/api/subscription/status'))

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
  const request = resolveRequest()
  const state = useAsyncData('team-invites', () =>
    request<{ invites: TeamInvite[] }>('/api/dashboard/team/invites'))

  const invites = computed(() => state.data.value?.invites ?? [])

  return {
    ...state,
    invites,
  }
}
