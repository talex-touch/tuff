const PLUGIN_NAME = 'touch-svg-craft'
const FEATURE_ID = 'svg-craft'
const SOURCE_ID = 'plugin-features'
const ACTION_GROUP = 'svg-craft'
const ICON = { type: 'file', value: 'assets/logo.svg' }
const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const COMMAND_PREFIXES = [
  'svg',
  'icon',
  'icons',
  'vector',
  'svgo',
  'jsx-svg',
  '图标',
  '矢量',
  'svg优化',
]

// 86 curated 24x24 geometric stroke icons across 5 categories: UI (20), Dev (18), Media (16), Nav (16), Status (16)
const ICON_CATALOG = [
  // --- UI (20) ---
  {
    name: 'search',
    category: 'ui',
    tags: ['find', 'magnifier', 'lookup', '搜索', '查找'],
    body: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  },
  {
    name: 'plus',
    category: 'ui',
    tags: ['add', 'new', 'create', '添加', '新增', '加号'],
    body: '<path d="M5 12h14"/><path d="M12 5v14"/>',
  },
  {
    name: 'minus',
    category: 'ui',
    tags: ['remove', 'subtract', '减号', '移除'],
    body: '<path d="M5 12h14"/>',
  },
  {
    name: 'x',
    category: 'ui',
    tags: ['close', 'cancel', 'dismiss', '关闭', '取消'],
    body: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  },
  {
    name: 'check',
    category: 'ui',
    tags: ['done', 'ok', 'confirm', '勾选', '完成'],
    body: '<path d="M20 6 9 17l-5-5"/>',
  },
  {
    name: 'edit',
    category: 'ui',
    tags: ['pencil', 'write', 'modify', '编辑', '修改'],
    body: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  },
  {
    name: 'trash',
    category: 'ui',
    tags: ['delete', 'bin', 'remove', '删除', '回收站'],
    body: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  },
  {
    name: 'copy',
    category: 'ui',
    tags: ['duplicate', 'clone', '复制'],
    body: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  },
  {
    name: 'clipboard',
    category: 'ui',
    tags: ['paste', 'board', '剪贴板'],
    body: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  },
  {
    name: 'download',
    category: 'ui',
    tags: ['save', 'export', '下载', '导出'],
    body: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  },
  {
    name: 'upload',
    category: 'ui',
    tags: ['import', 'cloud', '上传', '导入'],
    body: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  },
  {
    name: 'share',
    category: 'ui',
    tags: ['send', 'network', '分享'],
    body: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  },
  {
    name: 'filter',
    category: 'ui',
    tags: ['funnel', 'sort', '筛选', '过滤'],
    body: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
  },
  {
    name: 'sliders',
    category: 'ui',
    tags: ['controls', 'adjust', 'tune', '滑块', '调节'],
    body: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
  },
  {
    name: 'settings',
    category: 'ui',
    tags: ['gear', 'cog', 'config', 'preferences', '设置', '配置'],
    body: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.604.852.997 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/>',
  },
  {
    name: 'eye',
    category: 'ui',
    tags: ['view', 'show', 'preview', 'visible', '查看', '预览'],
    body: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
  },
  {
    name: 'eye-off',
    category: 'ui',
    tags: ['hide', 'invisible', 'mask', '隐藏'],
    body: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/>',
  },
  {
    name: 'lock',
    category: 'ui',
    tags: ['security', 'private', 'password', '锁', '安全'],
    body: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  },
  {
    name: 'unlock',
    category: 'ui',
    tags: ['open', 'security', '解锁'],
    body: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/>',
  },
  {
    name: 'heart',
    category: 'ui',
    tags: ['like', 'favorite', 'love', '收藏', '喜欢', '爱心'],
    body: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  },

  // --- Dev (18) ---
  {
    name: 'code',
    category: 'dev',
    tags: ['brackets', 'html', 'programming', '代码', '开发'],
    body: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  },
  {
    name: 'terminal',
    category: 'dev',
    tags: ['cli', 'shell', 'console', 'bash', '终端', '命令行'],
    body: '<polyline points="4 17 10 11 4 5"/><line x1="12" x2="20" y1="19" y2="19"/>',
  },
  {
    name: 'git-branch',
    category: 'dev',
    tags: ['git', 'branch', 'vcs', '分支'],
    body: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  },
  {
    name: 'git-commit',
    category: 'dev',
    tags: ['git', 'commit', 'revision', '提交'],
    body: '<circle cx="12" cy="12" r="3"/><line x1="3" x2="9" y1="12" y2="12"/><line x1="15" x2="21" y1="12" y2="12"/>',
  },
  {
    name: 'git-merge',
    category: 'dev',
    tags: ['git', 'merge', '合并'],
    body: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/>',
  },
  {
    name: 'git-pull-request',
    category: 'dev',
    tags: ['git', 'pr', 'review', '拉取请求'],
    body: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" x2="6" y1="9" y2="21"/>',
  },
  {
    name: 'bug',
    category: 'dev',
    tags: ['debug', 'issue', 'error', '缺陷', '调试'],
    body: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  },
  {
    name: 'database',
    category: 'dev',
    tags: ['db', 'sql', 'storage', 'postgres', '数据库'],
    body: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/>',
  },
  {
    name: 'server',
    category: 'dev',
    tags: ['host', 'backend', 'rack', '服务器'],
    body: '<rect width="20" height="8" x="2" y="2" rx="2" ry="2"/><rect width="20" height="8" x="2" y="14" rx="2" ry="2"/><line x1="6" x2="6.01" y1="6" y2="6"/><line x1="6" x2="6.01" y1="18" y2="18"/>',
  },
  {
    name: 'cpu',
    category: 'dev',
    tags: ['chip', 'hardware', 'processor', '芯片', '处理器'],
    body: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2"/><path d="M15 20v2"/><path d="M2 15h2"/><path d="M2 9h2"/><path d="M20 15h2"/><path d="M20 9h2"/><path d="M9 2v2"/><path d="M9 20v2"/>',
  },
  {
    name: 'braces',
    category: 'dev',
    tags: ['json', 'object', 'curly', '花括号'],
    body: '<path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5c0 1.1.9 2 2 2h1"/><path d="M16 21h1a2 2 0 0 0 2-2v-5c0-1.1.9-2 2-2a2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"/>',
  },
  {
    name: 'package',
    category: 'dev',
    tags: ['npm', 'bundle', 'module', '包', '依赖'],
    body: '<path d="m7.5 4.27 9 5.15"/><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  },
  {
    name: 'file-code',
    category: 'dev',
    tags: ['source', 'script', 'document', '代码文件'],
    body: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/>',
  },
  {
    name: 'folder',
    category: 'dev',
    tags: ['dir', 'directory', '文件夹', '目录'],
    body: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  },
  {
    name: 'folder-open',
    category: 'dev',
    tags: ['directory', 'workspace', '打开目录'],
    body: '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/>',
  },
  {
    name: 'key',
    category: 'dev',
    tags: ['token', 'auth', 'secret', 'ssh', '密钥'],
    body: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/>',
  },
  {
    name: 'webhook',
    category: 'dev',
    tags: ['api', 'callback', 'event', '回调', '钩子'],
    body: '<path d="M18 16.98h-5.99c-1.1 0-1.95.94-2.48 1.9A4 4 0 0 1 2 17c.01-.7.2-1.4.57-2"/><path d="m6 17 3.13-5.78c.53-.97.1-2.18-.5-3.1a4 4 0 1 1 6.89-4.06"/><path d="m12 6 3.13 5.73C15.66 12.7 16.9 13 18 13a4 4 0 0 1 0 8"/>',
  },
  {
    name: 'box',
    category: 'dev',
    tags: ['container', 'cube', 'docker', '容器', '立方体'],
    body: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>',
  },

  // --- Media (16) ---
  {
    name: 'play',
    category: 'media',
    tags: ['start', 'video', 'audio', '播放'],
    body: '<polygon points="6 3 20 12 6 21 6 3"/>',
  },
  {
    name: 'pause',
    category: 'media',
    tags: ['hold', 'video', 'audio', '暂停'],
    body: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
  },
  {
    name: 'stop',
    category: 'media',
    tags: ['square', 'end', '停止'],
    body: '<rect width="14" height="14" x="5" y="5" rx="2"/>',
  },
  {
    name: 'skip-back',
    category: 'media',
    tags: ['previous', 'rewind', '上一曲'],
    body: '<polygon points="19 20 9 12 19 4 19 20"/><line x1="5" x2="5" y1="19" y2="5"/>',
  },
  {
    name: 'skip-forward',
    category: 'media',
    tags: ['next', 'fast-forward', '下一曲'],
    body: '<polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/>',
  },
  {
    name: 'volume-2',
    category: 'media',
    tags: ['sound', 'audio', 'speaker', '音量', '声音'],
    body: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>',
  },
  {
    name: 'volume-x',
    category: 'media',
    tags: ['mute', 'silent', '静音'],
    body: '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="22" x2="16" y1="9" y2="15"/><line x1="16" x2="22" y1="9" y2="15"/>',
  },
  {
    name: 'mic',
    category: 'media',
    tags: ['microphone', 'voice', 'record', '麦克风', '语音'],
    body: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
  },
  {
    name: 'camera',
    category: 'media',
    tags: ['photo', 'capture', 'snapshot', '相机', '拍照'],
    body: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  },
  {
    name: 'video',
    category: 'media',
    tags: ['record', 'meeting', 'camcorder', '视频', '录像'],
    body: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  },
  {
    name: 'image',
    category: 'media',
    tags: ['picture', 'photo', 'gallery', '图片', '相册'],
    body: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>',
  },
  {
    name: 'music',
    category: 'media',
    tags: ['note', 'song', 'audio', '音乐'],
    body: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
  },
  {
    name: 'film',
    category: 'media',
    tags: ['movie', 'cinema', 'clip', '影片', '电影'],
    body: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>',
  },
  {
    name: 'maximize',
    category: 'media',
    tags: ['fullscreen', 'expand', '全屏', '放大'],
    body: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
  },
  {
    name: 'minimize',
    category: 'media',
    tags: ['exit-fullscreen', 'shrink', '退出全屏', '缩小'],
    body: '<path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/>',
  },
  {
    name: 'crop',
    category: 'media',
    tags: ['trim', 'cut', 'frame', '裁剪'],
    body: '<path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/>',
  },

  // --- Nav (16) ---
  {
    name: 'home',
    category: 'nav',
    tags: ['house', 'main', 'dashboard', '首页', '主页'],
    body: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  },
  {
    name: 'menu',
    category: 'nav',
    tags: ['hamburger', 'bars', 'drawer', '菜单'],
    body: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
  },
  {
    name: 'arrow-up',
    category: 'nav',
    tags: ['up', 'top', 'north', '上箭头'],
    body: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  },
  {
    name: 'arrow-down',
    category: 'nav',
    tags: ['down', 'bottom', 'south', '下箭头'],
    body: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
  },
  {
    name: 'arrow-left',
    category: 'nav',
    tags: ['back', 'previous', 'west', '左箭头', '返回'],
    body: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  },
  {
    name: 'arrow-right',
    category: 'nav',
    tags: ['next', 'forward', 'east', '右箭头', '前进'],
    body: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  },
  {
    name: 'chevron-up',
    category: 'nav',
    tags: ['collapse', 'caret', '收起'],
    body: '<path d="m18 15-6-6-6 6"/>',
  },
  {
    name: 'chevron-down',
    category: 'nav',
    tags: ['expand', 'dropdown', '展开', '下拉'],
    body: '<path d="m6 9 6 6 6-6"/>',
  },
  {
    name: 'chevron-left',
    category: 'nav',
    tags: ['prev', 'back', '向左'],
    body: '<path d="m15 18-6-6 6-6"/>',
  },
  {
    name: 'chevron-right',
    category: 'nav',
    tags: ['next', 'more', '向右'],
    body: '<path d="m9 18 6-6-6-6"/>',
  },
  {
    name: 'external-link',
    category: 'nav',
    tags: ['open', 'outbound', 'url', '外部链接'],
    body: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  },
  {
    name: 'compass',
    category: 'nav',
    tags: ['explore', 'discover', 'direction', '指南针', '发现'],
    body: '<circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/>',
  },
  {
    name: 'map-pin',
    category: 'nav',
    tags: ['location', 'place', 'gps', '定位', '坐标'],
    body: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  },
  {
    name: 'globe',
    category: 'nav',
    tags: ['world', 'web', 'i18n', 'language', '全球', '语言'],
    body: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  },
  {
    name: 'sidebar',
    category: 'nav',
    tags: ['panel', 'layout', 'drawer', '侧边栏'],
    body: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/>',
  },
  {
    name: 'layers',
    category: 'nav',
    tags: ['stack', 'design', 'pages', '图层', '层级'],
    body: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
  },

  // --- Status (16) ---
  {
    name: 'info',
    category: 'status',
    tags: ['details', 'about', 'hint', '信息', '提示'],
    body: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  },
  {
    name: 'alert-triangle',
    category: 'status',
    tags: ['warning', 'caution', 'risk', '警告', '注意'],
    body: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  },
  {
    name: 'alert-circle',
    category: 'status',
    tags: ['error', 'exclamation', '异常', '告警'],
    body: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  },
  {
    name: 'check-circle',
    category: 'status',
    tags: ['success', 'passed', 'verified', '成功', '通过'],
    body: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/>',
  },
  {
    name: 'x-circle',
    category: 'status',
    tags: ['failed', 'error', 'reject', '失败', '错误'],
    body: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  },
  {
    name: 'help-circle',
    category: 'status',
    tags: ['question', 'faq', 'support', '帮助', '问号'],
    body: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  },
  {
    name: 'bell',
    category: 'status',
    tags: ['notification', 'alarm', 'alert', '通知', '铃铛'],
    body: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  },
  {
    name: 'shield',
    category: 'status',
    tags: ['protect', 'security', 'guard', '盾牌', '安全'],
    body: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  },
  {
    name: 'shield-check',
    category: 'status',
    tags: ['verified', 'trust', 'safe', '认证', '可信'],
    body: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  },
  {
    name: 'zap',
    category: 'status',
    tags: ['lightning', 'fast', 'power', 'bolt', '闪电', '性能'],
    body: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  },
  {
    name: 'flame',
    category: 'status',
    tags: ['fire', 'hot', 'trending', '火焰', '热门'],
    body: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
  },
  {
    name: 'sparkles',
    category: 'status',
    tags: ['ai', 'magic', 'stars', '闪光', '智能'],
    body: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/><path d="M5 3v4"/><path d="M19 17v4"/><path d="M3 5h4"/><path d="M17 19h4"/>',
  },
  {
    name: 'clock',
    category: 'status',
    tags: ['time', 'schedule', 'pending', '时钟', '时间'],
    body: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  },
  {
    name: 'loader',
    category: 'status',
    tags: ['spinner', 'loading', 'progress', '加载中'],
    body: '<path d="M12 2v4"/><path d="m16.2 7.8 2.9-2.9"/><path d="M18 12h4"/><path d="m16.2 16.2 2.9 2.9"/><path d="M12 18v4"/><path d="m4.9 19.1 2.9-2.9"/><path d="M2 12h4"/><path d="m4.9 4.9 2.9 2.9"/>',
  },
  {
    name: 'wifi',
    category: 'status',
    tags: ['network', 'online', 'signal', '无线', '网络'],
    body: '<path d="M12 20h.01"/><path d="M2 8.82a15 15 0 0 1 20 0"/><path d="M5 12.859a10 10 0 0 1 14 0"/><path d="M8.5 16.429a5 5 0 0 1 7 0"/>',
  },
  {
    name: 'battery',
    category: 'status',
    tags: ['power', 'charge', 'energy', '电池', '电量'],
    body: '<rect width="16" height="10" x="2" y="7" rx="2" ry="2"/><line x1="22" x2="22" y1="11" y2="13"/>',
  },
]

const CATEGORIES = ['ui', 'dev', 'media', 'nav', 'status']

let triggerGeneration = 0
let destroyed = false

function getPlugin() {
  return globalThis.plugin
}

function getClipboard() {
  return globalThis.clipboard
}

function getPermission() {
  return globalThis.permission
}

function getLogger() {
  return globalThis.logger
}

function getBuilder() {
  return globalThis.TuffItemBuilder
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function getQueryText(query) {
  if (typeof query === 'string')
    return query
  return query?.text ?? query?.query ?? ''
}

function utf8ByteLength(text) {
  return new TextEncoder().encode(String(text)).length
}

function encodeBase64Utf8(text) {
  const bytes = new TextEncoder().encode(String(text))
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const triple = (a << 16) | (b << 8) | c
    out += BASE64_ALPHABET[(triple >>> 18) & 0x3F]
    out += BASE64_ALPHABET[(triple >>> 12) & 0x3F]
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >>> 6) & 0x3F] : '='
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 0x3F] : '='
  }
  return out
}

