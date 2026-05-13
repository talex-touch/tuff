import type { H3Event } from 'h3'
import { getCookie, setCookie } from 'h3'
import { getUserById, updateUserProfile } from './authStore'
import { getCreditSummary } from './creditsStore'
import { getPlanFeatures, getUserSubscription } from './subscriptionStore'
import { resolveActiveTeamContext } from './teamContext'

export const TOOL_ECHO = 'intelligence.echo'
export const TOOL_TIME_NOW = 'intelligence.time.now'
export const TOOL_CONTEXT_MERGE = 'intelligence.context.merge'
const TOOL_NEXUS_ACCOUNT_SNAPSHOT_GET = 'intelligence.nexus.account.snapshot.get'
const TOOL_NEXUS_CREDITS_SUMMARY_GET = 'intelligence.nexus.credits.summary.get'
const TOOL_NEXUS_SUBSCRIPTION_STATUS_GET = 'intelligence.nexus.subscription.status.get'
const TOOL_NEXUS_LANGUAGE_SET = 'intelligence.nexus.language.set'
const TOOL_NEXUS_THEME_SET = 'intelligence.nexus.theme.set'

export const SUPPORTED_TOOL_IDS = [
  TOOL_ECHO,
  TOOL_TIME_NOW,
  TOOL_CONTEXT_MERGE,
  TOOL_NEXUS_ACCOUNT_SNAPSHOT_GET,
  TOOL_NEXUS_CREDITS_SUMMARY_GET,
  TOOL_NEXUS_SUBSCRIPTION_STATUS_GET,
  TOOL_NEXUS_LANGUAGE_SET,
  TOOL_NEXUS_THEME_SET,
] as const

type SupportedLocale = 'en' | 'zh'
type SupportedThemePreference = 'auto' | 'dark' | 'light'

export interface ToolExecutionContext {
  event?: H3Event
  userId?: string
}

export function normalizeLocaleCode(value: unknown): SupportedLocale | null {
  if (typeof value !== 'string')
    return null
  const locale = value.trim().toLowerCase()
  if (!locale)
    return null
  if (locale === 'zh' || locale === 'zh-cn' || locale === 'zh-hans')
    return 'zh'
  if (locale === 'en' || locale === 'en-us' || locale === 'en-gb')
    return 'en'
  return null
}

function normalizeThemePreference(value: unknown): SupportedThemePreference | null {
  if (typeof value !== 'string')
    return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'auto' || normalized === 'dark' || normalized === 'light')
    return normalized
  return null
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function toSafeNumber(value: unknown): number {
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : 0
}

function mapCreditBalance(balance: unknown): {
  quota: number
  used: number
  remaining: number
} {
  const row = asRecord(balance)
  const quota = toSafeNumber(row.quota)
  const used = toSafeNumber(row.used)
  return {
    quota,
    used,
    remaining: Math.max(0, quota - used),
  }
}

function requireToolExecutionContext(context: ToolExecutionContext, toolId: string): {
  event: H3Event
  userId: string
} {
  if (!context.event || !context.userId) {
    throw new Error(`Tool "${toolId}" requires user context.`)
  }
  return {
    event: context.event,
    userId: context.userId,
  }
}

async function readSubscriptionSnapshot(event: H3Event, userId: string) {
  const [subscription, teamContext] = await Promise.all([
    getUserSubscription(event, userId),
    resolveActiveTeamContext(event, userId),
  ])
  const features = getPlanFeatures(subscription.plan)
  const requestLimit = Number(features.aiRequestsLimit || 0)
  const requestUsed = Number(teamContext.quota.aiRequestsUsed || 0)
  const tokenLimit = Number(features.aiTokensLimit || 0)
  const tokenUsed = Number(teamContext.quota.aiTokensUsed || 0)

  return {
    subscription,
    teamContext,
    features,
    usage: {
      aiRequests: {
        limit: requestLimit,
        used: requestUsed,
        remaining: Math.max(0, requestLimit - requestUsed),
      },
      aiTokens: {
        limit: tokenLimit,
        used: tokenUsed,
        remaining: Math.max(0, tokenLimit - tokenUsed),
      },
    },
  }
}

