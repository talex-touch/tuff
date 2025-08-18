/**
 * TUFF DSL: Typed Unified Flex Format
 * 智能启动器核心数据结构定义
 *
 * @description
 * TUFF 是一种类型安全的统一灵活格式，用于定义智能启动器的数据结构。
 * 它提供了一套完整的类型系统，用于描述搜索结果、推荐项、操作项等。
 *
 * @design 设计理念：
 * - 极简易用：默认只需 title 即可渲染，降低使用门槛
 * - 高度可扩展：支持从简单到复杂的多层次自定义渲染
 * - 类型安全：完整的 TypeScript 类型支持，提供编译时检查
 * - 插件友好：标准化接口设计，便于第三方扩展
 *
 * @version 1.0.0
 * @module core-box/tuff-dsl
 */

// ==================== 核心数据结构 ====================

/**
 * TuffItem - 系统核心数据单元
 *
 * @description
 * 所有搜索结果、推荐项、操作项的统一结构。这是整个 TUFF 系统的基础数据单元，
 * 通过不同的配置可以表达各种类型的内容和交互方式。
 *
 * @example
 * ```typescript
 * const simpleItem: TuffItem = {
 *   source: { type: 'system', id: 'core' },
 *   render: {
 *     mode: 'default',
 *     basic: { title: '示例项目' }
 *   }
 * };
 * ```
 */
export interface TuffItem {
  /**
   * 唯一标识符
   * @description 可选，未提供时使用 hash(title + source.type + source.id) 自动生成
   */
  id?: string;

  /**
   * 数据来源信息
   * @description 定义项目的来源，用于权限控制、缓存策略和安全隔离
   * @required
   */
  source: TuffSource;

  /**
   * 项目类型分类
   * @description 影响展示方式和处理逻辑，系统会根据类型提供默认图标和行为
   */
  kind?: TuffItemKind;

  /**
   * 渲染配置
   * @description 控制项目的视觉展示方式
   * @required
   */
  render: TuffRender;

  /**
   * 图标定义
   * @description 项目的视觉标识，会覆盖 render.basic.icon
   */
  icon?: TuffIcon;

  /**
   * 交互行为定义
   * @description 定义项目支持的操作和交互方式
   */
  actions?: TuffAction[];

  /**
   * 匹配与评分信息
   * @description 用于搜索结果排序和推荐算法
   */
  scoring?: TuffScoring;

  /**
   * 扩展元数据
   * @description 携带额外的项目相关信息
   */
  meta?: TuffMeta;

  /**
   * 上下文信息
   * @description 用于 AI 推荐和关联分析的上下文数据
   */
  context?: TuffContext;
}

// ==================== 数据来源定义 ====================

/**
 * 数据来源标识
 *
 * @description
 * 定义项目的来源信息，用于权限控制、缓存策略和安全隔离。
 * 每个项目必须明确其来源，系统据此决定信任级别和处理方式。
 */
export interface TuffSource {
  /**
   * 来源类型
   * @description 定义数据的基本来源类别
   * @required
   */
  type: TuffSourceType;

  /**
   * 来源标识符
   * @description 如插件ID、模块名等，用于唯一标识来源
   * @required
   */
  id: string;

  /**
   * 来源名称
   * @description 用于用户界面展示的友好名称
   */
  name?: string;

  /**
   * 来源版本
   * @description 数据提供者的版本信息，用于兼容性检查
   */
  version?: string;

  /**
   * 权限级别
   * @description 定义该来源的信任级别和权限范围
   */
  permission?: TuffPermissionLevel;
}

/**
 * 数据来源类型
 *
 * @description
 * 定义数据的基本来源类别，系统据此应用不同的安全策略和处理逻辑
 */
export type TuffSourceType =
  | 'system'        // 系统内置，最高信任级别
  | 'plugin'        // 本地插件，受插件权限控制
  | 'remote'        // 远程服务，需网络访问权限
  | 'ai'            // AI 推荐，基于机器学习生成
  | 'history'       // 历史记录，基于用户过往行为
  | 'notification'  // 系统通知，来自系统事件
  | 'workflow'      // 工作流，用户自定义流程
  | 'file'         // 文件系统，本地文件
  | 'application'  // 应用程序，可启动的软件
  | 'service';      // 系统服务，后台运行的程序

