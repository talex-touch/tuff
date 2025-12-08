export default {
  nav: {
    home: '首页',
    docs: '文档',
    api: 'API',
    marketplace: '插件市场',
    about: '关于',
    qa: '问答',
    developers: '开发者',
    login: '登录',
    dashboard: '控制台',
    pricing: '订阅方案',
    market: '市场',
    doc: '文档',
    developer: '开发者',
    download: '更新',
    blog: '博客',
  },
  ui: {
    languageToggle: {
      zhLabel: '中文',
      enLabel: 'English',
      switchToZh: '切换语言到中文',
      switchToEn: '切换语言到英文',
    },
  },
  auth: {
    callbackProcessing: '正在处理登录回调，请稍候…',
    linuxdoWaitlistNotice:
      'LinuxDo 2、3 级用户可直接加入 Waitlist，无需排队等待。请使用与 LinuxDo 相同的邮箱登录，以便我们快速核验资格。',
    backToHome: '返回首页',
  },
  pricing: {
    title: '选择与你节奏匹配的订阅方案',
    subtitle: '直接通过 Clerk 完成升级，订阅后即可即时解锁高级自动化与指挥面板。',
    missingTable: '暂未配置 Pricing Table，请设置环境变量 NUXT_PUBLIC_CLERK_PRICING_TABLE_ID 后再试。',
    loading: '正在加载订阅信息…',
  },
  updates: {
    badge: '版本通道',
    title: '更新与下载',
    subtitle: '选择最适合你团队节奏的通道，获取最新构建与历史版本。',
    channelSelector: {
      label: '发布通道',
    },
    channels: {
      release: {
        badge: '稳定',
        label: '正式通道',
        description: '签名认证的稳定构建，适合生产环境与大规模部署。',
        meta: '每月更新',
      },
      snapshot: {
        badge: '预览',
        label: '快照通道',
        description: '包含实验特性的预览构建，每周更新，可能出现细节问题。',
        meta: '每周刷新',
      },
    },
    latest: {
      heading: '最新版本',
      releaseDate: '{date} 发布',
      releaseDateFallback: '暂未发布',
      highlightsHeading: '亮点',
      notesCta: '查看更新说明',
    },
    channelSummary: {
      title: '通道说明',
      description: '当前正在查看 {channel} 轨道，我们会确保其表现符合上述说明。',
      refreshHint: '通过冒烟、回归与同步校验后，我们会第一时间更新该通道。',
      feedback: '若发现异常，请在控制台反馈面板告诉我们。',
    },
    empty: '该通道暂未提供版本，请稍后再试。',
    table: {
      title: '历史版本',
      description: '{channel} 轨道已发布的全部版本。',
      toggleLabel: '展开历史版本',
      hideLabel: '收起历史版本',
      latestBadge: '最新',
      viewNotes: '说明',
      columns: {
        version: '版本',
        date: '发布时间',
        summary: '关键更新',
        actions: '链接',
      },
    },
    downloads: {
      previewPortal: '预览入口',
      previewPortalDescription: '包含实验构建、验证说明与回滚指引。',
      releasePortal: '正式入口',
      releasePortalDescription: '面向生产环境的安装包与签名指纹。',
    },
    entries: {
      v2_0_0_preview: {
        summary: '为 2.0 推出的工作区重塑与 FlowScript 运行时做好准备。',
        highlights: [
          '推出统一的工作区画布，采用自适应玻璃拟态视觉。',
          '新增 FlowScript 实时调试器，支持时间轴回放。',
          '加入手册侧栏，可与命令面板上下文实时同步。',
        ],
      },
      v2_0_0_dev5: {
        summary: '持续强化预览构建，让自动化调试反馈更紧凑。',
        highlights: [
          '优化 FlowScript 热重载速度，在大型编排下依旧快速响应。',
          '扩展扩展沙箱的日志能力，支持流式追踪。',
          '提升多设备会话接力的稳定性，适合现场演示。',
        ],
      },
      v1_2_0: {
        summary: '上线精选插件市场，并全面升级导航体验。',
        highlights: [
          '发布带签名与认证标记的插件市场。',
          '重构 PluginManager、PluginList 与 FileTree，显著提升稳定性。',
          '修复升级提示、导航布局与 TTabs 定位问题。',
        ],
      },
      v1_1_0: {
        summary: '为插件市场与升级流程打下基础。',
        highlights: [
          '引入插件商店雏形，包含安装与升级模块。',
          '新增升级提醒、更丰富的输入组件与导出进度界面。',
          '解决多处布局错位、重复提示相关问题。',
        ],
      },
      v1_0_0: {
        summary: '首个公开版本，统一自动化、插件与统计能力。',
        highlights: [
          '提供带签名流程的插件发布通道，正式接入市场。',
          '加入账户引导、统计面板与多处布局优化。',
          '稳定插件解析、升级提醒与预览工具链。',
        ],
      },
    },
  },
  plugins: {
    categories: {
      productivity: '效率',
      utilities: '工具',
      development: '开发',
      writing: '写作',
      creativity: '创意',
      ai: 'AI / 模型',
      automation: '自动化',
      communication: '沟通',
      analytics: '分析',
      design: '设计',
      education: '教育',
      finance: '金融',
    },
  },
  market: {
    hero: {
      badge: '官方市场',
      title: '发现精选插件',
      subtitle: '从精细整理的分类中检索，找到适合你工作流的插件。',
    },
    search: {
      label: '搜索',
      placeholder: '搜索官方插件',
    },
    filters: {
      heading: '按分类浏览',
      all: '全部分类',
    },
    actions: {
      viewDetails: '查看详情',
    },
    detail: {
      loading: '正在加载插件详情…',
      error: '插件详情加载失败。',
      readme: '插件 README',
      noReadme: '该插件暂未提供 README。',
      versions: '已审核版本',
      noVersions: '暂时没有已通过审核的版本。',
      download: '下载插件包',
      sizeUnknown: '大小未知',
      author: '由 {name} 发布',
    },
    results: {
      count: '共 {count} 个官方插件',
      filtered: '已筛选 {count}/{total} 个官方插件',
      empty: '没有符合条件的官方插件。',
      none: '目前还没有官方插件。',
    },
    badges: {
      official: '官方',
      community: '社区',
    },
  },
  dashboard: {
    header: {
      badge: 'Tuff Nexus',
      defaultName: '伙伴',
      greeting: '欢迎回来，{name}',
      intro: '这里汇总了你的环境、发布与插件状态。未来我们会在此提供自动化洞察与任务提醒。',
      docsCta: '查看文档',
      marketplaceCta: '浏览插件',
    },
    sections: {
      overview: {
        title: '快速概览',
        items: {
          betaAccess: 'Beta 等级访问正在生效，后续将解锁更多模块。',
          releaseNotify: '订阅 Release 通知以在第一时间获得版本更新。',
          insights: '数据洞察与团队协作将在正式版开放。',
        },
      },
      nextSteps: {
        title: '下一步行动',
        items: {
          connectWorkspace: '连接你的首个工作区来解锁自动同步。',
          scheduleOnboarding: '与团队成员预约一次 Onboarding Session。',
          inviteTeammates: '邀请伙伴加入，协作即将开放多人协同。',
        },
      },
      shortcuts: {
        title: '快捷入口',
        links: {
          gettingStarted: '入门指南',
          marketplace: '插件市场',
          developers: '开发者中心',
        },
      },
      menu: {
        title: '工作区导航',
        overview: '概览',
        nextSteps: '下一步',
        shortcuts: '快捷入口',
        plugins: '插件',
        team: '团队',
        updates: '要闻',
        images: '资源',
        betaHeading: '预览节奏',
        betaDescription: '插件与团队功能正持续迭代，右侧面板会展示当前可用的模块。',
      },
      plugins: {
        title: '插件',
        subtitle: '统一管理官方构建与社区提交的插件。',
        cta: '提交插件',
        loading: '正在加载插件…',
        empty: '暂时还没有插件，发布你的第一个插件来展示它。',
        officialBadge: '官方',
        stats: {
          installs: '{count} 次安装',
          category: '分类',
          created: '创建时间',
          size: '大小',
        },
        updatedOn: '更新于 {date}',
        badges: {
          featured: '精选',
          stable: '稳定',
          beta: '公测',
          community: '社区',
        },
        manageTitle: '插件管理',
        manageSubtitle: '快速发布新插件或在上线前调整条目。',
        addButton: '创建插件',
        closeButton: '收起',
        closeVersionButton: '收起版本发布',
        createSubmit: '创建插件',
        updateSubmit: '保存修改',
        confirmDelete: '确定删除 {name}？此操作无法恢复。',
        form: {
          identifier: '插件标识',
          identifierHelp: '请选择类似 alpha.beta.plugin 的多段小写域名格式。',
          name: '插件名称',
          summary: '摘要',
          category: '分类',
          installCount: '安装数（自动统计）',
          homepage: 'GitHub / 项目主页（可选）',
          badges: '徽章（逗号分隔）',
          isOfficial: '标记为官方版本',
          icon: '插件图标',
          iconHelp: '支持 PNG、JPG、WebP 或 GIF，大小不超过 5 MB。',
          iconRemove: '移除图标',
          packageUpload: '插件包（.tpex）',
          packageHelp: '上传 .tpex 压缩包即可自动填充 manifest 信息，实际提交后才会保存。',
          readme: 'README 内容',
          readmeHelp: '支持 Markdown，内容会展示在市场详情页面。',
          uploadPackage: '上传包',
          manualInput: '手动填写',
          autoPublishHint: '创建插件后将自动发布版本 {version}。',
        },
        versionForm: {
          version: '版本号',
          channel: '发布通道',
          changelog: '更新日志',
          package: '插件包（.tpex tar，≤30 MB）',
          submit: '提交审核',
        },
        channels: {
          RELEASE: {
            name: '正式发布',
            description: '所有用户可见。适用于稳定版本,向所有安装了插件的用户推送。',
            visibility: '✓ 对所有用户可见',
          },
          BETA: {
            name: '测试版',
            description: '仅团队成员可见。适用于内部测试,只有团队成员可以看到和安装。',
            visibility: '✓ 仅团队成员可见',
          },
          SNAPSHOT: {
            name: '快照版',
            description: '仅高级用户可见。适用于实验性功能,只有选择了快照渠道的高级用户可以访问。',
            visibility: '✓ 仅选择快照渠道的用户可见',
          },
        },
        warnings: {
          immutable: {
            title: '⚠️ 版本不可撤销',
            message: '版本一旦发布,将无法删除或修改。请确保所有信息无误后再提交。',
            understand: '我已了解',
            cancel: '取消发布',
          },
        },
        license: {
          title: 'Tuff 插件许可协议',
          agreement: `# Tuff 插件许可协议 (Tuff Plugin License)

## 1. 接受条款
提交插件即表示您同意遵守本许可协议的所有条款。

## 2. 知识产权
- 您保留对插件源代码的所有权
- 您授予 Tuff 分发和展示插件的权利
- 您确认插件不侵犯任何第三方权利

## 3. 内容规范
插件必须符合以下标准:
- 不包含恶意代码、病毒或后门
- 不收集用户隐私数据(除非明确说明)
- 不违反任何法律法规
- 功能描述真实准确

## 4. 审核权利
Tuff 保留审核、拒绝或下架任何插件的权利。

## 5. 免责声明
插件"按原样"提供,Tuff 不对插件质量做任何保证。

## 6. 协议变更
Tuff 可能随时更新本协议,继续提交表示接受变更。`,
          confirm: '我同意 Tuff 插件许可协议',
          submit: '同意并提交审核',
          cancel: '取消',
        },
        statuses: {
          draft: '草稿',
          pending: '待审核',
          approved: '已通过',
          rejected: '已驳回',
        },
        versionStatuses: {
          pending: '待审核',
          approved: '已通过',
          rejected: '已驳回',
        },
        actions: {
          submitReview: '提交审核',
          withdrawReview: '撤回审核',
          approve: '通过',
          reject: '驳回',
        },
        publishVersion: '新建版本',
        editMetadata: '编辑信息',
        delete: '删除插件',
        deleteVersion: '删除版本',
        confirmDeleteVersion: '确定删除版本 {version}？',
        homepage: '主页',
        installs: '次安装',
        versionHistory: '版本历史',
        versionDescription: '此处展示已发布的版本与签名信息。',
        signature: '签名',
        downloadPackage: '下载包',
        readmePreview: 'README 预览',
        readmePreviewServer: '上传完成后由服务端自动解析 README 内容。',
        previewLoading: '正在解析插件包…',
        manifestPreview: 'Manifest 预览',
        manifestRaw: 'Manifest 原始数据',
        noManifest: '未在压缩包中找到 manifest 文件。',
        packageAwaiting: '选择 .tpex 插件包后将自动展示 manifest 与 README 信息。',
        noReadme: '未检测到 README 文件。',
        previewFields: {
          id: '标识',
          name: '名称',
          version: '版本',
          description: '描述',
          homepage: '主页',
        },
        noVersions: '尚未发布任何版本。',
        errors: {
          invalidCategory: '请选择一个插件分类。',
          missingPlugin: '请选择要发布版本的插件。',
          missingVersion: '请填写版本号后再发布。',
          missingPackage: '请先上传 .tpex 插件包。',
          missingIdentifier: '请填写插件标识。',
          invalidIdentifierFormat: '标识需为至少两段的点分式小写格式，例如 alpha.beta.plugin。',
          restrictedIdentifier: '标识或名称包含保留字段，仅官方插件可继续提交。',
          missingName: '请填写插件名称。',
          missingReadme: '请补充插件 README 内容。',
          missingChangelog: '请填写本次发布的更新日志。',
          unknown: '保存插件时发生错误。',
        },
        versionReviewedAt: '审核于 {date}',
        pendingReviews: '待处理审核',
        pendingReviewsCount: '{count} 项待处理',
        reviewPlugin: '插件审核',
        reviewVersion: '版本审核',
        viewDetails: '查看',
        rejectReason: '驳回原因',
        rejectReasonPlaceholder: '请说明驳回此提交的原因（可选）...',
        myPlugins: '我的插件',
      },
      images: {
        title: '资源库',
        subtitle: '管理仪表盘插件与更新会用到的共享资源。',
        uploadTitle: '上传资源',
        uploadSubtitle: '支持常见图片或附件（PNG、JPEG、WebP、GIF、SVG 等），大小不超过 5 MB。',
        selectFile: '选择文件',
        uploading: '正在上传…',
        loading: '正在加载资源…',
        empty: '目前还没有上传的资源。',
        copied: '已复制！',
        copyUrl: '复制链接',
        adminOnly: '仅管理员可以管理共享资源。',
        confirmDelete: '确定删除 {key}？此操作无法恢复。',
        errors: {
          unknown: '操作资源时发生错误。',
          copyFailed: '复制失败',
        },
      },
      team: {
        title: '团队预览',
        subtitle: '团队将带来共享自动化、审计历史与安全变量。',
        waitlistCta: '加入团队候补',
        pending: '正在加载团队信息…',
        seatUsage: '已使用 {used}/{total} 个席位',
        organizationLabel: 'Clerk 组织',
        activeStatus: '已激活',
        planLabel: '套餐',
        emptyMembers: '尚未有成员，预览开放后邀请会显示在此处。',
        statusLabel: '预览状态',
        previewStatus: '私人预览',
        upcomingLabel: '下一阶段',
        notesLabel: '预期内容',
        notesPlaceholder: '预览期间我们会在这里更新路线图与邀请控制。',
        memberStatus: {
          active: '已激活',
          automation: '自动化 Pilot',
          invited: '已邀请',
        },
      },
      updates: {
        title: '官方要闻',
        subtitle: '最近的版本发布、市场信号与路线图节奏。',
        cta: '打开变更日志',
        loading: '正在获取要闻…',
        empty: '暂时没有官方更新，请稍后再来。',
        readMore: '查看详情',
        manageTitle: '要闻管理',
        manageSubtitle: '向所有成员发布变更日志与公告。',
        addButton: '新建要闻',
        closeButton: '收起',
        createSubmit: '发布要闻',
        updateSubmit: '保存修改',
        confirmDelete: '确定删除“{title}”？此操作无法恢复。',
        form: {
          title: '标题',
          date: '发布日期',
          summary: '摘要',
          tags: '标签（逗号分隔）',
          link: '外部链接',
        },
        errors: {
          unknown: '保存要闻时发生错误。',
        },
      },
    },
  },
  landing: {
    hero: {
      badge: 'Beta 预览',
      description: '一套强大的多平台工具计划，让你的桌面化身为响应迅速的智能控制中心。',
      heading: '深厚实力，简洁呈现。',
      bullets: {
        cinematic: '电影感的指挥界面，在桌面、网页与移动端保持同步过渡。',
        policy: '策略感知的发布控制，结合签名扩展与区域化清单。',
        realtime: '实时协作，忠实呈现你的 FlowScript 与文档手册意图。',
      },
      primaryCta: '加入候补名单',
      secondaryCta: '开发者文档',
      offlineNotice: '当前处于离线状态，搜索与即时预览将在网络恢复后自动启用。',
      stats: {
        commands: {
          value: '2M+',
          label: '自动化指令',
        },
        response: {
          value: '48 ms',
          label: '平均响应',
        },
        layouts: {
          value: '120+',
          label: '工作区布局',
        },
      },
      highlightLabel: '平台亮点',
      highlights: {
        integrations: {
          title: '原生集成',
          description: '开箱即配合系统自动化、启动器和语音控制。',
        },
        workspace: {
          title: '工作区 DNA',
          description: '在一个自适应界面中管理仪表盘、脚本与通信。',
        },
        focus: {
          title: '实时聚焦',
          description: '环境提示让关键信号始终触手可及。',
        },
      },
    },
    os: {
      aiSpotlight: {
        eyebrow: 'AI 核心体验',
        headline: '一处搜索，万物互联。',
        subheadline: '它不止是查找，更是理解。',
        summary: 'Tuff 读懂意图，将所有相关内容汇聚在一个沉静而鲜活的结果集中。',
        queryLabel: '自然语言查询',
        queryText: '“给我看看 Sarah 上周分享的设计稿。”',
        results: {
          figma: {
            title: 'Figma · 核心布局改版',
            meta: 'Sarah M. 分享 · 2 天前更新',
          },
          files: {
            title: '本地文件 · brand-refresh.sketch',
            meta: '桌面 › Campaigns',
          },
          gmail: {
            title: 'Gmail · “最新的页头迭代”',
            meta: '来自 Sarah · 周一 9:14',
          },
          slack: {
            title: '#brand-refresh · “正在附上最终导出。”',
            meta: 'Slack · 与 design-pod 的线程',
          },
        },
        highlights: {
          context: {
            title: '理解上下文',
            copy: '意图解析贯穿人物、工具与时间轴，让你告别来回翻找标签页。',
          },
          silo: {
            title: '打破信息孤岛',
            copy: '设计、文件、对话与任务在同一窗口连续呈现。',
          },
          breathe: {
            title: '跟随你的节奏',
            copy: '动画克制而有节奏，始终把注意力留给真正重要的内容。',
          },
        },
      },
      plugins: {
        eyebrow: '插件中心',
        headline: '扩展 Tuff 到你的工具',
        subheadline: '将 Tuff 连接到你的工具，扩展其功能。',
        extensions: {
          notion: {
            name: 'Notion',
            description: '一键召回文档、会议纪要和项目枢纽。',
          },
          figma: {
            name: 'Figma',
            description: '即刻预览画板、同步组件与设计令牌。',
          },
          github: {
            name: 'GitHub',
            description: '在指令栏完成 PR 审查、差异对比与流程触发。',
          },
          vscode: {
            name: 'VS Code',
            description: '不中断专注即可切换工作区、运行脚本与查看诊断。',
          },
          calendar: {
            name: 'Google Calendar',
            description: '即刻查看 upcoming rituals、阻塞专注时间与 RSVP。',
          },
          spotify: {
            name: 'Spotify',
            description: '根据你的专注会话，自适应播放音乐。',
          },
        },
      },
      aiOverview: {
        eyebrow: 'AI 专项',
        headline: '为你的工作节奏量身打造的智能核心。',
        subheadline: '代理、检索与自动化在 Tuff 内部自然编排。',
        hero: {
          title: '嵌入指令面的智能助手。',
          copy: '唤起情境感知的 copilots，读取屏幕、规划下一步，并在你确认后执行。',
          primaryCta: '探索 AI 蓝图',
          secondaryCta: '查看代理 API',
          bullets: {
            understand: '理解屏幕上发生的一切，并关联同事、文档与数据。',
            instant: '40ms 内给出建议动作，可立即触发执行。',
            privacy: '默认端侧运行，邀请协作者时也仅做零知识加密同步。',
          },
        },
        highlights: {
          orchestrate: {
            title: '编排式序列',
            copy: '在代理、脚本与人工复核之间无缝交接，状态与意图始终保持一致。',
          },
          copilot: {
            title: '每个界面都有 Copilot',
            copy: '写作、调试与设计助手同时进入指令面板，随时呼出。',
          },
          memory: {
            title: '长期记忆',
            copy: '检索索引映射你的系统，快速生成总结、对比与后续动作。',
          },
        },
      },
      builtForYou: {
        eyebrow: '为你而生',
        headline: '面向设计、开发与运营团队的统一工作台。',
        subheadline: '不同角色拥有定制界面，同时保持协作步调一致。',
        personas: {
          makers: {
            title: '设计师 / 创作者',
            copy: '在一个画布中切换探索、检查资源、发布设计令牌。',
            quote: '“Tuff 让交接几乎没有摩擦 - 指令栏比我更熟悉日常仪式。”',
            name: 'Jasmine Ortega',
            role: 'Highline 首席产品设计师',
          },
          developers: {
            title: '工程师',
            copy: '在同一指令面中查看日志、重跑流水线、调整特性开关。',
            quote: '“PR、测试与部署脚本汇集到一个入口，发版终于从容。”',
            name: 'Nikhil Sharma',
            role: 'Drift Labs 资深工程师',
          },
          operators: {
            title: '运营与负责人',
            copy: '创建仪表盘、同步例会、用自动化保障节奏不跑偏。',
            quote: '“每一个 ritual 都被固化，Tuff 让远程团队依然同步。”',
            name: 'Morgan Lee',
            role: 'Northwind 运营负责人',
          },
        },
        stats: {
          latency: {
            label: '自动化平均耗时',
            value: '27 ms',
          },
          adoption: {
            label: '30 天内完成落地团队',
            value: '92%',
          },
          satisfaction: {
            label: '周活满意度',
            value: '4.8/5',
          },
        },
      },
      starSnippets: {
        eyebrow: '星标片段',
        headline: '一次保存，随处调用。',
        subheadline: '精选片段让团队的最佳回复与脚本随时可用。',
        categories: {
          meetings: {
            title: '会议跟进',
            copy: '一键生成纪要、下一步与排期宏指令。',
            action: '预览模版',
          },
          support: {
            title: '客服回复',
            copy: 'AI 结合实时产品数据在你打开工单前就草拟回应。',
            action: '插入片段',
          },
          builders: {
            title: '研发捷径',
            copy: '不离开聊天即可部署流程、追日志、推送热修复分支。',
            action: '执行指令',
          },
        },
        footnote: '为团队固定片段，随着 playbook 更新自动同步。',
      },
      aggregation: {
        eyebrow: '聚合视图',
        headline: '所有信号，凝练为一张冷静的总览。',
        subheadline: '文档、对话、提醒与自动化在每个工作区持续同步。',
        panels: {
          overview: {
            title: '实时总览',
            copy: '晨间简报聚合最新提交、笔记与阻塞，不再噪音轰炸。',
          },
          timelines: {
            title: '节奏时间线',
            copy: '按项目自动排布节点与依赖，异常会抬头提醒。',
          },
          alerts: {
            title: '智能提醒',
            copy: '关键变化合并为分层通知，只在需要你决策时打扰。',
          },
        },
        footnote: '聚合引擎持续运行，无论何时上线都能迅速回到节奏。',
      },
      community: {
        eyebrow: '社区',
        headline: '与全球创造者一起共建。',
        subheadline: '加入这些渠道，第一时间了解扩展、仪式与版本预览。',
        channels: {
          slack: {
            title: 'Slack',
            meta: '32k 名成员',
            description: '深度讨论、版本预览与核心团队的开放办公时间。',
            cta: '加入 Slack',
            href: '#',
          },
          github: {
            title: 'GitHub',
            meta: '3k 位贡献者',
            description: '浏览 manifest、提交 PR，并保持平台透明。',
            cta: '访问 GitHub',
            href: '#',
          },
          events: {
            title: 'Live Sessions',
            meta: '每周',
            description: 'AMA、动手工作坊与社区 Showcase 轮番进行。',
            cta: '查看日程',
            href: '#',
          },
        },
        spotlights: {
          learning: {
            title: '学习中心',
            copy: '工作坊、专题课与录播演示，帮助团队快速进阶。',
          },
          newsletter: {
            title: 'Dispatch 通讯',
            copy: '每月总结发布内容、路线规划与真实使用案例。',
          },
        },
      },
      pricing: {
        eyebrow: '定价',
        headline: '先锋阶段全量开放，完全免费。',
        subheadline: '在与你共同打磨体验期间，我们保持所有能力解锁。',
        plan: {
          name: 'Pioneer',
          price: '0 元',
          period: '每位成员',
          features: {
            unlimited: '不限席位、指令与扩展',
            support: '直接接入产品团队的反馈通道',
            roadmap: '付费层推出时提供平滑迁移方案',
          },
          footnote: '作为首批团队，你们在正式定价上线后仍保留 Pioneer 权益。',
        },
      },
      faq: {
        eyebrow: '常见问题',
        headline: '你的疑问，我们都想好答案。',
        items: {
          access: {
            question: '如何加入 Beta？',
            answer: '预约先锋计划，我们每周批次开通，并为团队安排引导会议。',
          },
          privacy: {
            question: '数据如何被处理？',
            answer: '绝大多数逻辑在本地运行，云端同步全程加密，密钥由你掌控，可按工作区开启。',
          },
          build: {
            question: '不会写代码也能搭建自动化吗？',
            answer: '可以。FlowScript 提供可视化构建器，开发者也可随时下沉到代码层。',
          },
          migration: {
            question: '现有快捷指令能迁移吗？',
            answer: '支持从 Raycast、Alfred 与自定义脚本导入，Tuff 会转化为类型化指令。',
          },
          pricing: {
            question: '免费阶段会持续多久？',
            answer: '未来会推出付费层，但 Pioneer 团队会一直免费直至正式公开发布。',
          },
        },
      },
      extensibility: {
        eyebrow: '能力中心',
        headline: '自由万物，强大工具包。',
        subheadline: '为你介绍，全新 TuffFamilyKit 百余种工具可选。',
      },
      openFoundation: {
        eyebrow: '开放基石',
        headline: '开放打造，献给创造者。',
        subheadline: '透明内核、模块化工具链，与共创未来的开发者社区。',
        pillars: {
          core: {
            title: '透明内核',
            copy: '可审计的运行时，每一次决策都清晰可循，放心分叉平台。',
          },
          sdk: {
            title: '模块化 SDK',
            copy: '类型安全 API、沙箱与签名管线，让拓展轻松顺手。',
          },
          community: {
            title: '活力社区',
            copy: '与先锋同行，共同审阅 manifest，在公开协作中推动平台进化。',
          },
        },
        footnote: '我们构建的一切均有文档与版本记录，随时欢迎你的 Pull Request。',
      },
      proactive: {
        eyebrow: '情境智能',
        headline: '先你一步，懂你所需。',
        subheadline: 'Tuff 智能核心登场。端侧运行，守护隐私，深度感知你的语境。',
        shieldLabel: '端侧 AI · 隐私至上',
        scenarios: {
          developer: {
            tab: '开发者 · VS Code',
            title: '选中任意 import，Tuff 预判你需要的文档。',
            copy: '内联推荐精准打开参考、示例代码与最新变更记录。',
            action: '打开 FlowScript API 参考',
          },
          designer: {
            tab: '设计师 · Figma',
            title: '选中图层时，情境动作即时浮现。',
            copy: '导出预设、CSS 令牌与无障碍检查一并呈现，毫不停顿。',
            action: '导出图层 PNG · 复制 CSS',
          },
          zero: {
            tab: '零输入',
            title: '唤出 Tuff，你的下一步已准备就绪。',
            copy: '近期文件、会议与自动化场景依照你的节奏井然呈现。',
            action: '继续 “Launch Prep” 工作区 · 加入 Daily Sync',
          },
        },
      },
      craftsmanship: {
        eyebrow: '工艺与细节',
        headline: '每一处细节，都已升华。',
        subheadline: '行云流水的体验，源自对基础的极致雕琢。',
        clips: {
          system: {
            tag: '系统控制',
            title: '“深色模式” 指令瞬间切换全局。',
            copy: '即便编排系统级切换，动画仍保持 120fps 的丝滑顺畅。',
          },
          clipboard: {
            tag: '剪贴板胶片库',
            title: '历史记录化身沉浸式胶片流。',
            copy: '图像、色板与文本预览以柔和视差呈现，一眼锁定所需内容。',
          },
          performance: {
            tag: '延迟实验室',
            title: '唤起 Tuff，零延迟，零多余动作。',
            copy: '从按键到呈现平均 18ms，并沿用文档动效同款调校。',
          },
        },
      },
      pioneer: {
        eyebrow: '先锋计划',
        headline: '未来的工作方式，即将到来。成为第一位塑造者。',
        subheadline: '加入 Tuff 先锋计划。抢先体验、共同构建，定义下一代效率工具。',
        formTitle: '邮箱',
        cta: '申请先锋资格',
        benefitsTitle: '专属先锋权益',
        benefits: {
          early: {
            title: '抢先体验',
            copy: '在正式发布前预览每一个前沿版本。',
          },
          shape: {
            title: '影响产品',
            copy: '与核心团队直接对话，你的反馈将塑造产品路线。',
          },
          community: {
            title: '专属社区',
            copy: '参加专属交流、办公时段，并在平台内获得身份标识。',
          },
        },
        privacy: '你的邮箱仅用于先锋计划的邀请与更新通知。',
      },
    },
    features: {
      badge: '为什么选择 Tuff',
      title: '比想象更进一步。',
      description: '依托智能编排、响应式视觉与可随团队野心扩展的工具。',
      items: {
        innovativeDesign: {
          title: '创新设计',
          description: '具备影院级动效的现代界面，在弱化噪点的同时突出关键信息。',
        },
        lightningFast: {
          title: '闪电般迅捷',
          description: '即刻启动、编排任务、切换工作区而不丢帧。',
        },
        secureReliable: {
          title: '安全可靠',
          description: '端到端加密通道守护创意，冗余机制守护每次同步。',
        },
        crossPlatform: {
          title: '跨平台',
          description: '跨桌面环境保持一致体验与原生手势。',
        },
        extensible: {
          title: '高度可扩展',
          description: '通过灵活插件 API 与团队化生命周期工具定制行为。',
        },
        customizable: {
          title: '自由定制',
          description: '调校色彩、布局与自动化，让工作区贴合个人节奏。',
        },
      },
    },
    extensions: {
      badge: '插件平台',
      title: '从轻量插件拓展至完整工作区能力。',
      description: '多语言工具链助力从辅助插件到深度集成，每项能力都为可组合性、性能与轻松部署而设计。',
      cta: '浏览插件市场',
      items: {
        lightweight: {
          title: '轻量插件',
          description: '几分钟内交付专用工具，随时启用并迭代，无需完整发布流程。',
        },
        heavyweight: {
          title: '高级插件',
          description: '通过工作区感知插件与深度钩子改造导航、面板或数据视图。',
        },
        integration: {
          title: '无缝集成',
          description: '调校命令面板、启动器与自动化栈，同时保持性能。',
        },
        developer: {
          title: '开发者友好',
          description: '结构化 SDK、极速热重载与精确诊断让迭代轻松自如。',
        },
      },
    },
    testing: {
      badge: '先锋测试',
      title: '加入共塑 Tuff 的抢先体验社区。',
      description: '通过先锋测试计划验证新集成、压力测试自动化，确保每次发布稳定。',
      items: {
        alpha: {
          tag: 'Alpha 航队',
          title: '抢先体验构建',
          description: '抢先预览新能力，实时反馈，影响下一版稳定发布。',
        },
        touch: {
          tag: 'Touch Lab',
          title: '场景自动化',
          description: '记录复杂流程、附加断言并零配置复播于不同构建。',
        },
        shield: {
          tag: 'Shield',
          title: '稳定性保障',
          description: '每个里程碑都历经多平台验证、性能基准与回归扫描。',
        },
      },
    },
    finalCta: {
      title: '准备好探索 Tuff 生态了吗？',
      description: '用一个放大创作者、运营者与高效团队的平台，打造沉浸式桌面体验。',
      primary: '浏览文档',
      secondary: '与团队交流',
    },
    footer: {
      tagline: '属于你的大脑，更聪明、可无限扩展',
      primaryCta: '下载 Beta',
      secondaryCta: '查看文档',
      rights: '保留所有权利。',
      privacy: '隐私政策',
      terms: '服务条款',
      sections: {
        product: '产品',
        resources: '资源',
      },
      socials: {
        github: 'GitHub',
      },
    },
  },
  docs: {
    loading: '正在加载文档内容…',
    notFoundTitle: '未找到文档',
    notFoundDescription: '当前路径暂未匹配到内容，请返回文档首页。',
    backHome: '返回文档首页',
    redirecting: '正在跳转到文档入口…',
    outlineLabel: '大纲',
    defaultTitle: '文档',
    noOutline: '为文档添加标题后，这里会自动生成导航。',
    lastUpdatedLabel: '最后更新于',
    editOnGitHub: '在 GitHub 上编辑此页',
    previousChapter: '上一章',
    nextChapter: '下一章',
  },
  docsNav: {
    start: '快速上手',
  },
  docsSidebar: {
    error: '导航加载失败，请稍后再试。',
  },
  license: {
    title: 'Tuff 服务条款',
    description: 'Tuff 服务条款和用户协议',
    lastUpdated: '最后更新',
    section1: {
      title: '1. 接受条款',
      content: '通过访问和使用 Tuff 服务，您同意受本服务条款的约束。如果您不同意这些条款，请不要使用我们的服务。',
    },
    section2: {
      title: '2. 服务描述',
      content: 'Tuff 是一个多平台工具计划，旨在将您的桌面转变为响应迅速的智能控制中心。我们提供自动化、插件系统和协作功能。',
    },
    section3: {
      title: '3. 用户责任',
      content: '您有责任确保您的使用符合所有适用的法律法规。您不得将服务用于非法目的或传输有害内容。',
    },
    section4: {
      title: '4. 隐私保护',
      content: '我们重视您的隐私。绝大多数逻辑在本地运行，云端同步全程加密，密钥由您掌控。',
    },
    section5: {
      title: '5. 知识产权',
      content: 'Tuff 及其所有相关知识产权归我们所有。您不得复制、修改或分发我们的软件，除非获得明确授权。',
    },
    section6: {
      title: '6. 服务可用性',
      content: '我们努力保持服务的高可用性，但不保证服务不会中断。我们保留随时修改或终止服务的权利。',
    },
    section7: {
      title: '7. 免责声明',
      content: '服务按"现状"提供，我们不提供任何明示或暗示的保证。使用服务的风险由您自行承担。',
    },
    section8: {
      title: '8. 责任限制',
      content: '在法律允许的最大范围内，我们对因使用或无法使用服务而产生的任何损害不承担责任。',
    },
    section9: {
      title: '9. 条款修改',
      content: '我们保留随时修改这些条款的权利。重大变更将通过适当方式通知用户。',
    },
    section10: {
      title: '10. 适用法律',
      content: '这些条款受中华人民共和国法律管辖。任何争议应通过友好协商解决。',
    },
    contact: {
      title: '联系我们',
      content: '如果您对这些条款有任何疑问，请通过我们的官方渠道与我们联系。',
    },
  },
  protocol: {
    title: 'Tuff 软件许可证',
    description: 'Tuff 软件许可证和使用条款',
    lastUpdated: '最后更新',
    section1: {
      title: '1. 许可证授予',
      content: '根据本许可证，我们授予您使用 Tuff 软件的有限、非独占、不可转让的权利。',
    },
    section2: {
      title: '2. 使用限制',
      content: '您不得逆向工程、反编译或反汇编软件。您不得将软件用于商业用途，除非获得明确授权。',
    },
    section3: {
      title: '3. 开源组件',
      content: 'Tuff 可能包含开源软件组件。这些组件受其各自的开源许可证约束。',
    },
    section4: {
      title: '4. 更新和支持',
      content: '我们可能会提供软件更新。更新可能包含新功能、错误修复或安全改进。',
    },
    section5: {
      title: '5. 数据收集',
      content: '我们可能会收集匿名使用数据以改进软件。我们不会收集个人敏感信息。',
    },
    section6: {
      title: '6. 第三方集成',
      content: '软件可能与第三方服务集成。这些服务的使用受其各自的服务条款约束。',
    },
    section7: {
      title: '7. 终止',
      content: '如果您违反本许可证，我们有权立即终止您的使用权限。',
    },
    section8: {
      title: '8. 保证免责',
      content: '软件按"现状"提供，不提供任何明示或暗示的保证。',
    },
    section9: {
      title: '9. 责任限制',
      content: '在法律允许的最大范围内，我们对因使用软件而产生的任何损害不承担责任。',
    },
    section10: {
      title: '10. 许可证终止',
      content: '本许可证在您停止使用软件或违反条款时自动终止。',
    },
    contact: {
      title: '技术支持',
      content: '如需技术支持或报告问题，请通过我们的官方渠道联系我们。',
    },
  },
}
