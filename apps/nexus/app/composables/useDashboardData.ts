import type { DashboardPluginResponse } from '~/types/dashboard-plugin'
import { computed } from 'vue'

type RequestLike = typeof $fetch

function resolveRequest(): RequestLike {
  return (import.meta.server ? useRequestFetch() : $fetch) as RequestLike
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
  const request = resolveRequest()
  const state = useAsyncData('dashboard-plugins', () =>
    request<DashboardPluginResponse>('/api/dashboard/plugins'))

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
