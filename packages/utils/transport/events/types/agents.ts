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

export type AgentStoreCategory =
  | 'productivity'
  | 'file-management'
  | 'data-processing'
  | 'search'
  | 'automation'
  | 'development'
  | 'custom'

export type AgentStoreSource = 'official' | 'community' | 'local'

export interface AgentsStoreInfo {
  id: string
  name: string
  description: string
  version: string
  author: string
  category: AgentStoreCategory
  capabilities: string[]
  tags: string[]
  downloads: number
  rating: number
  ratingCount: number
  source: AgentStoreSource
  isInstalled: boolean
  installedVersion?: string
  hasUpdate?: boolean
  createdAt: number
  updatedAt: number
  icon?: string
  homepage?: string
  repository?: string
}

export interface AgentsStoreSearchRequest {
  keyword?: string
  category?: AgentStoreCategory
  source?: AgentStoreSource
  tags?: string[]
  sortBy?: 'downloads' | 'rating' | 'updated' | 'name'
  sortOrder?: 'asc' | 'desc'
  limit?: number
  offset?: number
}

export interface AgentsStoreSearchResponse {
  agents: AgentsStoreInfo[]
  total: number
  hasMore: boolean
}

export interface AgentsStoreGetRequest {
  agentId: string
}

export type AgentsStoreGetResponse = AgentsStoreInfo | null

export type AgentsStoreFeaturedResponse = AgentsStoreInfo[]

export type AgentsStoreInstalledResponse = AgentsStoreInfo[]

export interface AgentsStoreCategoryItem {
  id: AgentStoreCategory
  name: string
  count: number
}

export type AgentsStoreCategoriesResponse = AgentsStoreCategoryItem[]

export interface AgentsStoreInstallRequest {
  agentId: string
  version?: string
  force?: boolean
}

export interface AgentsStoreInstallResponse {
  success: boolean
  agentId: string
  version: string
  message?: string
  error?: string
}

export interface AgentsStoreUninstallRequest {
  agentId: string
}

export type AgentsStoreUninstallResponse = AgentsStoreInstallResponse

export type AgentsStoreCheckUpdatesResponse = AgentsStoreInfo[]
