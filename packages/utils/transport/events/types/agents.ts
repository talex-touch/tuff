/**
 * @fileoverview Type definitions for Agents domain events
 * @module @talex-touch/utils/transport/events/types/agents
 */

import type {
  AgentDescriptor,
  AgentResult,
  AgentTask,
  AgentTool,
  TaskProgress,
} from '../../../types/agent'

export type AgentsListResponse = AgentDescriptor[]

export interface AgentsGetRequest {
  id: string
}

export type AgentsGetResponse = AgentDescriptor | null

export type AgentsExecuteRequest = AgentTask

export interface AgentsExecuteResponse {
  taskId: string
}

export type AgentsExecuteImmediateRequest = AgentTask

export type AgentsExecuteImmediateResponse = AgentResult

export interface AgentsCancelRequest {
  taskId: string
}

export interface AgentsCancelResponse {
  success: boolean
}

export interface AgentsTaskStatusRequest {
  taskId: string
}

export interface AgentsTaskStatusResponse {
  status: string
}

export interface AgentsUpdatePriorityRequest {
  taskId?: string
  priority?: number
}

export interface AgentsUpdatePriorityResponse {
  success: boolean
}

export interface AgentsTaskStartedPayload {
  taskId: string
  agentId: string
}

export type AgentsTaskProgressPayload = TaskProgress

export interface AgentsTaskCompletedPayload {
  taskId: string
  result: AgentResult
}

export interface AgentsTaskFailedPayload {
  taskId: string
  error?: string
}

export interface AgentsTaskCancelledPayload {
  taskId: string
}

export type AgentsToolsListResponse = AgentTool[]

export interface AgentsToolsGetRequest {
  toolId: string
}

export type AgentsToolsGetResponse = AgentTool | null

export type AgentsStatsResponse = unknown

export type AgentMarketCategory =
  | 'productivity'
  | 'file-management'
  | 'data-processing'
  | 'search'
  | 'automation'
  | 'development'
  | 'custom'

export type AgentMarketSource = 'official' | 'community' | 'local'

export interface AgentsMarketInfo {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: AgentMarketCategory
  capabilities: string[]
  tags: string[]
  downloads: number
  rating: number
  ratingCount: number
  source: AgentMarketSource
  isInstalled: boolean
  installedVersion?: string
  hasUpdate?: boolean
  createdAt: number
  updatedAt: number
  icon?: string
  homepage?: string
  repository?: string
}

export interface AgentsMarketSearchRequest {
  keyword?: string
  category?: AgentMarketCategory
  source?: AgentMarketSource
  tags?: string[]
  sortBy?: 'downloads' | 'rating' | 'updated' | 'name'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface AgentsMarketSearchResponse {
  agents: AgentsMarketInfo[]
  total: number
  hasMore: boolean
}

export interface AgentsMarketGetRequest {
  agentId: string
}

export type AgentsMarketGetResponse = AgentsMarketInfo | null

export type AgentsMarketFeaturedResponse = AgentsMarketInfo[]

export type AgentsMarketInstalledResponse = AgentsMarketInfo[]

export interface AgentsMarketCategoryItem {
  id: AgentMarketCategory
  name: string
  count: number
}

export type AgentsMarketCategoriesResponse = AgentsMarketCategoryItem[]

export interface AgentsMarketInstallRequest {
  agentId: string
  version?: string
  force?: boolean
}

export interface AgentsMarketInstallResponse {
  success: boolean
  agentId: string
  version: string
  message?: string
  error?: string
}

export interface AgentsMarketUninstallRequest {
  agentId: string
}

export type AgentsMarketUninstallResponse = AgentsMarketInstallResponse

export type AgentsMarketCheckUpdatesResponse = AgentsMarketInfo[]