function toPascalCase(name) {
  const words = String(name || 'SvgIcon')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  if (!words.length)
    return 'SvgIcon'
  const pascal = words.map(w => `${w[0].toUpperCase()}${w.slice(1).toLowerCase()}`).join('')
  return /^[0-9]/.test(pascal) ? `Icon${pascal}` : pascal
}

function renderCatalogIconSvg(icon, options = {}) {
  const size = options.size || 24
  const color = options.color || 'currentColor'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${icon.body}</svg>`
}

function normalizeNumericToken(rawNum) {
  const num = Number.parseFloat(rawNum)
  if (!Number.isFinite(num))
    return rawNum
  const rounded = Math.round(num * 1000) / 1000
  if (Object.is(rounded, -0) || rounded === 0)
    return '0'
  return String(rounded)
}

function optimizeSvg(rawInput) {
  const original = String(rawInput ?? '').trim()
  const beforeBytes = utf8ByteLength(original)

  let svg = original
  // 1. Strip XML prolog and DOCTYPE
  svg = svg.replace(/<\?xml[\s\S]*?\?>/gi, '')
  svg = svg.replace(/<!DOCTYPE[\s\S]*?>/gi, '')
  // 2. Strip HTML/XML comments
  svg = svg.replace(/<!--[\s\S]*?-->/g, '')
  // 3. Strip editor metadata blocks (Illustrator / Inkscape / Sodipodi / Sketch / empty desc)
  svg = svg.replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, '')
  svg = svg.replace(/<sodipodi:namedview\b[^>]*>[\s\S]*?<\/sodipodi:namedview>/gi, '')
  svg = svg.replace(/<sodipodi:namedview\b[^>]*\/>/gi, '')
  svg = svg.replace(/<inkscape:perspective\b[^>]*\/>/gi, '')
  svg = svg.replace(/<desc\b[^>]*>\s*<\/desc>/gi, '')

  // Extract from <svg ...> through </svg> if surrounded by extra text
  const svgSliceMatch = /<svg\b[\s\S]*<\/svg>/i.exec(svg)
  if (svgSliceMatch) {
    svg = svgSliceMatch[0]
  }

  // 4. Strip editor namespaces & redundant attributes
  svg = svg.replace(/\s+(?:xmlns:(?:inkscape|sodipodi|sketch|dc|cc|rdf|serif|i|graph|x)|(?:inkscape|sodipodi|sketch|serif):[\w-]+|data-name|xml:space|enable-background)\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
  svg = svg.replace(/\s+version\s*=\s*(?:"1\.[01]"|'1\.[01]')/gi, '')
  if (!/\bxlink:/i.test(svg.replace(/\bxmlns:xlink\s*=\s*(?:"[^"]*"|'[^']*')/gi, ''))) {
    svg = svg.replace(/\s+xmlns:xlink\s*=\s*(?:"[^"]*"|'[^']*')/gi, '')
  }

  // 5. Iteratively remove empty <g> and <defs> containers
  let prev = ''
  for (let pass = 0; pass < 6 && svg !== prev; pass += 1) {
    prev = svg
    svg = svg.replace(/<(g|defs)\b[^>]*>\s*<\/\1>/gi, '')
    svg = svg.replace(/<(g|defs)\b[^>]*\/>/gi, '')
  }

  // 6. Collapse whitespace between tags and normalize internal tag spacing
  svg = svg.replace(/>\s+</g, '><')
  svg = svg.replace(/<([^>]+)>/g, (full, inner) => {
    const collapsed = inner
      .replace(/\s+/g, ' ')
      .replace(/\s*=\s*/g, '=')
      .replace(/\s+\/$/, '/')
      .trim()
    return `<${collapsed}>`
  })

  // 7. Normalize trailing decimal zeros in numeric attribute values (e.g. "12.000" -> "12")
  svg = svg.replace(/(\b(?:x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|stroke-width|opacity|fill-opacity|stroke-opacity|viewBox)\s*=\s*")([^"]+)(")/gi, (_, pre, val, post) => {
    const normalizedVal = val.replace(/-?\d+\.\d+/g, num => normalizeNumericToken(num))
    return `${pre}${normalizedVal}${post}`
  })

  // 8. Ensure xmlns and derive missing viewBox from numeric width/height
  svg = svg.replace(/<svg\b([^>]*)>/i, (full, attrs) => {
    let nextAttrs = attrs
    if (!/\bxmlns\s*=/i.test(nextAttrs)) {
      nextAttrs = ` xmlns="http://www.w3.org/2000/svg"${nextAttrs}`
    }
    if (!/\bviewBox\s*=/i.test(nextAttrs)) {
      const wMatch = /\bwidth\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i.exec(nextAttrs)
      const hMatch = /\bheight\s*=\s*"(\d+(?:\.\d+)?)(?:px)?"/i.exec(nextAttrs)
      if (wMatch && hMatch) {
        const w = normalizeNumericToken(wMatch[1])
        const h = normalizeNumericToken(hMatch[1])
        nextAttrs = `${nextAttrs} viewBox="0 0 ${w} ${h}"`
      }
    }
    return `<svg${nextAttrs}>`
  })

  svg = svg.trim()
  const afterBytes = utf8ByteLength(svg)
  const savedBytes = Math.max(0, beforeBytes - afterBytes)
  const savedPercent = beforeBytes > 0 ? Math.round((savedBytes / beforeBytes) * 1000) / 10 : 0

  return {
    svg,
    beforeBytes,
    afterBytes,
    savedBytes,
    savedPercent,
  }
}

function kebabToCamel(attr) {
  return attr.replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())
}

function convertStyleAttrToJsx(styleText) {
  const entries = styleText
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .map((decl) => {
      const colon = decl.indexOf(':')
      if (colon <= 0)
        return null
      const prop = kebabToCamel(decl.slice(0, colon).trim().toLowerCase())
      const value = decl.slice(colon + 1).trim().replace(/'/g, '\\\'')
      return `${prop}: '${value}'`
    })
    .filter(Boolean)
  return `style={{ ${entries.join(', ')} }}`
}

function svgToReactJsx(svgString, componentName = 'SvgIcon') {
  const safeName = toPascalCase(componentName)
  let jsx = svgString.replace(/<([a-z][\w:-]*)([^>]*?)(\/?)>/gi, (full, tag, attrs, selfClose) => {
    if (!attrs)
      return full
    let nextAttrs = attrs
      .replace(/\s+style\s*=\s*"([^"]*)"/gi, (_, styleVal) => ` ${convertStyleAttrToJsx(styleVal)}`)
      .replace(/\s+([a-zA-Z_:][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/g, (attrFull, attrName, attrVal) => {
        const lower = attrName.toLowerCase()
        if (lower.startsWith('data-') || lower.startsWith('aria-'))
          return ` ${lower}=${attrVal}`
        if (lower === 'class')
          return ` className=${attrVal}`
        if (lower === 'for')
          return ` htmlFor=${attrVal}`
        if (lower === 'xlink:href')
          return ` xlinkHref=${attrVal}`
        if (lower === 'xmlns:xlink')
          return ` xmlnsXlink=${attrVal}`
        if (lower === 'xml:lang')
          return ` xmlLang=${attrVal}`
        if (lower.includes('-'))
          return ` ${kebabToCamel(lower)}=${attrVal}`
        return ` ${attrName}=${attrVal}`
      })

    if (tag.toLowerCase() === 'svg') {
      nextAttrs = `${nextAttrs} {...props}`
    }
    return `<${tag}${nextAttrs}${selfClose}>`
  })

  return [
    `export function ${safeName}(props) {`,
    '  return (',
    `    ${jsx}`,
    '  )',
    '}',
  ].join('\n')
}

function svgToVueSfc(svgString, componentName = 'SvgIcon') {
  const safeName = toPascalCase(componentName)
  const templated = svgString.replace(/<svg\b([^>]*)>/i, '<svg$1 :class="props.class">')
  return [
    '<script setup lang="ts">',
    `defineOptions({ name: '${safeName}' })`,
    'const props = defineProps<{ class?: string }>()',
    '</script>',
    '',
    '<template>',
    `  ${templated}`,
    '</template>',
  ].join('\n')
}

function svgToCssDataUri(svgString) {
  const encoded = svgString
    .replace(/%/g, '%25')
    .replace(/#/g, '%23')
    .replace(/"/g, '\'')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/\{/g, '%7B')
    .replace(/\}/g, '%7D')
    .replace(/\s+/g, ' ')
    .trim()
  return `url("data:image/svg+xml,${encoded}")`
}

function svgToBase64DataUrl(svgString) {
  return `data:image/svg+xml;base64,${encodeBase64Utf8(svgString)}`
}

function stripCommandPrefix(rawQuery) {
  const normalized = normalizeText(rawQuery)
  if (!normalized)
    return { prefix: '', rest: '' }
  if (isRawSvgInput(normalized))
    return { prefix: 'svg', rest: normalized }

  const lower = normalized.toLowerCase()
  for (const prefix of COMMAND_PREFIXES) {
    const candidate = prefix.toLowerCase()
    if (lower === candidate)
      return { prefix: candidate, rest: '' }
    if (lower.startsWith(`${candidate} `) || lower.startsWith(`${candidate}:`)) {
      const offset = prefix.length + (lower.startsWith(`${candidate}:`) ? 1 : 0)
      return { prefix: candidate, rest: normalized.slice(offset).trim() }
    }
  }
  return { prefix: '', rest: normalized }
}

function isRawSvgInput(text) {
  const trimmed = normalizeText(text)
  return /<svg\b/i.test(trimmed) && /<\/svg>/i.test(trimmed)
}

function parseIconSearchOptions(rest) {
  const tokens = normalizeText(rest).split(/\s+/).filter(Boolean)
  let size = 24
  let color = 'currentColor'
  let categoryFilter = ''
  const queryTerms = []

  for (const token of tokens) {
    if (/^cat:(ui|dev|media|nav|status)$/i.test(token)) {
      categoryFilter = token.slice(4).toLowerCase()
      continue
    }
    if (/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(token)) {
      color = token.toUpperCase()
      continue
    }
    if (/^\d{2,3}$/.test(token)) {
      const numeric = Number.parseInt(token, 10)
      if (numeric >= 12 && numeric <= 128) {
        size = numeric
        continue
      }
    }
    queryTerms.push(token)
  }

  return {
    size,
    color,
    categoryFilter,
    term: queryTerms.join(' ').trim(),
  }
}

function scoreIcon(icon, term, categoryFilter) {
  if (categoryFilter && icon.category !== categoryFilter)
    return 0
  const q = normalizeText(term).toLowerCase()
  if (!q)
    return 10
  if (icon.name === q)
    return 120
  if (icon.category === q)
    return 95
  if (icon.name.startsWith(q))
    return 90
  if (icon.tags.some(tag => tag.toLowerCase() === q))
    return 85
  if (icon.name.includes(q))
    return 75
  if (icon.tags.some(tag => tag.toLowerCase().includes(q)))
    return 60
  const haystack = `${icon.name} ${icon.category} ${icon.tags.join(' ')}`.toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length > 1 && words.every(w => haystack.includes(w)))
    return 50
  return 0
}

function buildInfoItem({ id, featureId, title, subtitle }) {
  const Builder = getBuilder()
  return new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({ pluginName: PLUGIN_NAME, featureId })
    .build()
}

function buildActionItem({ id, featureId, title, subtitle, actions }) {
  const Builder = getBuilder()
  const builder = new Builder(id)
    .setSource('plugin', SOURCE_ID, PLUGIN_NAME)
    .setTitle(title)
    .setSubtitle(subtitle)
    .setIcon(ICON)
    .setMeta({
      pluginName: PLUGIN_NAME,
      featureId,
      defaultAction: ACTION_GROUP,
    })

  for (const action of actions) {
    builder.createAndAddAction(action.id, 'plugin', action.title, action.payload)
  }
  return builder.build()
}

function buildConverterItems(featureId, svgString, componentName, stats = null) {
  const vueSfc = svgToVueSfc(svgString, componentName)
  const reactJsx = svgToReactJsx(svgString, componentName)
  const cssDataUri = svgToCssDataUri(svgString)
  const base64Url = svgToBase64DataUrl(svgString)

  const savingsLabel = stats
    ? `${stats.beforeBytes} B → ${stats.afterBytes} B (-${stats.savedPercent}%)`
    : `${utf8ByteLength(svgString)} B`

  return [
    buildActionItem({
      id: `${featureId}-out-raw`,
      featureId,
      title: `Optimized Raw SVG (${savingsLabel})`,
      subtitle: svgString.slice(0, 96),
      actions: [
        { id: 'copy-svg', title: '复制 Raw SVG', payload: { text: svgString } },
        { id: 'copy-vue', title: '复制 Vue 3 SFC', payload: { text: vueSfc } },
        { id: 'copy-jsx', title: '复制 React JSX', payload: { text: reactJsx } },
        { id: 'copy-data-uri', title: '复制 CSS Data URI', payload: { text: cssDataUri } },
        { id: 'copy-base64', title: '复制 Base64 Data URL', payload: { text: base64Url } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-out-vue`,
      featureId,
      title: `Vue 3 SFC (<${toPascalCase(componentName)} />)`,
      subtitle: '<script setup lang="ts"> + <template> 单文件组件',
      actions: [
        { id: 'copy-vue', title: '复制 Vue 3 SFC', payload: { text: vueSfc } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-out-jsx`,
      featureId,
      title: `React JSX (export function ${toPascalCase(componentName)})`,
      subtitle: '自动转换 camelCase 属性 (strokeWidth/fillRule/className) + {...props}',
      actions: [
        { id: 'copy-jsx', title: '复制 React JSX', payload: { text: reactJsx } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-out-data-uri`,
      featureId,
      title: 'CSS Data URI (url("data:image/svg+xml,..."))',
      subtitle: cssDataUri.slice(0, 92),
      actions: [
        { id: 'copy-data-uri', title: '复制 CSS Data URI', payload: { text: cssDataUri } },
        { id: 'copy-css-bg', title: '复制 background-image 声明', payload: { text: `background-image: ${cssDataUri};` } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-out-base64`,
      featureId,
      title: `Base64 Data URL (${utf8ByteLength(base64Url)} B)`,
      subtitle: base64Url.slice(0, 92),
      actions: [
        { id: 'copy-base64', title: '复制 Base64 Data URL', payload: { text: base64Url } },
        { id: 'copy-img-tag', title: '复制 <img> 标签', payload: { text: `<img src="${base64Url}" alt="${componentName}" />` } },
      ],
    }),
  ]
}

function buildIconBrowserItem(featureId, icon, options) {
  const svg = renderCatalogIconSvg(icon, options)
  const componentName = `${icon.name}-icon`
  const vueSfc = svgToVueSfc(svg, componentName)
  const reactJsx = svgToReactJsx(svg, componentName)
  const cssDataUri = svgToCssDataUri(svg)
  const base64Url = svgToBase64DataUrl(svg)

  return buildActionItem({
    id: `${featureId}-icon-${icon.name}`,
    featureId,
    title: `${icon.name}  [${icon.category.toUpperCase()}]`,
    subtitle: `${options.size}×${options.size} · ${options.color} · ${icon.tags.slice(0, 5).join(', ')}`,
    actions: [
      { id: 'copy-svg', title: '复制 Raw SVG', payload: { text: svg } },
      { id: 'copy-vue', title: '复制 Vue 3 SFC', payload: { text: vueSfc } },
      { id: 'copy-jsx', title: '复制 React JSX', payload: { text: reactJsx } },
      { id: 'copy-data-uri', title: '复制 CSS Data URI', payload: { text: cssDataUri } },
      { id: 'copy-base64', title: '复制 Base64 Data URL', payload: { text: base64Url } },
    ],
  })
}

function buildResultItems(featureId, query) {
  const { rest } = stripCommandPrefix(getQueryText(query))

  // 1. Raw SVG pasted -> optimize, normalize, and convert into all 5 output formats
  if (rest && isRawSvgInput(rest)) {
    const optimized = optimizeSvg(rest)
    return buildConverterItems(featureId, optimized.svg, 'OptimizedIcon', optimized)
  }

  // 2. Icon browser search & category browse
  const options = parseIconSearchOptions(rest)
  const ranked = ICON_CATALOG
    .map((icon, index) => ({ icon, score: scoreIcon(icon, options.term, options.categoryFilter), index }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)

  if (!ranked.length) {
    return [
      buildInfoItem({
        id: `${featureId}-empty`,
        featureId,
        title: '未找到匹配的矢量图标',
        subtitle: `支持分类 ${CATEGORIES.join(' / ')}、中英文关键词，或直接粘贴 <svg>...</svg> 进行压缩与转换`,
      }),
    ]
  }

  // Exact single icon hit -> expand all 5 format cards directly for instant one-click copy
  if (options.term && ranked[0].icon.name === options.term.toLowerCase()) {
    const exact = ranked[0].icon
    const svg = renderCatalogIconSvg(exact, options)
    const expanded = buildConverterItems(featureId, svg, `${exact.name}-icon`)
    const related = ranked.slice(1, 5).map(entry => buildIconBrowserItem(featureId, entry.icon, options))
    return [...expanded, ...related]
  }

  const items = []
  if (!rest) {
    const counts = CATEGORIES.map(cat => `${cat.toUpperCase()}:${ICON_CATALOG.filter(i => i.category === cat).length}`).join(' · ')
    items.push(buildInfoItem({
      id: `${featureId}-summary`,
      featureId,
      title: `内置 ${ICON_CATALOG.length} 枚矢量图标 · 粘贴 <svg> 可直接压缩转换`,
      subtitle: `${counts} · 示例: svg search 32 #3b82f6`,
    }))
  }

  const limit = options.term || options.categoryFilter ? 32 : 24
  for (const entry of ranked.slice(0, limit)) {
    items.push(buildIconBrowserItem(featureId, entry.icon, options))
  }
  return items
}

function blocked(reason, message, status = 'blocked') {
  return {
    externalAction: true,
    success: false,
    status,
    reason,
    message,
  }
}

async function checkPermission(permissionId) {
  const perm = getPermission()
  if (typeof perm?.check !== 'function') {
    return { granted: false, reason: 'permission-sdk-unavailable' }
  }
  try {
    const granted = await perm.check(permissionId)
    if (granted === true) {
      return { granted: true, reason: '' }
    }
    return { granted: false, reason: 'permission-denied' }
  }
  catch (error) {
    const code = error?.code
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
      return { granted: false, reason: 'permission-denied' }
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
      return { granted: false, reason: 'permission-unavailable' }
    }
    return { granted: false, reason: 'permission-check-failed' }
  }
}