/**
 * 权限级别
 *
 * @description
 * 定义数据来源的信任级别和权限范围，影响允许执行的操作
 */
export type TuffPermissionLevel =
  | 'safe'      // 安全级别，仅允许基本展示和无害操作
  | 'trusted'   // 信任级别，允许访问用户数据但有限制
  | 'elevated'  // 提升级别，允许更广泛的系统访问
  | 'system';   // 系统级别，完全访问权限

// ==================== 项目类型分类 ====================

/**
 * 项目语义分类
 *
 * @description
 * 定义项目的语义类型，系统据此决定默认图标、行为、分组等。
 * 支持自定义扩展，可通过字符串字面量类型添加新的类型。
 */
export type TuffItemKind =
  // 应用与程序
  | 'app'              // 应用程序，可启动的软件
  | 'command'          // 系统命令，终端或系统级指令
  | 'script'           // 脚本文件，可执行的代码文件
  | 'workflow'         // 工作流，一系列自动化步骤

  // 文件与资源
  | 'file'             // 普通文件，未指定具体类型的文件
  | 'folder'           // 文件夹，包含其他文件的目录
  | 'document'         // 文档类文件，如文本、表格、演示文稿等
  | 'image'            // 图片文件，各种图像格式
  | 'video'            // 视频文件，影片和动态图像
  | 'audio'            // 音频文件，声音和音乐

  // 网络与链接
  | 'url'              // 网页链接，可访问的网络地址
  | 'bookmark'         // 书签，保存的网页引用
  | 'search-result'    // 搜索结果，来自搜索引擎

  // 交互与功能
  | 'action'           // 功能操作，触发特定行为
  | 'setting'          // 设置项，配置选项
  | 'feature'          // 系统功能，内置能力

  // 通信与人员
  | 'contact'          // 联系人，人员信息
  | 'notification'     // 通知消息，系统或应用通知

  // 扩展支持
  | (string & {});     // 允许自定义扩展类型

// ==================== 渲染系统 ====================

/**
 * 渲染配置
 *
 * @description
 * 控制项目的视觉呈现方式，支持从简单到复杂的多种渲染模式。
 * 可以使用默认的标题+描述+图标模式，也可以完全自定义渲染内容。
 */
export interface TuffRender {
  /**
   * 渲染模式
   * @description 决定使用哪种渲染策略
   * @required
   */
  mode: TuffRenderMode;

  /**
   * 基础渲染信息
   * @description mode='default' 时使用的基本渲染数据
   */
  basic?: TuffBasicRender;

  /**
   * 自定义渲染内容
   * @description mode='custom' 时使用的自定义渲染配置
   */
  custom?: TuffCustomRender;

  /**
   * 布局配置
   * @description 控制项目的布局方式和尺寸
   */
  layout?: TuffLayout;

  /**
   * 预览配置
   * @description 定义悬停或点击时的预览内容
   */
  preview?: TuffPreview;

  /**
   * 样式类名
   * @description 应用于渲染容器的 CSS 类名
   */
  className?: string;

  /**
   * 内联样式
   * @description 应用于渲染容器的内联样式对象
   */
  style?: Record<string, string>;

  /**
   * 补全
   * @description 用于补全的文本
   */
  completion?: string;
}

/**
 * 渲染模式
 *
 * @description
 * 定义项目的基本渲染策略，从简单到复杂
 */
export type TuffRenderMode =
  | 'default'      // 默认渲染（title + desc + icon）
  | 'rich'         // 富文本渲染，支持格式化文本
  | 'card'         // 卡片式渲染，适合图文混排
  | 'custom';      // 完全自定义，最大灵活性

/**
 * 基础渲染信息
 *
 * @description
 * 提供基本的标题、描述和图标等信息，用于默认渲染模式。
 * 这是最常用的渲染方式，适合大多数简单场景。
 */
export interface TuffBasicRender {
  /**
   * 主标题
   * @description 项目的主要标识文本
   * @required
   */
  title: string;

  /**
   * 副标题/描述
   * @description 对主标题的补充说明，通常显示在主标题下方
   */
  subtitle?: string;

