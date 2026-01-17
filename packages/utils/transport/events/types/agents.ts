/**
 * @fileoverview Type definitions for Agents domain events
 * @module @talex-touch/utils/transport/events/types/agents
 */

import type { AgentDescriptor, AgentResult, AgentTask, AgentTool } from '../../../../types/agent'

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

export type AgentsToolsListResponse = AgentTool[]

export interface AgentsToolsGetRequest {
  toolId: string
}

export type AgentsToolsGetResponse = AgentTool | null

export type AgentsStatsResponse = unknown