async function writeClipboardText(text) {
  const perm = await checkPermission('clipboard.write')
  if (!perm.granted) {
    const message = perm.reason === 'permission-sdk-unavailable'
      ? '权限 SDK 不可用，已阻止写入剪贴板'
      : perm.reason === 'permission-unavailable'
        ? '权限系统不可用'
        : perm.reason === 'permission-check-failed'
          ? '权限校验失败，已阻止写入剪贴板'
          : '缺少 clipboard.write 权限'
    return blocked(perm.reason, message)
  }

  const clip = getClipboard()
  if (typeof clip?.writeText !== 'function') {
    return blocked('clipboard-unavailable', '当前环境不支持写入剪贴板')
  }

  try {
    await clip.writeText(text)
    return {
      externalAction: true,
      success: true,
      status: 'completed',
      message: '已复制到剪贴板',
    }
  }
  catch (error) {
    getLogger()?.error?.('[touch-svg-craft] clipboard write failed')
    const code = error?.code
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
      return blocked('permission-denied', '缺少 clipboard.write 权限')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
      return blocked('permission-unavailable', '权限系统不可用')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE') {
      return blocked('capability-unavailable', '剪贴板能力不可用')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED') {
      return blocked('cancelled', '复制操作已取消', 'cancelled')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT') {
      return blocked('timeout', '复制操作超时', 'failed')
    }
    return blocked('clipboard-write-failed', '复制失败', 'failed')
  }
}

