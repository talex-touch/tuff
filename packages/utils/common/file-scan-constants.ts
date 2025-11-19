/**
 * 全局文件扫描常量配置
 * 用于统一管理文件扫描的黑名单、白名单和过滤规则
 * 支持跨平台（Windows、macOS、Linux）
 */

// 注意：os 模块在此文件中未直接使用，但保留以备将来扩展

// ==================== 平台检测 ====================

/** 当前操作系统平台 */
export const PLATFORM = {
  IS_WINDOWS: process.platform === 'win32',
  IS_MACOS: process.platform === 'darwin',
  IS_LINUX: process.platform === 'linux',
  IS_UNIX: process.platform !== 'win32',
} as const

// ==================== 基础黑名单 ====================

/** 开发相关目录黑名单（跨平台通用） */
export const DEV_BLACKLISTED_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.npm',
  '.yarn',
  '.m2',
  'dist',
  'build',
  'target',
  'out',
  'bin',
  'cache',
  '.cache',
  '.vscode',
  '.idea',
  '.vscode-test',
  '.nyc_output',
  'coverage',
  '.nyc_output',
  'logs',
  '.logs',
  '.next',
  '.nuxt',
  '.vuepress',
  '.docusaurus',
])

/** Windows 系统目录黑名单 */
export const WINDOWS_SYSTEM_DIRS = new Set([
  'System32',
  'Windows',
  'Program Files',
  'Program Files (x86)',
  'ProgramData',
  'AppData',
  'LocalAppData',
  'Windows.old',
  'Recovery',
  'Boot',
  'EFI',
  'System Volume Information',
  '$Recycle.Bin',
])

/** macOS 系统目录黑名单 */
export const MACOS_SYSTEM_DIRS = new Set([
  'Library',
  'Application Support',
  'Applications',
  'System',
  'private',
  'usr',
  'bin',
  'sbin',
  'var',
  'tmp',
  'opt',
  'etc',
  'dev',
])

/** Linux 系统目录黑名单 */
export const LINUX_SYSTEM_DIRS = new Set([
  'bin',
  'sbin',
  'usr',
  'var',
  'tmp',
  'opt',
  'etc',
  'dev',
  'proc',
  'sys',
  'boot',
  'lib',
  'lib64',
  'mnt',
  'media',
  'srv',
])

/** 跨平台系统目录黑名单 */
export const SYSTEM_BLACKLISTED_DIRS = new Set([
  ...(PLATFORM.IS_WINDOWS ? WINDOWS_SYSTEM_DIRS : []),
  ...(PLATFORM.IS_MACOS ? MACOS_SYSTEM_DIRS : []),
  ...(PLATFORM.IS_LINUX ? LINUX_SYSTEM_DIRS : []),
])

/** 临时文件目录黑名单（跨平台） */
export const TEMP_BLACKLISTED_DIRS = new Set([
  'tmp',
  'temp',
  'temporary',
  'cache',
  '.cache',
  'logs',
  '.logs',
  // Windows 临时目录
  ...(PLATFORM.IS_WINDOWS ? ['%TEMP%', '%TMP%'] : []),
  // Unix 临时目录
  ...(PLATFORM.IS_UNIX ? ['/tmp', '/var/tmp'] : []),
])

/** 合并的基础目录黑名单 */
export const BASE_BLACKLISTED_DIRS = new Set([
  ...DEV_BLACKLISTED_DIRS,
  ...SYSTEM_BLACKLISTED_DIRS,
  ...TEMP_BLACKLISTED_DIRS,
])

// ==================== 应用特定黑名单 ====================