  /**
   * 详细描述
   * @description 更详细的项目说明，可能在悬停或展开时显示
   */
  description?: string;

  /**
   * 图标定义
   * @description 项目的视觉标识
   */
  icon?: TuffIcon;

  /**
   * 标签列表
   * @description 附加在项目上的标签，用于分类和筛选
   */
  tags?: TuffTag[];

  /**
   * 右侧信息
   * @description 显示在项目右侧的辅助信息，如快捷键、时间等
   */
  accessory?: string;

}

/**
 * 自定义渲染配置
 *
 * @description
 * 提供完全自定义的渲染能力，支持多种前端技术。
 * 适用于需要复杂交互或特殊展示效果的场景。
 */
export interface TuffCustomRender {
  /**
   * 渲染类型
   * @description 指定使用哪种技术进行渲染
   * @required
   */
  type: 'html' | 'vue' | 'react' | 'markdown';

  /**
   * 渲染内容
   * @description 根据type不同，可能是HTML字符串、组件名或Markdown文本
   * @required
   */
  content: string;

  /**
   * 渲染数据
   * @description 传递给渲染器的数据对象
   */
  data?: Record<string, any>;

  /**
   * 样式资源
   * @description 需要加载的CSS资源URL列表
   */
  styles?: string[];

  /**
   * 脚本资源
   * @description 需要加载的JavaScript资源URL列表
   */
  scripts?: string[];
}

/**
 * 图标定义
 *
 * @description
 * 支持多种图标类型，从简单的emoji到复杂的组件。
 * 可以是简单字符串或包含详细配置的对象。
 */
export type TuffIcon =
  | string  // 简单字符串：emoji、URL、组件名
  | {
      /**
       * 图标类型
       * @description 指定图标的数据格式和来源
       * @required
       */
      type: 'emoji' | 'url' | 'base64' | 'fluent' | 'component';

      /**
       * 图标值
       * @description 根据type不同，可能是emoji字符、URL地址、Base64编码或组件名
       * @required
       */
      value: string;

      /**
       * 备用图标
       * @description 当主图标无法加载时显示的替代图标
       */
      fallback?: string;

      /**
       * 动态加载函数
       * @description 用于异步加载图标资源的函数
       */
      loader?: () => Promise<string>;

      /**
       * 样式配置
       * @description 控制图标的视觉效果
       */
      style?: {
        /** 图标尺寸 */
        size?: number;
        /** 图标颜色 */
        color?: string;
        /** 动画效果 */
        animation?: 'spin' | 'pulse' | 'bounce';
      };
    };

/**
 * 标签定义
 *
 * @description
 * 用于分类和标记项目的小型标签，可自定义颜色和样式。
 */
export interface TuffTag {
  /**
   * 标签文本
   * @description 标签显示的文本内容
   * @required
   */
  text: string;

  /**
   * 标签颜色
   * @description 标签的背景或边框颜色，可使用预设值或自定义色值
   */
  color?: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | string;

  /**
   * 标签样式
   * @description 标签的视觉风格
   */
  variant?: 'filled' | 'outlined' | 'ghost';
}

/**
 * 布局配置
 *
 * @description
 * 控制项目的布局方式、尺寸和对齐方式等。
 */
export interface TuffLayout {
  /**
   * 展示方式
   * @description 决定项目的基本布局模式
   * @required
   */
  display: 'list' | 'card' | 'grid' | 'compact' | 'detailed';

  /**
   * 网格配置
   * @description display='grid' 时使用的网格布局参数
   */
  grid?: {
    /** 列数 */
    columns?: number;
    /** 间距 */
    gap?: number;
  };

  /**
   * 尺寸配置
   * @description 控制项目的整体大小
   */
  size?: 'small' | 'medium' | 'large';

  /**
   * 对齐方式
   * @description 控制内容的水平对齐方式
   */
  align?: 'left' | 'center' | 'right';
}

/**
 * 预览配置
 *
 * @description
 * 用于悬停展示或详情面板的预览内容配置。
 * 可以是简单的提示框，也可以是复杂的详情面板。
 */
export interface TuffPreview {
  /**
   * 预览类型
   * @description 决定预览的展示方式
   * @required
   */
  type: 'tooltip' | 'panel' | 'modal';