async function publishItems(items, generation) {
  const feature = getPlugin()?.feature
  if (!feature || destroyed || generation !== triggerGeneration) {
    return false
  }
  await feature.clearItems()
  if (destroyed || generation !== triggerGeneration) {
    return false
  }
  await feature.pushItems(items)
  return !destroyed && generation === triggerGeneration
}

const pluginLifecycle = {
  async onInit() {
    destroyed = false
  },

  async onFeatureTriggered(featureId = FEATURE_ID, query = '') {
    destroyed = false
    const generation = ++triggerGeneration
    try {
      const items = buildResultItems(featureId, query)
      return await publishItems(items, generation)
    }
    catch {
      getLogger()?.error?.('[touch-svg-craft] feature execution failed')
      try {
        return await publishItems([
          buildInfoItem({
            id: `${featureId}-error`,
            featureId,
            title: 'SVG 矢量工坊运行失败',
            subtitle: '请检查输入后重试',
          }),
        ], generation)
      }
      catch {
        return false
      }
    }
  },

  async onItemAction(item, context = {}) {
    if (item?.meta?.defaultAction !== ACTION_GROUP) {
      return undefined
    }
    const actions = Array.isArray(item.actions) ? item.actions : []
    const requestedId = normalizeText(context?.actionId) || actions[0]?.id
    const selected = actions.find(action => action?.id === requestedId)
    if (!selected) {
      return blocked('invalid-action', '无效操作')
    }

    const payloadText = typeof selected.payload === 'string'
      ? selected.payload
      : selected.payload?.text
    if (typeof payloadText !== 'string' || !payloadText) {
      return blocked('invalid-action', '缺少可复制内容')
    }

    return writeClipboardText(payloadText)
  },

  async onDestroy() {
    destroyed = true
    triggerGeneration += 1
  },
}

module.exports = pluginLifecycle
