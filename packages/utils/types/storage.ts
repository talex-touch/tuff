/**
 * Plugin storage statistics
 */
export interface StorageStats {
  /** Total size in bytes */
  totalSize: number
  /** Number of files (excluding directories) */
  fileCount: number
  /** Number of directories */
  dirCount: number
  /** Maximum size limit in bytes (10MB) */
  maxSize: number
  /** Usage percentage (0-100) */
  usagePercent: number
}

/**
 * Storage tree node representing a file or directory
 */
export interface StorageTreeNode {
  /** File or directory name */
  name: string
  /** Relative path from storage root */
  path: string
  /** Node type */
  type: 'file' | 'directory'
  /** Size in bytes (for directories, this is the total size of all contained files) */
  size: number
  /** Last modified timestamp */
  modified: number
  /** Child nodes (only for directories) */
  children?: StorageTreeNode[]
}

/**
 * Detailed information about a specific file
 */
export interface FileDetails {
  /** File name */
  name: string
  /** Relative path from storage root */
  path: string
  /** File size in bytes */
  size: number
  /** Creation timestamp */
  created: number
  /** Last modified timestamp */
  modified: number
  /** File type (extension or detected type) */
  type: string
  /** File content (if available and size permits) */
  content?: any
  /** Whether content was truncated due to size */
  truncated?: boolean
}