  /**
   * 预览标题
   * @description 预览内容的标题
   */
  title?: string;

  /**
   * 预览内容
   * @description 预览的主体内容，通常是文本
   */
  content?: string;

  /**
   * 预览图片
   * @description 预览中显示的图片URL
   */
  image?: string;

  /**
   * 自定义预览组件
   * @description 用于复杂预览内容的自定义渲染配置
   */
  component?: TuffCustomRender;

  /**
   * 懒加载配置
   * @description 是否延迟加载预览内容，直到需要显示时
   */
  lazy?: boolean;

  /**
   * 加载函数
   * @description 用于异步加载预览内容的函数
   */
  loader?: () => Promise<TuffPreview>;
}

// ==================== 交互行为系统 ====================

/**
 * 交互行为定义
 *
 * @description
 * 定义项目支持的操作和交互方式，如点击、右键菜单等。
 * 每个项目可以有多个行为，系统会根据配置展示对应的操作选项。
 */
export interface TuffAction {
  /**
   * 行为唯一标识
   * @description 用于识别和调用特定行为
   * @required
   */
  id: string;

  /**
   * 行为类型
   * @description 指定行为的基本类别，影响默认图标和处理逻辑
   * @required
   */
  type: TuffActionType;

  /**
   * 行为标签
   * @description 用于在界面中展示的行为名称
   */
  label?: string;

  /**
   * 行为描述
   * @description 对行为的详细说明，可能在悬停时显示
   */
  description?: string;

  /**
   * 行为图标
   * @description 表示该行为的图标
   */
  icon?: TuffIcon;

  /**
   * 快捷键
   * @description 触发该行为的键盘快捷键
   */
  shortcut?: string;

  /**
   * 行为参数
   * @description 执行行为时需要的附加数据
   */
  payload?: any;

  /**
   * 是否为主要行为
   * @description 标记为主要行为时，可能会获得视觉强调或作为默认操作
   */
  primary?: boolean;

  /**
   * 行为条件
   * @description 定义该行为何时可用的条件
   */
  condition?: TuffCondition;

  /**
   * 确认配置
   * @description 执行前是否需要用户确认，以及确认的提示信息
   */
  confirm?: {
    /** 确认对话框标题 */
    title: string;
    /** 确认对话框内容 */
    message: string;
    /** 是否为危险操作，可能会有特殊样式 */
    danger?: boolean;
  };
}

/**
 * 行为类型
 *
 * @description
 * 定义行为的基本类别，系统会根据类型提供默认图标和处理逻辑
 */
export type TuffActionType =
  | 'execute'       // 执行命令/程序，运行应用或脚本
  | 'open'          // 打开文件/链接，访问资源
  | 'navigate'      // 导航跳转，切换视图或页面
  | 'copy'          // 复制内容，将信息复制到剪贴板
  | 'preview'       // 预览内容，查看详情但不完全打开
  | 'edit'          // 编辑，修改内容
  | 'delete'        // 删除，移除项目
  | 'share'         // 分享，发送给他人
  | 'custom';       // 自定义行为，需要特殊处理

/**
 * 行为执行条件
 *
 * @description
 * 定义行为何时可用的条件，可以基于平台、权限、依赖等因素。
 * 系统会根据这些条件决定是否显示和启用特定行为。
 */
export interface TuffCondition {
  /**
   * 平台限制
   * @description 指定行为支持的操作系统平台
   */
  platform?: ('win32' | 'darwin' | 'linux')[];

  /**
   * 权限要求
   * @description 执行行为所需的最低权限级别
   */
  permission?: TuffPermissionLevel;

  /**
   * 依赖检查
   * @description 行为依赖的外部组件或服务
   */
  dependencies?: string[];

  /**
   * 自定义条件函数
   * @description 用于复杂条件判断的自定义函数
   */
  check?: () => boolean | Promise<boolean>;
}

// ==================== 评分与排序系统 ====================

/**
 * 评分信息
 *
 * @description
 * 用于搜索排序和推荐算法的评分数据。
 * 系统会根据这些分数决定项目在结果中的排序和展示优先级。
 */
export interface TuffScoring {
  /**
   * 基础得分 (0-1)
   * @description 项目的基础重要性分数
   */
  base?: number;

