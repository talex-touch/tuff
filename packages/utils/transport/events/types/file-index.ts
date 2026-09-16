/**
 * @fileoverview Type definitions for File Index events
 * @module @talex-touch/utils/transport/events/types/file-index
 */

import type { ResolvedApplication } from './app';

export type FileIndexStage =
  | "idle"
  | "cleanup"
  | "scanning"
  | "indexing"
  | "reconciliation"
  | "completed"
  | string;

export type FileIndexEstimateStatus =
  | "unknown"
  | "stabilizing"
  | "estimated"
  | "stalled"
  | "complete"
  | string;

export type FileIndexEstimateBasis =
  | "none"
  | "stage-speed"
  | "elapsed-progress"
  | "stalled"
  | "complete"
  | string;

export interface FileIndexProgress {
  stage: FileIndexStage;
  current: number;
  total: number;
  progress: number;
  startTime: number | null;
  estimatedRemainingMs: number | null;
  averageItemsPerSecond: number;
  estimateStatus?: FileIndexEstimateStatus;
  speedSampleCount?: number;
  estimateBasis?: FileIndexEstimateBasis;
}

export interface FileIndexStatus {
  isInitializing: boolean;
  initializationFailed: boolean;
  /**
   * Stable failure classification (e.g. `FILE_INDEX_DATABASE_BUSY`). Raw
   * exception text never crosses this boundary.
   */
  errorCode?: string | null;
  retryable?: boolean;
  reportId?: string | null;
  startupReady?: boolean;
  startupPending?: boolean;
  startupErrorCode?: string | null;
  progress: {
    stage: FileIndexStage | null;
    current: number;
    total: number;
  };
  startTime: number | null;
  estimatedCompletion: number | null;
  estimatedRemainingMs: number | null;
  averageItemsPerSecond: number;
  estimateStatus?: FileIndexEstimateStatus;
  speedSampleCount?: number;
  estimateBasis?: FileIndexEstimateBasis;
}

export interface FileIndexStats {
  totalFiles: number;
  failedFiles: number;
  skippedFiles: number;
  completedFiles: number;
  embeddingCompletedFiles: number;
  embeddingRows: number;
  /** Present when the stats query itself failed and values are zeroed. */
  errorCode?: string;
  reportId?: string;
}

export interface FileIndexAddPathRequest {
  path: string;
}

export interface FileIndexAddPathResult {
  success: boolean;
  status: "added" | "exists" | "invalid" | "error";
  path?: string;
  reason?: string;
  errorCode?: string;
  reportId?: string;
}

export interface FileIndexPreviewResourceRequest {
  path: string;
}

export interface FileIndexPreviewResourceResult {
  success: boolean;
  tfileUrl?: string;
  expiresAt?: number;
  errorCode?: string;
  reportId?: string;
}

export interface FileIndexDefaultApplicationRequest {
  path: string;
}

/**
 * The application the OS associates with one indexed file — the app a double-click launches.
 * `application` is null when the platform has no LaunchServices-equivalent answer (everything
 * except macOS today), when no application claims the file's type, or when the answer is not a
 * path this build can project.
 */
export interface FileIndexDefaultApplicationResult {
  success: boolean;
  application?: ResolvedApplication | null;
  errorCode?: string;
  reportId?: string;
}

export interface FileIndexRebuildRequest {
  force?: boolean;
}

export interface FileIndexRebuildResult {
  success: boolean;
  errorCode?: string;
  retryable?: boolean;
  reportId?: string;
  requiresConfirm?: boolean;
  reason?:
    | "battery-low"
    | "initializing"
    | "missing-context"
    | "policy-blocked";
  battery?: FileIndexBatteryStatus | null;
  threshold?: number;
}

/**
 * Safe failed-file summary. The absolute path and raw parser error stay in
 * main-process diagnostics; only the basename and a stable classification
 * cross to the renderer.
 */
export interface FileIndexFailedFile {
  fileId: number;
  fileName: string;
  errorCode: string | null;
  updatedAt: string | null;
}

export interface FileIndexFailedFilesResult {
  files: FileIndexFailedFile[];
  /** Present when the query itself failed and `files` is empty. */
  errorCode?: string;
  retryable?: boolean;
  reportId?: string;
}

export interface FileIndexBatteryStatus {
  level: number;
  charging: boolean;
}