/** Photos Library 相关目录配置（仅 macOS） */
export const PHOTOS_LIBRARY_CONFIG = {
  /** 允许扫描的 Photos Library 子目录 */
  ALLOWED_SUBDIRS: new Set([
    'Masters',
    'Originals',
    'Resources',
    'Thumbnails',
  ]),

  /** 禁止扫描的 Photos Library 子目录 */
  BLOCKED_SUBDIRS: new Set([
    'database',
    'search',
    'Spotlight',
    'Cache',
    'index.spotlightV3',
    'NSFileProtectionCompleteUnti',
    'com.apple.photoanalysisd',
    'com.apple.photolibraryd',
  ]),

  /** Photos Library 路径模式（使用路径分隔符） */
  PATH_PATTERNS: {
    ALLOWED: [
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Masters${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Originals${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Resources${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Thumbnails${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
    ],
    BLOCKED: [
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}database${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}search${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Spotlight${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Cache${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}index.spotlightV3${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
    ],
  },
}

/** 其他应用特定目录配置（跨平台） */
export const APP_SPECIFIC_CONFIG = {
  /** iCloud 相关目录（仅 macOS） */
  ICLOUD: {
    BLOCKED_PATHS: [
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}iCloud Drive${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Mobile Documents${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
    ],
    ALLOWED_PATHS: [
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}iCloud Drive${PLATFORM.IS_WINDOWS ? '\\' : '/'}Desktop${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}iCloud Drive${PLATFORM.IS_WINDOWS ? '\\' : '/'}Documents${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
    ],
  },

  /** 浏览器缓存目录（跨平台） */
  BROWSER_CACHE: {
    BLOCKED_DIRS: new Set([
      'Chrome',
      'Firefox',
      'Safari',
      'Edge',
      'Opera',
      'Brave',
      'Vivaldi',
      'Tor Browser',
    ]),
    BLOCKED_PATHS: [
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Cache${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}cache${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Local Storage${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}Session Storage${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}IndexedDB${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
      `${PLATFORM.IS_WINDOWS ? '\\' : '/'}WebStorage${PLATFORM.IS_WINDOWS ? '\\' : '/'}`,
    ],
  },

  /** 开发工具目录（跨平台） */
  DEV_TOOLS: {
    BLOCKED_DIRS: new Set([
      '.git',
      '.svn',
      '.hg',
      'node_modules',
      '.vscode',
      '.idea',
      'dist',
      'build',
      'target',
      'out',
      '.next',
      '.nuxt',
      '.vuepress',
      '.docusaurus',
      'coverage',
      '.nyc_output',
    ]),
  },

  /** Windows 特定应用目录 */
  WINDOWS_APPS: PLATFORM.IS_WINDOWS
    ? {
        BLOCKED_DIRS: new Set([
          'WindowsApps',
          'Microsoft',
          'Windows Defender',
          'Windows Security',
          'Windows Update',
          'Windows.old',
        ]),
      }
    : undefined,

  /** Linux 特定应用目录 */
  LINUX_APPS: PLATFORM.IS_LINUX
    ? {
        BLOCKED_DIRS: new Set([
          '.local',
          '.config',
          '.cache',
          '.snap',
          '.flatpak',
          'snap',
          'flatpak',
        ]),
      }
    : undefined,
}

// ==================== 文件扩展名配置 ====================

/** 临时文件扩展名黑名单 */
export const TEMP_FILE_EXTENSIONS = new Set([
  '.tmp',
  '.temp',
  '.bak',
  '.backup',
  '.old',
  '.orig',
  '.swp',
  '.swo',
  '.~',
  '.DS_Store',
  '.Thumbs.db',
])

/** 系统文件扩展名黑名单 */
export const SYSTEM_FILE_EXTENSIONS = new Set([
  '.app',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.framework',
  '.bundle',
  '.kext',
  '.pkg',
  '.dmg',
  '.iso',
  '.img',
])

/** 数据库文件扩展名黑名单 */
export const DATABASE_FILE_EXTENSIONS = new Set([
  '.db',
  '.db-journal',
  '.db-wal',
  '.db-shm',
  '.sqlite',
  '.sqlite3',
  '.sqlite-wal',
  '.sqlite-shm',
])

/** 合并的文件扩展名黑名单 */
export const BLACKLISTED_EXTENSIONS = new Set([
  ...TEMP_FILE_EXTENSIONS,
  ...SYSTEM_FILE_EXTENSIONS,
  ...DATABASE_FILE_EXTENSIONS,
])

// ==================== 文件名模式配置 ====================

/** 文件名前缀黑名单 */
export const BLACKLISTED_FILE_PREFIXES = new Set([
  '.', // 隐藏文件
  '~', // 临时文件
  '#', // 临时文件
  '$', // 系统文件
])

/** 文件名后缀黑名单 */
export const BLACKLISTED_FILE_SUFFIXES = new Set([
  '~', // 备份文件
  '.tmp', // 临时文件
  '.bak', // 备份文件
  '.old', // 旧文件
  '.orig', // 原始文件
  '.swp', // Vim 交换文件
  '.swo', // Vim 交换文件
])

// ==================== 路径模式配置 ====================

/** 跨平台路径模式匹配器 */
export const PATH_PATTERNS = {
  /** 系统路径模式（跨平台） */
  SYSTEM_PATHS: [
    // macOS 系统路径
    ...(PLATFORM.IS_MACOS
      ? [
          /^\/System\//,
          /^\/Library\//,
          /^\/Applications\//,
          /^\/usr\//,
          /^\/bin\//,
          /^\/sbin\//,
          /^\/var\//,
          /^\/tmp\//,
          /^\/private\//,
          /^\/opt\//,
          /^\/Users\/[^/]+\/Library\//,
          /^\/Users\/[^/]+\/\./,
        ]
      : []),

    // Windows 系统路径
    ...(PLATFORM.IS_WINDOWS
      ? [
          /^[A-Z]:\\Windows\\/i,
          /^[A-Z]:\\Program Files\\/i,
          /^[A-Z]:\\Program Files \(x86\)\\/i,
          /^[A-Z]:\\ProgramData\\/i,
          /^[A-Z]:\\System32\\/i,
          /^[A-Z]:\\Users\\[^\\]+\\./i,
          /^[A-Z]:\\Users\\[^\\]+\\AppData\\/i,
        ]
      : []),

    // Linux 系统路径
    ...(PLATFORM.IS_LINUX
      ? [
          /^\/bin\//,
          /^\/sbin\//,
          /^\/usr\//,
          /^\/var\//,
          /^\/tmp\//,
          /^\/opt\//,
          /^\/etc\//,
          /^\/dev\//,
          /^\/proc\//,
          /^\/sys\//,
          /^\/boot\//,
          /^\/lib\//,
          /^\/lib64\//,
          /^\/mnt\//,
          /^\/media\//,
          /^\/srv\//,
          /^\/home\/[^/]+\/\./,
        ]
      : []),
  ],

  /** 开发路径模式（跨平台） */
  DEV_PATHS: [
    /node_modules/,
    /\.git\//,
    /\.svn\//,
    /\.hg\//,
    /dist\//,
    /build\//,
    /target\//,
    /out\//,
    /\.vscode\//,
    /\.idea\//,
    /\.next\//,
    /\.nuxt\//,
    /\.vuepress\//,
    /\.docusaurus\//,
    /coverage\//,
    /\.nyc_output\//,
  ],

  /** 缓存路径模式（跨平台） */
  CACHE_PATHS: [
    /\/cache\//i,
    /\/Cache\//,
    /\/\.cache\//,
    /\/tmp\//,
    /\/temp\//,
    /\/temporary\//,
    /\/logs\//,
    /\/\.logs\//,
    // Windows 特定缓存路径
    ...(PLATFORM.IS_WINDOWS
      ? [
          /\\AppData\\Local\\Temp\\/i,
          /\\AppData\\Local\\Microsoft\\Windows\\INetCache\\/i,
          /\\AppData\\Roaming\\Microsoft\\Windows\\Recent\\/i,
        ]
      : []),
    // Unix 特定缓存路径
    ...(PLATFORM.IS_UNIX
      ? [
          /\/var\/cache\//,
          /\/var\/tmp\//,
          /\/home\/[^/]+\/\.cache\//,
          /\/home\/[^/]+\/\.local\/share\//,
        ]
      : []),
  ],

  /** Photos Library 路径模式（仅 macOS） */
  PHOTOS_LIBRARY_PATHS: PLATFORM.IS_MACOS
    ? [
        /Photos Library\.photoslibrary\/database\//,
        /Photos Library\.photoslibrary\/search\//,
        /Photos Library\.photoslibrary\/Spotlight\//,
        /Photos Library\.photoslibrary\/Cache\//,
        /Photos Library\.photoslibrary\/index\.spotlightV3\//,
      ]
    : [],
}

// ==================== 导出配置 ====================

/**
 * 文件扫描选项配置接口
 *
 * @interface FileScanOptions
 * @description 用于配置文件扫描行为的选项集合，支持跨平台使用
 */
export interface FileScanOptions {
  /**
   * 是否启用 Photos Library 智能过滤
   * @description 仅在 macOS 上有效，自动过滤 Photos Library 的缓存和数据库目录
   * @default true
   */
  enablePhotosLibraryFilter?: boolean

  /**
   * 是否启用系统路径过滤
   * @description 自动过滤系统目录，如 /System、/Windows、/usr 等
   * @default true
   */
  enableSystemPathFilter?: boolean

  /**
   * 是否启用开发路径过滤
   * @description 自动过滤开发相关目录，如 node_modules、.git、dist 等
   * @default true
   */
  enableDevPathFilter?: boolean

  /**
   * 是否启用缓存路径过滤
   * @description 自动过滤缓存目录，如 /tmp、/cache、AppData 等
   * @default true
   */
  enableCachePathFilter?: boolean

  /**
   * 自定义黑名单目录
   * @description 额外的目录黑名单，会与默认黑名单合并
   * @default undefined
   */
  customBlacklistedDirs?: Set<string>

  /**
   * 自定义黑名单扩展名
   * @description 额外的文件扩展名黑名单，会与默认黑名单合并
   * @default undefined
   */
  customBlacklistedExtensions?: Set<string>

  /**
   * 自定义排除路径
   * @description 完全排除的路径集合，优先级最高
   * @default undefined
   */
  customExcludePaths?: Set<string>

  /**
   * 是否启用严格模式
   * @description 启用更严格的过滤规则，可能影响扫描性能
   * @default false
   */
  strictMode?: boolean
}

/**
 * 默认扫描选项配置
 *
 * @constant DEFAULT_SCAN_OPTIONS
 * @description 适用于大多数场景的默认扫描配置
 * @example
 * ```typescript
 * const files = await scanDirectory('/path', undefined, DEFAULT_SCAN_OPTIONS)
 * ```
 */
export const DEFAULT_SCAN_OPTIONS: FileScanOptions = {
  enablePhotosLibraryFilter: true,
  enableSystemPathFilter: true,
  enableDevPathFilter: true,
  enableCachePathFilter: true,
  strictMode: false,
}

/**
 * 严格模式扫描选项配置
 *
 * @constant STRICT_SCAN_OPTIONS
 * @description 启用所有过滤选项的严格模式配置
 * @example
 * ```typescript
 * const files = await scanDirectory('/path', undefined, STRICT_SCAN_OPTIONS)
 * ```
 */
export const STRICT_SCAN_OPTIONS: FileScanOptions = {
  enablePhotosLibraryFilter: true,
  enableSystemPathFilter: true,
  enableDevPathFilter: true,
  enableCachePathFilter: true,
  strictMode: true,
}