  /**
   * 匹配得分 (0-1)
   * @description 与搜索查询的匹配程度
   */
  match?: number;

  /**
   * 使用频率得分 (0-1)
   * @description 基于用户使用频率的分数
   */
  frequency?: number;

  /**
   * 时间相关性得分 (0-1)
   * @description 基于时间因素的相关性分数
   */
  recency?: number;

  /**
   * AI 推荐得分 (0-1)
   * @description 基于AI分析的推荐强度
   */
  ai?: number;

  /**
   * 最终综合得分
   * @description 综合各项因素计算的最终分数
   */
  final?: number;

  /**
   * 排序权重
   * @description 直接影响排序的权重值，越小越靠前
   */
  priority?: number;

  /**
   * 匹配详情
   * @description 提供关于匹配过程的详细信息
   */
  match_details?: {
    /** 匹配类型 */
    type: 'exact' | 'fuzzy' | 'semantic' | 'ai';
    /** 匹配的查询文本 */
    query: string;
    /** 高亮显示的文本片段 */
    highlights?: string[];
    /** 匹配置信度 */
    confidence?: number;
  };

  /**
   * 使用统计
   * @description 记录用户对该项目的使用情况
   */
  usage_stats?: {
    /** 使用次数 */
    count: number;
    /** 最后使用时间 */
    last_used?: Date;
    /** 平均评分 */
    avg_rating?: number;
  };
}

// ==================== 上下文信息 ====================

/**
 * 上下文信息
 *
 * @description
 * 用于AI推荐和关联分析的上下文数据。
 * 包含用户状态、时间、位置等信息，帮助系统提供更智能的推荐。
 */
export interface TuffContext {
  /**
   * 会话ID
   * @description 标识当前用户会话
   */
  session?: string;

  /**
   * 用户当前状态
   * @description 记录用户当前的工作环境和状态
   */
  user_state?: {
    /** 当前活动的应用 */
    active_app?: string;
    /** 当前打开的文件夹 */
    current_folder?: string;
    /** 最近访问的文件列表 */
    recent_files?: string[];
    /** 当前工作的项目 */
    current_project?: string;
  };

  /**
   * 时间上下文
   * @description 与时间相关的上下文信息
   */
  temporal?: {
    /** 创建时间 */
    created_at?: Date;
    /** 修改时间 */
    modified_at?: Date;
    /** 访问时间 */
    accessed_at?: Date;
    /** 一天中的时段 */
    time_of_day?: 'morning' | 'afternoon' | 'evening' | 'night';
    /** 星期几 */
    day_of_week?: string;
  };

  /**
   * 地理位置上下文
   * @description 与位置相关的上下文信息
   */
  location?: {
    /** 国家 */
    country?: string;
    /** 城市 */
    city?: string;
    /** 时区 */
    timezone?: string;
  };

  /**
   * 工作上下文
   * @description 与用户工作相关的上下文信息
   */
  work_context?: {
    /** 当前任务 */
    current_task?: string;
    /** 所属项目 */
    project?: string;
    /** 所属团队 */
    team?: string;
    /** 截止日期 */
    deadline?: Date;
  };

  /**
   * 关联项目
   * @description 与当前项目相关的其他项目ID列表
   */
  related_items?: string[];

  /**
   * 标签
   * @description 用于分类和组织的标签列表
   */
  tags?: string[];
}

// ==================== 扩展元数据 ====================

/**
 * 扩展元数据
 *
 * @description
 * 携带额外的项目相关信息，根据项目类型提供不同的元数据。
 * 可以包含文件信息、网络信息、应用信息等。
 */
export interface TuffMeta {
  /**
   * 原始数据
   * @description 项目的原始数据对象，用于特殊处理
   */
  raw?: any;

  /**
   * 文件信息
   * @description 适用于文件类型的元数据
   */
  file?: {
    /** 文件路径 */
    path: string;
    /** 文件大小（字节） */
    size?: number;
    /** MIME类型 */
    mime_type?: string;
    /** 文件权限 */
    permissions?: string;
    /** 创建时间 */
    created_at?: string;
    /** 修改时间 */
    modified_at?: string;
  };

