export default {
    nexus: {
      hero: {
        eyebrow: '本地优先，隐私内建。',
        titlePrefix: '你的',
        titleSubject: 'OS',
        titleLead: '你的 OS，',
        titleAccent: '可 随心创作',
        title: '你的 OS，可 随心创作',
        copy: 'Nexus 是 Tuff 的公开入口：承载可信发布、插件生态和开发文档，让桌面端保持轻、快、可扩展。',
        subtitle: '一个入口，搜索文件、启动应用、驱动 Agent —— 就在你的桌面。',
        primaryCta: '获取当前版本',
        getPlatformVersion: '获取 {platform} 版本',
        secondaryCta: '查看开发文档',
        openSource: '免费开源',
        hints: {
          nav: '导航',
          open: '打开',
          actions: '操作',
        },
        releases: {
          latest: '最新',
          history: '历史版本',
          historyTitle: '版本历史',
          whatsNew: '更新内容',
          viewAll: '在「更新」中查看全部',
          close: '关闭',
        },
        trust: {
          verifiedTitle: '官方认证版本',
          verifiedDesc: '此版本由官方签名与公证发布，可放心下载安装。',
          previewTitle: '预览通道版本',
          previewDesc: '这是预览通道构建，尚未进入稳定认证，请注意：',
          points: {
            prerelease: '预发布版本，功能与接口可能随时调整。',
            stability: '稳定性未经完整验证，不建议用于生产环境。',
            channel: '如需长期稳定，请选择 Release 稳定版通道。',
          },
        },
        results: {
          app: '应用程序',
          web: '在浏览器打开',
          recent: '最近打开',
          open: '打开',
          go: '前往',
          recentAction: '最近',
        },
      },
      product: {
        eyebrow: '真实产品画面',
        title: 'CoreBox 是第一工作面，不是另一个后台。',
        previewAlt: 'Tuff CoreBox 本地文件搜索界面',
        caption: '同一个输入面可以搜索文件、唤起应用、调用插件，并把上下文交给 Agent。',
      },
      capabilities: {
        eyebrow: '能力边界',
        title: '围绕本地桌面建立清晰的执行链路。',
        items: {
          local: {
            title: '本地上下文优先',
            copy: '剪贴板、文件、应用与桌面状态先在本机被组织，Nexus 只负责生态、文档和可信发布协同。',
          },
          intelligence: {
            title: '模型与工具统一调度',
            copy: 'Tuff Intelligence 将模型路由、桌面上下文与工具执行收束进 CoreBox，减少来回切换。',
          },
          plugins: {
            title: '插件扩展可审计',
            copy: 'Manifest、权限和 SDK marker 让每个扩展能力都有入口、有边界，也能被回溯。',
          },
        },
      },
      workflow: {
        eyebrow: '工作流',
        title: '从意图到桌面动作，保持一条线。',
        items: {
          capture: {
            title: '捕获意图',
            copy: '用全局快捷键唤起 CoreBox，将自然语言、文件名或片段直接放进同一个入口。',
          },
          route: {
            title: '整理上下文',
            copy: '运行时把输入、当前桌面状态和可用能力组织成可执行请求。',
          },
          execute: {
            title: '推进动作',
            copy: '通过内置能力、MCP 和插件执行真实操作，并把结果回到当前工作流。',
          },
        },
      },
      final: {
        eyebrow: 'Pioneer 入口',
        title: '先把桌面工作流整理清楚，再把重复动作交给 Agent。',
        cta: '下载 Tuff',
      },
    },
    new: {
      hero: {
        eyebrow: '桌面指令中心',
        title: '本地优先的 Agent 工作入口。',
        copy: 'Tuff 把搜索、上下文、插件和 AI 执行收束到一个安静的桌面入口里。少切换窗口，多完成任务。',
        primaryCta: '下载 Tuff',
        secondaryCta: '阅读文档',
        previewAlt: 'Tuff CoreBox 文件搜索界面预览',
        previewCaption: 'CoreBox 在本地文件、应用和动作之间保持同一个输入面。',
      },
      proof: {
        eyebrow: '核心能力',
        title: '围绕本地桌面，而不是又一个云端面板。',
        items: {
          local: {
            title: '本地上下文优先',
            copy: '剪贴板、文件、应用和桌面状态成为 Agent 能理解的输入，敏感信息保留在明确边界内。',
          },
          command: {
            title: '一次唤起完成动作',
            copy: '从 CoreBox 搜索到插件执行，日常操作尽量保持键盘闭环。',
          },
          plugin: {
            title: '插件能力可审计',
            copy: 'Manifest、权限和 SDK 让扩展能力有清晰入口，也有清晰限制。',
          },
        },
      },
      workflow: {
        eyebrow: '工作流',
        title: '从意图到动作，保持一条线。',
        items: {
          summon: {
            title: '唤起',
            copy: '用全局快捷键打开 CoreBox，不需要先决定去哪个工具里找答案。',
          },
          understand: {
            title: '理解',
            copy: 'Tuff 将当前上下文、输入和可用能力整理成 Agent 能处理的请求。',
          },
          act: {
            title: '执行',
            copy: '通过内置工具、MCP 和插件把请求推进到真实桌面动作。',
          },
        },
      },
      principles: {
        eyebrow: '设计原则',
        title: '下一版 landing 先回到克制、清晰和可信。',
        items: {
          quiet: {
            title: '少动画，强层级',
            copy: '保留必要的入场和 hover 反馈，去掉抢滚动和持续占用 GPU 的装饰。',
          },
          typed: {
            title: '少承诺，强证据',
            copy: '用产品画面、能力边界和真实工作流解释价值，不堆抽象口号。',
          },
          sync: {
            title: '少分叉，强一致',
            copy: '沿用 Nexus 的路由、i18n 和预渲染体系，让试验页能平滑替换生产首页。',
          },
        },
      },
      final: {
        eyebrow: '先锋入口',
        title: '先把桌面工作流清理干净，再让 Agent 接管更多重复动作。',
        cta: '获取当前版本',
      },
    },
    hero: {
      description: 'Tuff 是本地优先的桌面 Agent 指令中心，把搜索、执行、插件和智能能力收束到一次唤起里。',
      heading: '一触即达的本地桌面 Agent 中心。',
      bullets: {
        cinematic: 'Alt + Space 唤起 CoreBox，搜索、执行与对话在同一入口完成。',
        policy: 'Electron 桌面运行时结合插件 SDK，让能力扩展保持可控、可审计。',
        realtime: '本地状态优先，Nexus 只承担文档、生态与可信发布协同。',
      },
      primaryCta: '下载 Tuff',
      secondaryCta: '开发者文档',
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
      highlights: {
        integrations: {
          title: '桌面入口',
          description: '全局快捷键唤起 CoreBox，保持键盘流完成日常操作。',
        },
        workspace: {
          title: '本地上下文',
          description: '围绕剪贴板、文件、应用与桌面状态组织 Agent 输入。',
        },
        focus: {
          title: '插件协同',
          description: '通过 Manifest、Prelude 与 Surface 把能力接入统一指令面。',
        },
      },
    },
    os: {
      aiSpotlight: {
        eyebrow: 'AI 核心体验',
        headline: '一处搜索，万物互联。',
        subheadline: '它不止是查找，更是理解。',
        summaryHighlight: 'Tuff 读懂意图',
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
        corebox: {
          slides: {
            search: {
              label: '搜索',
              focus: '应用 / 本地',
              query: 'QQMiniApp',
              alt: 'CoreBox 应用搜索动图',
            },
            file: {
              label: '文件',
              focus: '文件 / 最近',
              query: 'Roadmap',
              alt: 'CoreBox 文件搜索动图',
            },
            tool: {
              label: '工具',
              focus: 'AI / 内置',
              query: '翻译',
              alt: 'CoreBox 工具与翻译动图',
            },
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
        eyebrow: 'Agent 核心',
        headline: '模型、上下文与工具，统一进入桌面工作流。',
        subheadline: 'Tuff Intelligence 把模型路由、桌面上下文和 Agent 执行收束在 CoreBox 里。',
        demo: {
          chat: {
            placeholder: '输入问题，体验 AI...',
            thinking: '思考中...',
            send: '发送',
            commandsTitle: '命令',
            footer: 'Powered by Tuff Intelligence · 仅供参考',
            commands: {
              ask: {
                label: 'Ask ChatGPT',
                description: '让 ChatGPT 直接回答并给示例',
              },
              summarize: {
                label: '快速总结',
                description: '先给结论，再列关键点',
              },
              explain: {
                label: '拆解差异',
                description: '逐条解释 Composition 与 Options 的区别',
              },
            },
            prompts: {
              composition: {
                question: 'Vue 3 的 Composition API 和 Options API 有什么区别？',
                intro: 'Vue 3 同时支持 Composition API 与 Options API，核心区别在于组织方式与复用能力。',
                bullets: {
                  first: 'Composition API 更适合复杂逻辑拆分与跨组件复用。',
                  second: 'Options API 更适合结构清晰的页面与传统写法。',
                },
                note: '当项目规模变大时，Composition API 会更易维护。',
              },
              whenUse: {
                question: '什么时候该用 Composition API？',
                intro: '在需要拆分复杂业务逻辑或提升复用性时，Composition API 更有优势。',
                bullets: {
                  first: '跨组件共享逻辑：抽成 composables 更清晰。',
                  second: '大型项目：逻辑聚合更便于维护与协作。',
                },
                note: '小型页面也可以继续使用 Options API，迁移不必一步到位。',
              },
              reuse: {
                question: 'Vue 3 中如何组织可复用逻辑？',
                intro: '推荐使用 composables 将状态与行为封装成可复用的函数。',
                bullets: {
                  first: '把状态与副作用抽到独立的组合函数中。',
                  second: '保持命名一致，让用途一眼可读。',
                },
                note: '组合式 API 能让逻辑复用更自然，也更易测试。',
              },
              reactivity: {
                question: 'Vue 3 响应式系统的核心概念有哪些？',
                intro: 'Vue 3 的响应式由 Proxy 驱动，配合 ref / reactive / computed 使用。',
                bullets: {
                  first: 'ref 适合单值或基础类型。',
                  second: 'reactive 适合对象或复杂状态。',
                },
                note: '理解依赖收集与触发更新的机制，有助于避免性能陷阱。',
              },
            },
          },
          assist: {
            searchPlaceholder: '搜索 AI 命令',
            resultsTitle: '结果',
            processing: '处理中...',
            commands: {
              changeToneConfident: '改变语气为自信',
              changeToneCasual: '改变语气为休闲',
              fixSpelling: '修正拼写和语法',
              translate: '翻译文本',
              summarize: '总结要点',
            },
          },
          preview: {
            label: 'Quick Preview',
            copyResult: '复制结果',
            types: {
              expression: '快速算式',
              currency: '汇率换算',
              time: '时间转换',
              unit: '单位换算',
              color: '颜色解析',
              constant: '常量查询',
              text: '文本统计',
              hash: '哈希计算',
              encode: '编码转换',
            },
          },
          workflow: {
            placeholder: '描述要自动化的任务...',
            badge: '工作流',
            footer: 'Powered by Tuff Workflows · 多步骤自动化',
            scenarios: {
              translateEmail: {
                trigger: '把剪贴板内容翻译成英文并格式化为正式邮件',
                steps: {
                  read: '读取剪贴板',
                  translate: '翻译为英文',
                  format: '格式化为邮件',
                  copy: '复制到剪贴板',
                },
                resultLabel: '工作流完成',
                resultText: '已翻译并格式化的邮件已复制到剪贴板。',
              },
              summarizeSave: {
                trigger: '总结这篇文章并将要点保存到笔记',
                steps: {
                  fetch: '获取内容',
                  extract: '提取要点',
                  summarize: '生成摘要',
                  save: '保存到笔记',
                },
                resultLabel: '保存成功',
                resultText: '提取了 3 个关键要点并保存到工作区笔记。',
              },
              codeReview: {
                trigger: '审查最新的 git 改动并生成摘要报告',
                steps: {
                  diff: '读取 git diff',
                  analyze: '分析改动',
                  report: '生成报告',
                },
                resultLabel: '审查完成',
                resultText: '分析了 12 个文件 — 2 条建议，1 个潜在问题已标记。',
              },
            },
          },
        },
        cards: {
          chat: {
            title: '模型路由',
            copy: '设置入口模型，并按场景切换到更专业的模型。',
          },
          assist: {
            title: '桌面上下文',
            copy: '剪贴板、文件、应用与选中文本成为 Agent 可调用的上下文。',
          },
          preview: {
            title: 'Instant Preview',
            copy: '智能识别输入，即时预览计算、转换结果',
          },
          workflow: {
            title: 'Agent 工具执行',
            copy: '通过内置工具、MCP 与插件能力，把请求推进到真实动作。',
          },
        },
      },
      instantPreview: {
        eyebrow: '即时预览',
        headline: '输入即预览的即时小组件。',
        subheadline: '计算、转换与颜色解析在意图被识别时立即出现。',
        highlights: {
          speed: {
            title: '即时反馈',
            description: '在 CoreBox 输入时立即生成预览卡片。',
          },
          coverage: {
            title: '多格式覆盖',
            description: '算式、单位、时间、汇率、常量一次识别。',
          },
          copy: {
            title: '一键复制',
            description: '无需离开指令栏即可复制结果。',
          },
          consistency: {
            title: '格式一致',
            description: '输出规范化，便于快速复用。',
          },
        },
        widgets: {
          expression: {
            input: 'sqrt(16) + 2^4',
            result: '20',
            extra: '高级算式一行出结果。',
          },
          unit: {
            input: '12 cm to inch',
            result: '4.72 in',
            extra: '长度、质量、温度。',
            details: {
              meter: '0.12 m',
              feet: '0.3937 ft',
            },
          },
          time: {
            input: 'now + 2h',
            result: '2 小时后',
            extra: '支持自然语言。',
          },
          color: {
            input: '#8B5CF6',
            result: '#8B5CF6',
            extra: 'RGB(139, 92, 246)',
            details: {
              rgb: 'rgb(139, 92, 246)',
              hsl: 'hsl(262, 90%, 66%)',
            },
          },
          currency: {
            input: '19 usd to cny',
            result: '¥137.75',
            extra: 'USD → CNY',
            details: {
              source: '19.0000 USD',
              target: '137.7500 CNY',
            },
          },
          constant: {
            input: 'pi * 2',
            result: '6.28319',
            extra: '内置常量随手可用。',
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
        headline: '插件、Agent 与 SDK，统一扩展桌面能力。',
        subheadline: '从 CoreBox 搜索源到 Intelligence SDK，每个能力都以清晰接口接入。',
        preview: {
          keyboard: {
            title: '全键盘',
            copy: '日常操作优先键盘完成，减少鼠标往返。',
          },
          fileSearch: {
            title: '文件搜索',
            copy: 'Windows 基于 Everything，macOS 走本地索引与原生能力。',
          },
          browser: {
            title: 'CDP 控制',
            copy: '浏览器控制能力对接简易指纹模拟与自动化场景。',
          },
          visual: {
            title: '可视化交互',
            copy: '可视化套件适配不同模型，支持更直观的 Agent 修改。',
          },
          token: {
            title: 'Token 节省',
            copy: '内置基于 rtk 的 Token 节省能力，开箱即可使用。',
          },
          upcoming: {
            title: '功能预告',
            copy: 'Skills、Computer Use、MiniApp、ACP、自动化与沙箱持续并入。',
          },
        },
        copied: '已复制',
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
        cta: '打开 Tuffex Design',
        ctaHref: '/docs/dev/components/foundations',
      },
      proactive: {
        eyebrow: '桌面上下文',
        headline: '把桌面的状态，变成 Agent 能理解的上下文。',
        subheadline: 'Tuff 先从剪贴板、程序状态、桌面状态与选中文本开始，逐步扩展到前台、焦点、屏幕、UI、轨迹、工作区与通知。',
        shieldLabel: '本地优先 · 上下文可控',
        scenarios: {
          developer: {
            tab: '程序状态',
            title: '当前应用、窗口与工作区状态进入请求上下文。',
            copy: 'Agent 不再只读一段 prompt，而是理解你正在处理哪个应用、文件与任务。',
            action: '读取活动应用 · 汇总窗口状态',
          },
          designer: {
            tab: '剪贴板与选区',
            title: '文本、图片、文件与 HTML 剪贴板可被结构化传入。',
            copy: '选中文本和剪贴板内容会成为明确输入，避免反复解释上下文。',
            action: '读取剪贴板 · 解析选中文本',
          },
          zero: {
            tab: '桌面与通知',
            title: '桌面状态、通知与工作区信号将逐步进入上下文图谱。',
            copy: '让 Agent 在足够上下文里处理需求，把手动补充信息的时间还给创作。',
            action: '同步桌面状态 · 聚合工作区信号',
          },
        },
      },
      craftsmanship: {
        eyebrow: '工艺与细节',
        headline: '每一处细节，都已升华。',
        subheadline: '行云流水的体验，源自对基础的极致雕琢。',
      },
      corebox: {
        placeholder: 'Everything in Tuff.',
        commands: {
          launch: {
            label: '快速启动',
            description: '打开应用、文件与链接。',
          },
          search: {
            label: '智能搜索',
            description: '跨本地与云端检索。',
          },
          clipboard: {
            label: '剪贴板库',
            description: '历史、片段与粘贴。',
          },
          flows: {
            label: '流程动作',
            description: '串联多步自动化。',
          },
          ai: {
            label: 'AI 助手',
            description: '总结、改写、抽取。',
          },
        },
      },
      pioneer: {
        eyebrow: '先锋计划',
        headline: '未来的工作方式，即将到来。成为第一位塑造者。',
        subheadline: '加入 Tuff 先锋计划。抢先体验、共同构建，定义下一代效率工具。',
        formTitle: '邮箱',
        cta: '申请先锋资格',
        ctaPrimary: '登录以开启先锋测试',
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
        guidance: '登录后，前往「更新」→「先锋测试」订阅 Beta 通道，即可接收推送通知。',
      },
    },
    features: {
      items: {
        innovativeDesign: {
          title: '可视化交互',
          description: '基于可视化套件修改与预览 Agent 输出，适配不同模型的交互方式。',
        },
        lightningFast: {
          title: '一触即达',
          description: 'Alt + Space 即时唤起，日常搜索、执行与提问尽量保持键盘闭环。',
        },
        secureReliable: {
          title: '本地优先',
          description: 'SQLite 作为本地权威源，敏感上下文与凭据按安全边界管理。',
        },
        crossPlatform: {
          title: '文件搜索',
          description: 'Windows 接入 Everything，macOS 与 Linux 走本地索引与平台能力。',
        },
        extensible: {
          title: 'Agent 工具链',
          description: '内置工具、MCP、插件能力与模型路由共同支撑真实任务执行。',
        },
        customizable: {
          title: '能力预告',
          description: 'Skills、Computer Use、MiniApp、ACP、自动化与沙箱能力陆续合并上线。',
        },
      },
    },
    extensions: {
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
    footer: {
      tagline: '属于你的大脑，更聪明、可无限扩展',
      rights: '保留所有权利。',
      privacy: '隐私政策',
      terms: '服务条款',
      license: '软件许可证',
      sections: {
        product: '产品',
        resources: '资源',
      },
      socials: {
        github: 'GitHub',
      },
    },
  }