export async function executeTool(
  toolId: string,
  input: Record<string, unknown>,
  context: ToolExecutionContext = {},
): Promise<unknown> {
  switch (toolId) {
    case TOOL_ECHO:
      return { echo: input }
    case TOOL_TIME_NOW:
      return { now: new Date().toISOString(), timestamp: Date.now() }
    case TOOL_CONTEXT_MERGE:
      return { merged: input }
    case TOOL_NEXUS_CREDITS_SUMMARY_GET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const summary = await getCreditSummary(event, userId)
      return {
        month: String(summary.month || ''),
        team: mapCreditBalance(summary.team),
        user: mapCreditBalance(summary.user),
      }
    }
    case TOOL_NEXUS_SUBSCRIPTION_STATUS_GET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const snapshot = await readSubscriptionSnapshot(event, userId)
      return {
        plan: snapshot.subscription.plan,
        isActive: snapshot.subscription.isActive,
        activatedAt: snapshot.subscription.activatedAt,
        expiresAt: snapshot.subscription.expiresAt,
        features: {
          customModels: snapshot.features.customModels,
          prioritySupport: snapshot.features.prioritySupport,
          apiAccess: snapshot.features.apiAccess,
        },
        usage: snapshot.usage,
        team: {
          id: snapshot.teamContext.team.id,
          name: snapshot.teamContext.team.name,
          type: snapshot.teamContext.team.type,
          role: snapshot.teamContext.role,
          collaborationEnabled: snapshot.teamContext.collaborationEnabled,
          seats: {
            used: snapshot.teamContext.seatsUsed,
            total: snapshot.teamContext.seatsLimit,
          },
        },
      }
    }
    case TOOL_NEXUS_ACCOUNT_SNAPSHOT_GET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const [profile, creditSummary, subscriptionSnapshot] = await Promise.all([
        getUserById(event, userId),
        getCreditSummary(event, userId),
        readSubscriptionSnapshot(event, userId),
      ])
      if (!profile) {
        throw new Error('User profile not found.')
      }

      const cookieTheme = normalizeThemePreference(getCookie(event, 'nuxt-color-mode'))
      return {
        user: {
          id: profile.id,
          email: profile.email,
          name: profile.name,
          role: profile.role,
          locale: normalizeLocaleCode(profile.locale) || profile.locale || 'en',
          emailState: profile.emailState,
        },
        subscription: {
          plan: subscriptionSnapshot.subscription.plan,
          isActive: subscriptionSnapshot.subscription.isActive,
          activatedAt: subscriptionSnapshot.subscription.activatedAt,
          expiresAt: subscriptionSnapshot.subscription.expiresAt,
        },
        usage: subscriptionSnapshot.usage,
        credits: {
          month: String(creditSummary.month || ''),
          team: mapCreditBalance(creditSummary.team),
          user: mapCreditBalance(creditSummary.user),
        },
        team: {
          id: subscriptionSnapshot.teamContext.team.id,
          name: subscriptionSnapshot.teamContext.team.name,
          type: subscriptionSnapshot.teamContext.team.type,
          role: subscriptionSnapshot.teamContext.role,
          collaborationEnabled: subscriptionSnapshot.teamContext.collaborationEnabled,
          seats: {
            used: subscriptionSnapshot.teamContext.seatsUsed,
            total: subscriptionSnapshot.teamContext.seatsLimit,
          },
        },
        themePreference: cookieTheme || 'auto',
      }
    }
    case TOOL_NEXUS_LANGUAGE_SET: {
      const { event, userId } = requireToolExecutionContext(context, toolId)
      const nextLocale = normalizeLocaleCode(input.locale ?? input.language)
      if (!nextLocale) {
        throw new Error('locale must be one of: en, zh.')
      }
      const updatedUser = await updateUserProfile(event, userId, {
        locale: nextLocale,
      })
      setCookie(event, 'tuff_locale', nextLocale, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      })
      return {
        locale: nextLocale,
        userId,
        updated: Boolean(updatedUser),
      }
    }
    case TOOL_NEXUS_THEME_SET: {
      const { event } = requireToolExecutionContext(context, toolId)
      const preference = normalizeThemePreference(input.theme ?? input.preference ?? input.mode)
      if (!preference) {
        throw new Error('theme must be one of: auto, dark, light.')
      }
      setCookie(event, 'nuxt-color-mode', preference, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      })
      setCookie(event, 'tuff_theme_preference', preference, {
        path: '/',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 365,
      })
      return {
        preference,
        updated: true,
      }
    }
    default:
      throw new Error(`Unsupported tool "${toolId}".`)
  }
}