  /**
   * 网络信息
   * @description 适用于链接类型的元数据
   */
  web?: {
    /** 完整URL */
    url: string;
    /** 域名 */
    domain?: string;
    /** 页面标题 */
    title?: string;
    /** 页面描述 */
    description?: string;
    /** 网站图标 */
    favicon?: string;
    /** 页面截图 */
    screenshot?: string;
  };

  /**
   * 应用信息
   * @description 适用于应用类型的元数据
   */
  app?: {
    /** 应用包标识符 */
    bundle_id?: string;
    /** 应用版本 */
    version?: string;
    /** 应用路径 */
    path?: string;
    /** 应用图标 */
    icon?: string;
    /** 应用类别 */
    category?: string;
  };

  /**
   * 插件扩展字段
   * @description 供插件存储自定义数据的字段
   */
  extension?: Record<string, any>;

  /**
   * 缓存配置
   * @description 控制项目的缓存策略
   */
  cache?: {
    /** 缓存生存时间（秒） */
    ttl?: number;
    /** 缓存键 */
    key?: string;
    /** 缓存策略 */
    strategy?: 'memory' | 'disk' | 'remote';
  };

  /**
   * 安全信息
   * @description 项目的安全相关元数据
   */
  security?: {
    /** 是否可信 */
    trusted?: boolean;
    /** 数字签名 */
    signature?: string;
    /** 所需权限列表 */
    permissions?: string[];
  };
}

// ==================== 前端展示结构 ====================

/**
 * 前端展示项
 *
 * @description
 * 经过处理后供UI使用的结构，包含了渲染和交互所需的全部信息。
 * 这是TuffItem在前端实际使用时的形态，添加了执行方法等能力。
 */
export interface TuffDisplayItem {
  /**
   * 唯一标识
   * @description 项目的唯一标识符
   * @required
   */
  id: string;

  /**
   * 渲染信息
   * @description 控制项目的视觉呈现
   * @required
   */
  render: TuffRender;

  /**
   * 可用操作
   * @description 项目支持的交互操作列表
   * @required
   */
  actions: TuffDisplayAction[];

  /**
   * 评分信息
   * @description 用于排序和推荐的评分数据
   */
  scoring?: TuffScoring;

  /**
   * 原始数据引用
   * @description 对原始TuffItem的引用
   * @required
   */
  raw: TuffItem;

  /**
   * 执行主要操作
   * @description 执行项目的默认主要操作
   * @returns 操作执行的Promise
   * @required
   */
  execute(): Promise<void>;

  /**
   * 获取预览内容
   * @description 获取项目的预览内容
   * @returns 预览内容的Promise
   */
  getPreview?(): Promise<TuffPreview>;
}

/**
 * 前端展示操作
 *
 * @description
 * 包含调用能力的操作定义，扩展了TuffAction添加了执行方法。
 * 这是TuffAction在前端实际使用时的形态。
 */
export interface TuffDisplayAction extends Omit<TuffAction, 'payload'> {
  /**
   * 执行操作
   * @description 执行该操作的方法
   * @param context 执行上下文
   * @returns 操作执行结果
   * @required
   */
  execute(context?: any): Promise<any>;

  /**
   * 检查是否可用
   * @description 检查当前环境下该操作是否可用
   * @returns 是否可用的Promise
   * @required
   */
  isAvailable(): Promise<boolean>;
}

// ==================== 工具类型 ====================

/**
 * 搜索查询结构
 *
 * @description
 * 定义搜索请求的参数和过滤条件。
 * 系统根据这些参数执行搜索并返回匹配结果。
 */
export interface TuffQuery {
  /**
   * 查询文本
   * @description 用户输入的搜索文本
   * @required
   */
  text: string;

  /**
   * 查询类型
   * @description 指定查询的输入方式
   */
  type?: 'text' | 'voice' | 'image';

  /**
   * 过滤条件
   * @description 限制搜索范围的过滤器
   */
  filters?: {
    /** 限制结果类型 */
    kinds?: TuffItemKind[];
    /** 限制结果来源 */
    sources?: string[];
    /** 限制结果时间范围 */
    date_range?: [Date, Date];
  };

  /**
   * 排序方式
   * @description 结果的排序策略
   */
  sort?: 'relevance' | 'date' | 'frequency' | 'name';

