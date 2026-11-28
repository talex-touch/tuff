import type { SubscriptionPlan } from './subscriptionStore'

export interface PlanEntitlements {
  /** Members a team on the plan can hold, the owner included; the invite check stops there. */
  seats: number
  /**
   * Intelligence API calls a week, counted from Monday, 00:00 UTC, on the team whose credits pay
   * for them (`recordWeeklyAiUsage`). Reported to clients, not enforced: credits are.
   */
  aiRequests: number
  /** Tokens those calls used, as their providers reported them, over the same window. */
  aiTokens: number
  customModels: boolean
  prioritySupport: boolean
  apiAccess: boolean
}

/**
 * What each plan includes, lowest tier first: FREE < PLUS < PRO < TEAM < ENTERPRISE, each with
 * everything in the ones before it. The team quota and the invite check read it, and so does the
 * subscription status. The account SDK carries the same numbers in `DEFAULT_PLAN_QUOTAS`
 * (`packages/utils/account/account-sdk.ts`), so change the two together. The monthly credits AI
 * calls are charged against are a separate table, `PERSONAL_QUOTA_BY_PLAN` in the credits store.
 */
export const PLAN_CATALOG: Record<SubscriptionPlan, PlanEntitlements> = {
  FREE: { seats: 1, aiRequests: 50, aiTokens: 10000, customModels: false, prioritySupport: false, apiAccess: false },
  PLUS: { seats: 1, aiRequests: 500, aiTokens: 100000, customModels: true, prioritySupport: true, apiAccess: true },
  PRO: { seats: 1, aiRequests: 2000, aiTokens: 500000, customModels: true, prioritySupport: true, apiAccess: true },
  TEAM: { seats: 5, aiRequests: 5000, aiTokens: 1000000, customModels: true, prioritySupport: true, apiAccess: true },
  ENTERPRISE: { seats: 10, aiRequests: 50000, aiTokens: 10000000, customModels: true, prioritySupport: true, apiAccess: true },
}