  /**
   * 分页信息
   * @description 控制结果的分页
   */
  pagination?: {
    /** 起始偏移量 */
    offset: number;
    /** 每页数量限制 */
    limit: number;
  };

  /**
   * 上下文信息
   * @description 提供搜索的上下文数据
   */
  context?: TuffContext;
}

/**
 * 搜索结果结构
 *
 * @description
 * 定义搜索返回的结果集合和元数据。
 * 包含匹配项、统计信息和分页数据等。
 */
export interface TuffSearchResult {
  /**
   * A unique identifier for this specific search operation.
   * This is crucial for the streaming model to associate updates with the correct search instance.
   */
  sessionId?: string;

  /**
   * 结果项目
   * @description 匹配的TuffItem列表
   * @required
   */
  items: TuffItem[];

  /**
   * 查询信息
   * @description 原始查询参数
   * @required
   */
  query: TuffQuery;

  /**
   * 搜索耗时
   * @description 搜索执行的毫秒数
   * @required
   */
  duration: number;

  /**
   * 来源统计
   * @description 各数据来源的结果统计
   * @required
   */
  sources: Array<{
    /** Provider's unique ID. */
    providerId: string;
    /** Provider's display name. */
    providerName: string;
    /** Search duration in milliseconds. */
    duration: number;
    /** Number of results returned. */
    resultCount: number;
    /** Status of the search operation. */
    status: 'success' | 'timeout' | 'error';
  }>;

  /**
   * AI 推荐
   * @description AI生成的搜索建议
   */
  suggestions?: string[];

  /**
   * The provider(s) to activate after this search result.
   */
  activate?: IProviderActivate[];
}

export interface IProviderActivate {
  id: string
  meta?: Record<string, any>
}

// ==================== 插件接口预览 ====================

/**
 * 插件搜索接口
 *
 * @description
 * 定义插件实现搜索功能的标准接口。
 * 这是一个简化版预览，实际插件系统可能更复杂。
 */
export interface TuffSearchProvider {
  /**
   * 插件信息
   * @description 插件的基本信息
   * @required
   */
  info: {
    /** 插件唯一标识 */
    id: string;
    /** 插件名称 */
    name: string;
    /** 插件版本 */
    version: string;
    /** 插件描述 */
    description: string;
    /** 插件作者 */
    author: string;
    /** 插件图标 */
    icon?: TuffIcon;
  };

  /**
   * 搜索能力配置
   * @description 定义插件支持的搜索能力
   * @required
   */
  capabilities: {
    /**
     * 支持的查询类型
     * @description 插件能处理的输入类型
     * @required
     */
    query_types: ('text' | 'voice' | 'image')[];

    /**
     * 支持的项目类型
     * @description 插件能提供的结果类型
     * @required
     */
    item_kinds: TuffItemKind[];

    /**
     * 是否支持实时搜索
     * @description 是否支持输入时实时返回结果
     * @required
     */
    realtime: boolean;

    /**
     * 是否支持 AI 增强
     * @description 是否使用AI技术增强搜索结果
     * @required
     */
    ai_enhanced: boolean;

    /**
     * 权限要求
     * @description 插件需要的权限级别
     * @required
     */
    permissions: TuffPermissionLevel;
  };

  /**
   * 搜索方法
   * @description 执行搜索并返回结果
   * @param query 搜索查询参数
   * @returns 搜索结果Promise
   * @required
   */
  search(query: TuffQuery): Promise<TuffItem[]>;

  /**
   * 获取推荐项
   * @description 根据上下文提供推荐项目
   * @param context 上下文信息
   * @returns 推荐项目Promise
   */
  getRecommendations?(context: TuffContext): Promise<TuffItem[]>;

  /**
   * 执行操作
   * @description 执行特定操作
   * @param action_id 操作ID
   * @param payload 操作参数
   * @returns 操作结果Promise
   * @required
   */
  executeAction(action_id: string, payload: any): Promise<any>;

  /**
   * 激活钩子
   * @description 插件被激活时调用
   * @returns 完成Promise
   */
  onActivate?(): Promise<void>;

  /**
   * 停用钩子
   * @description 插件被停用时调用
   * @returns 完成Promise
   */
  onDeactivate?(): Promise<void>;
}

export default TuffItem;
