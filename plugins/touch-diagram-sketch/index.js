const PLUGIN_NAME = 'touch-diagram-sketch'
const FEATURE_ID = 'diagram-sketch'
const SOURCE_ID = 'plugin-features'
const ACTION_GROUP = 'diagram-sketch'
const ICON = { type: 'file', value: 'assets/logo.svg' }

const COMMAND_PREFIXES = [
  'diagram',
  'mermaid',
  'mmd',
  'ascii',
  'flowchart',
  'sequence',
  'er',
  'erd',
  'gitgraph',
  '架构图',
  '流程图',
  '时序图',
  '画图',
]

const AI_PREFIXES = ['ai', 'gen', 'generate', '生成', '绘图']

const TEMPLATES = [
  // Flowchart (3)
  {
    id: 'oauth-flow',
    category: 'flowchart',
    title: 'OAuth 2.0 / OIDC 登录流程',
    subtitle: 'Flowchart · PKCE 授权码交换与 Token 校验',
    keywords: ['oauth', 'oidc', 'auth', 'login', 'pkce', 'flowchart', '登录', '授权', '流程图'],
    mermaid: [
      'flowchart LR',
      '  U["User Browser"] -->|1. Login + PKCE| App["Client App"]',
      '  App -->|2. Authorize| IdP["Identity Provider"]',
      '  IdP -->|3. Auth Code| App',
      '  App -->|4. Code + Verifier| Token["Token Endpoint"]',
      '  Token -->|5. ID + Access Token| App',
      '  App -->|6. Bearer Token| API["Resource API"]',
    ].join('\n'),
    ascii: [
      '┌──────────────┐   PKCE   ┌────────────┐  Authorize  ┌───────────────────┐',
      '│ User Browser │ ───────▶ │ Client App │ ──────────▶ │ Identity Provider │',
      '└──────────────┘          └─────┬──────┘             └─────────┬─────────┘',
      '                                │ ◀───────── Auth Code ────────┘',
      '                                ▼',
      '                        ┌────────────────┐   JWT   ┌──────────────┐',
      '                        │ Token Endpoint │ ──────▶ │ Resource API │',
      '                        └────────────────┘         └──────────────┘',
    ].join('\n'),
  },
  {
    id: 'ci-cd-pipeline',
    category: 'flowchart',
    title: 'CI/CD 构建与金丝雀发布',
    subtitle: 'Flowchart · Lint -> Test -> Build -> Canary -> Prod',
    keywords: ['cicd', 'ci', 'cd', 'pipeline', 'deploy', 'canary', 'flowchart', '发布', '流水线'],
    mermaid: [
      'flowchart LR',
      '  Push["Git Push"] --> Lint["Lint & Typecheck"]',
      '  Lint --> Test["Unit & E2E Tests"]',
      '  Test --> Build["Container Build"]',
      '  Build --> Canary["Canary 10%"]',
      '  Canary --> Gate{"Error Rate < 0.1%?"}',
      '  Gate -->|Yes| Prod["Full Rollout 100%"]',
      '  Gate -->|No| Rollback["Auto Rollback"]',
    ].join('\n'),
    ascii: [
      '┌──────────┐     ┌──────┐     ┌───────┐     ┌────────┐     ┌────────────┐',
      '│ Git Push │ ──▶ │ Lint │ ──▶ │ Tests │ ──▶ │ Canary │ ──▶ │ Full Prod  │',
      '└──────────┘     └──────┘     └───────┘     └───┬────┘     └────────────┘',
      '                                                │ Fail',
      '                                                ▼',
      '                                          ┌───────────────┐',
      '                                          │ Auto Rollback │',
      '                                          └───────────────┘',
    ].join('\n'),
  },
  {
    id: 'incident-triage',
    category: 'flowchart',
    title: '线上故障分诊与回滚决策树',
    subtitle: 'Flowchart · Alert -> Severity -> Mitigate -> Postmortem',
    keywords: ['incident', 'triage', 'oncall', 'alert', 'rollback', 'flowchart', '故障', '告警'],
    mermaid: [
      'flowchart TD',
      '  Alert["Pager Alert"] --> Sev{"SEV-1 / Outage?"}',
      '  Sev -->|Yes| WarRoom["Open War Room"]',
      '  Sev -->|No| Queue["Triage Backlog"]',
      '  WarRoom --> Recent{"Recent Deploy?"}',
      '  Recent -->|Yes| Rollback["Rollback Release"]',
      '  Recent -->|No| Hotfix["Feature Flag / Hotfix"]',
      '  Rollback --> Verify["Verify SLO Recovery"]',
      '  Hotfix --> Verify',
      '  Verify --> Postmortem["Blameless Postmortem"]',
    ].join('\n'),
    ascii: [
      '   ┌─────────────┐',
      '   │ Pager Alert │',
      '   └──────┬──────┘',
      '          ▼',
      '   ┌──────────────┐   No    ┌────────────────┐',
      '   │ SEV-1 Outage │ ──────▶ │ Triage Backlog │',
      '   └──────┬───────┘         └────────────────┘',
      '          │ Yes',
      '          ▼',
      '  ┌──────────────────┐     ┌────────────────┐',
      '  │ Rollback/Hotfix  │ ──▶ │ Verify & RCA   │',
      '  └──────────────────┘     └────────────────┘',
    ].join('\n'),
  },

  // Sequence (3)
  {
    id: 'api-auth-seq',
    category: 'sequence',
    title: 'API 网关鉴权请求时序图',
    subtitle: 'Sequence · Client -> Gateway -> Auth -> Service -> DB',
    keywords: ['sequence', 'api', 'gateway', 'jwt', 'auth', 'db', '时序图', '网关', '鉴权'],
    mermaid: [
      'sequenceDiagram',
      '  autonumber',
      '  participant C as Client',
      '  participant G as API Gateway',
      '  participant A as Auth Service',
      '  participant S as Domain Service',
      '  participant D as Postgres',
      '  C->>G: GET /v1/projects (Bearer JWT)',
      '  G->>A: Verify signature & claims',
      '  A-->>G: 200 OK (tenantId, roles)',
      '  G->>S: Forward request + X-Tenant-Id',
      '  S->>D: SELECT * FROM projects WHERE tenant_id = $1',
      '  D-->>S: Rows',
      '  S-->>C: 200 OK (JSON)',
    ].join('\n'),
    ascii: [
      '┌────────┐   JWT   ┌─────────┐  Verify  ┌──────┐',
      '│ Client │ ──────▶ │ Gateway │ ───────▶ │ Auth │',
      '└────────┘         └────┬────┘          └──────┘',
      '                        │ Forward',
      '                        ▼',
      '                  ┌─────────┐   SQL   ┌──────────┐',
      '                  │ Service │ ──────▶ │ Postgres │',
      '                  └─────────┘         └──────────┘',
    ].join('\n'),
  },
  {
    id: 'payment-webhook',
    category: 'sequence',
    title: '异步支付与幂等 Webhook 时序图',
    subtitle: 'Sequence · Checkout -> Payment Provider -> Idempotent Worker',
    keywords: ['sequence', 'payment', 'webhook', 'stripe', 'idempotent', '支付', '回调', '时序图'],
    mermaid: [
      'sequenceDiagram',
      '  participant U as User',
      '  participant App as Checkout API',
      '  participant Pay as Payment Gateway',
      '  participant Q as Event Queue',
      '  U->>App: POST /checkout',
      '  App->>Pay: Create PaymentIntent (Idempotency-Key)',
      '  Pay-->>App: client_secret',
      '  U->>Pay: Confirm Card Payment',
      '  Pay->>App: POST /webhooks/payment (Signed)',
      '  App->>Q: Enqueue payment.succeeded (dedupe by event_id)',
      '  App-->>Pay: 200 Accepted',
    ].join('\n'),
    ascii: [
      '┌──────┐  Checkout  ┌──────────────┐  Intent  ┌─────────────────┐',
      '│ User │ ─────────▶ │ Checkout API │ ───────▶ │ Payment Gateway │',
      '└──────┘            └──────┬───────┘          └────────┬────────┘',
      '                           │ ◀──── Signed Webhook ─────┘',
      '                           ▼',
      '                   ┌──────────────┐',
      '                   │ Event Queue  │ (idempotent by event_id)',
      '                   └──────────────┘',
    ].join('\n'),
  },
  {
    id: 'sse-stream',
    category: 'sequence',
    title: 'AI 流式 SSE Token 推送时序图',
    subtitle: 'Sequence · UI -> Orchestrator -> LLM Provider -> Stream Delta',
    keywords: ['sequence', 'sse', 'stream', 'ai', 'llm', 'token', '流式', '时序图'],
    mermaid: [
      'sequenceDiagram',
      '  participant UI as Chat Surface',
      '  participant Host as Runtime Host',
      '  participant LLM as Model Provider',
      '  UI->>Host: Send prompt (sessionId)',
      '  Host->>LLM: POST /chat/completions (stream: true)',
      '  loop Token Deltas',
      '    LLM-->>Host: data: {"delta": "..."}',
      '    Host-->>UI: Emit chunk event',
      '  end',
      '  LLM-->>Host: data: [DONE]',
      '  Host-->>UI: Commit message & usage stats',
    ].join('\n'),
    ascii: [
      '┌──────────────┐  Prompt  ┌──────────────┐  SSE Stream  ┌────────────────┐',
      '│ Chat Surface │ ───────▶ │ Runtime Host │ ───────────▶ │ Model Provider │',
      '└──────────────┘ ◀── ── ──└──────────────┘ ◀── deltas ──└────────────────┘',
    ].join('\n'),
  },

  // ER Diagram (2)
  {
    id: 'saas-erd',
    category: 'er',
    title: '多租户 SaaS 实体关系图 (ER)',
    subtitle: 'ER Diagram · Organization / User / Membership / Subscription',
    keywords: ['er', 'erd', 'database', 'schema', 'saas', 'tenant', '数据库', '实体关系'],
    mermaid: [
      'erDiagram',
      '  ORGANIZATION ||--o{ MEMBERSHIP : has',
      '  USER ||--o{ MEMBERSHIP : belongs_to',
      '  ORGANIZATION ||--|| SUBSCRIPTION : owns',
      '  ORGANIZATION {',
      '    uuid id PK',
      '    string slug UK',
      '    string name',
      '  }',
      '  USER {',
      '    uuid id PK',
      '    string email UK',
      '    timestamp created_at',
      '  }',
      '  MEMBERSHIP {',
      '    uuid org_id FK',
      '    uuid user_id FK',
      '    string role',
      '  }',
      '  SUBSCRIPTION {',
      '    uuid id PK',
      '    uuid org_id FK',
      '    string plan',
      '    string status',
      '  }',
    ].join('\n'),
    ascii: [
      '┌──────────────┐ 1    N ┌────────────┐ N    1 ┌──────┐',
      '│ ORGANIZATION │ ─────▶ │ MEMBERSHIP │ ◀───── │ USER │',
      '└──────┬───────┘        └────────────┘        └──────┘',
      '       │ 1:1',
      '       ▼',
      '┌──────────────┐',
      '│ SUBSCRIPTION │',
      '└──────────────┘',
    ].join('\n'),
  },
  {
    id: 'ecommerce-erd',
    category: 'er',
    title: '电商订单实体关系图 (ER)',
    subtitle: 'ER Diagram · Customer / Order / LineItem / Product',
    keywords: ['er', 'erd', 'ecommerce', 'order', 'product', 'schema', '电商', '订单', '数据库'],
    mermaid: [
      'erDiagram',
      '  CUSTOMER ||--o{ ORDER : places',
      '  ORDER ||--|{ LINE_ITEM : contains',
      '  PRODUCT ||--o{ LINE_ITEM : referenced_by',
      '  ORDER {',
      '    uuid id PK',
      '    uuid customer_id FK',
      '    int total_cents',
      '    string status',
      '  }',
      '  LINE_ITEM {',
      '    uuid order_id FK',
      '    uuid product_id FK',
      '    int quantity',
      '    int unit_cents',
      '  }',
    ].join('\n'),
    ascii: [
      '┌──────────┐ 1:N ┌───────┐ 1:N ┌───────────┐ N:1 ┌─────────┐',
      '│ CUSTOMER │ ──▶ │ ORDER │ ──▶ │ LINE_ITEM │ ◀── │ PRODUCT │',
      '└──────────┘     └───────┘     └───────────┘     └─────────┘',
    ].join('\n'),
  },

  // State Machine (2)
  {
    id: 'order-state',
    category: 'state',
    title: '订单履约状态机 (State)',
    subtitle: 'State Diagram · Draft -> Paid -> Shipped -> Delivered / Refunded',
    keywords: ['state', 'fsm', 'order', 'lifecycle', '状态机', '订单状态'],
    mermaid: [
      'stateDiagram-v2',
      '  [*] --> Draft',
      '  Draft --> PendingPayment : checkout',
      '  PendingPayment --> Paid : payment_succeeded',
      '  PendingPayment --> Cancelled : timeout',
      '  Paid --> Packing : warehouse_ack',
      '  Packing --> Shipped : carrier_pickup',
      '  Shipped --> Delivered : customer_signed',
      '  Paid --> Refunded : refund_approved',
      '  Delivered --> [*]',
      '  Cancelled --> [*]',
      '  Refunded --> [*]',
    ].join('\n'),
    ascii: [
      '┌───────┐     ┌─────────┐     ┌──────┐     ┌─────────┐     ┌───────────┐',
      '│ Draft │ ──▶ │ Pending │ ──▶ │ Paid │ ──▶ │ Shipped │ ──▶ │ Delivered │',
      '└───────┘     └────┬────┘     └──┬───┘     └─────────┘     └───────────┘',
      '                   ▼             ▼',
      '             ┌───────────┐ ┌──────────┐',
      '             │ Cancelled │ │ Refunded │',
      '             └───────────┘ └──────────┘',
    ].join('\n'),
  },
  {
    id: 'job-queue-state',
    category: 'state',
    title: '异步任务队列状态机 (State)',
    subtitle: 'State Diagram · Queued -> Running -> Retry / Completed / DLQ',
    keywords: ['state', 'job', 'worker', 'queue', 'retry', 'dlq', '状态机', '任务队列'],
    mermaid: [
      'stateDiagram-v2',
      '  [*] --> Queued',
      '  Queued --> Running : worker_claim',
      '  Running --> Completed : exit_0',
      '  Running --> RetryWait : transient_error',
      '  RetryWait --> Queued : backoff_elapsed',
      '  Running --> DeadLetter : max_attempts_exceeded',
      '  Completed --> [*]',
      '  DeadLetter --> [*]',
    ].join('\n'),
    ascii: [
      '┌────────┐     ┌─────────┐     ┌───────────┐',
      '│ Queued │ ──▶ │ Running │ ──▶ │ Completed │',
      '└───▲────┘     └────┬────┘     └───────────┘',
      '    │ backoff       ├── retry ──▶ ┌───────────┐',
      '    └───────────────┘             │ RetryWait │',
      '                    └── max ────▶ ┌────────────┐',
      '                                  │ DeadLetter │',
      '                                  └────────────┘',
    ].join('\n'),
  },

  // Class Diagram (2)
  {
    id: 'plugin-arch-class',
    category: 'class',
    title: '插件运行时与能力门面类图 (Class)',
    subtitle: 'Class Diagram · PluginHost / Lifecycle / CapabilityFacade',
    keywords: ['class', 'oop', 'uml', 'plugin', 'facade', '类图', '架构'],
    mermaid: [
      'classDiagram',
      '  class PluginHost {',
      '    +loadPlugin(manifest)',
      '    +dispatchTrigger(featureId, query)',
      '    +dispatchAction(item, ctx)',
      '  }',
      '  class PluginLifecycle {',
      '    <<interface>>',
      '    +onInit()',
      '    +onFeatureTriggered(featureId, query)',
      '    +onItemAction(item, context)',
      '    +onDestroy()',
      '  }',
      '  class CapabilityGate {',
      '    +check(permissionId) bool',
      '    +enforce(scope)',
      '  }',
      '  PluginHost o-- PluginLifecycle',
      '  PluginHost --> CapabilityGate',
    ].join('\n'),
    ascii: [
      '┌──────────────────┐  manages   ┌─────────────────┐',
      '│    PluginHost    │ ◇────────▶ │ PluginLifecycle │',
      '└────────┬─────────┘            └─────────────────┘',
      '         │ enforces',
      '         ▼',
      '┌──────────────────┐',
      '│  CapabilityGate  │',
      '└──────────────────┘',
    ].join('\n'),
  },
  {
    id: 'repository-pattern',
    category: 'class',
    title: '仓储与缓存装饰器类图 (Class)',
    subtitle: 'Class Diagram · Service -> Repository Interface <- Sql / Cached',
    keywords: ['class', 'repository', 'cache', 'decorator', 'pattern', '类图', '设计模式'],
    mermaid: [
      'classDiagram',
      '  class UserService {',
      '    -repo: UserRepository',
      '    +getProfile(id)',
      '  }',
      '  class UserRepository {',
      '    <<interface>>',
      '    +findById(id)',
      '    +save(user)',
      '  }',
      '  class PostgresUserRepository',
      '  class CachedUserRepository {',
      '    -inner: UserRepository',
      '    -ttlSeconds: int',
      '  }',
      '  UserService --> UserRepository',
      '  UserRepository <|.. PostgresUserRepository',
      '  UserRepository <|.. CachedUserRepository',
      '  CachedUserRepository o-- UserRepository',
    ].join('\n'),
    ascii: [
      '┌─────────────┐     ┌────────────────┐',
      '│ UserService │ ──▶ │ UserRepository │ (interface)',
      '└─────────────┘     └───────▲────────┘',
      '                   ┌────────┴────────┐',
      '      ┌────────────┴───────┐  ┌──────┴───────────────┐',
      '      │ PostgresRepository │  │ CachedUserRepository │',
      '      └────────────────────┘  └──────────────────────┘',
    ].join('\n'),
  },

  // Architecture (2)
  {
    id: 'edge-microservices',
    category: 'architecture',
    title: '边缘网关与微服务系统架构图',
    subtitle: 'Architecture · CDN -> WAF -> API Gateway -> Services -> DB/Redis',
    keywords: ['architecture', 'system', 'microservices', 'cdn', 'gateway', 'redis', '架构图', '微服务'],
    mermaid: [
      'flowchart LR',
      '  subgraph Edge["Edge Layer"]',
      '    CDN["Global CDN"] --> WAF["Edge WAF"]',
      '  end',
      '  subgraph Core["Application Cluster"]',
      '    GW["API Gateway"] --> Auth["Auth Service"]',
      '    GW --> CoreSvc["Core Service"]',
      '    GW --> Search["Search Service"]',
      '  end',
      '  subgraph Data["Data Layer"]',
      '    PG[("PostgreSQL")]',
      '    Redis[("Redis Cache")]',
      '    Obj[("Object Storage")]',
      '  end',
      '  WAF --> GW',
      '  CoreSvc --> PG',
      '  CoreSvc --> Redis',
      '  CoreSvc --> Obj',
    ].join('\n'),
    ascii: [
      '┌─────┐     ┌─────┐     ┌─────────────┐     ┌──────────────┐     ┌────────────┐',
      '│ CDN │ ──▶ │ WAF │ ──▶ │ API Gateway │ ──▶ │ Core Service │ ──▶ │ PostgreSQL │',
      '└─────┘     └─────┘     └──────┬──────┘     └──────┬───────┘     └────────────┘',
      '                               │                   └──▶ ┌─────────────┐',
      '                               └──▶ ┌────────────┐      │ Redis Cache │',
      '                                    │ Auth / API │      └─────────────┘',
      '                                    └────────────┘',
    ].join('\n'),
  },
  {
    id: 'event-driven',
    category: 'architecture',
    title: '事件驱动消息总线架构 (Kafka + DLQ)',
    subtitle: 'Architecture · Producer -> Kafka Topic -> Consumer Group -> DLQ',
    keywords: ['architecture', 'event', 'kafka', 'mq', 'broker', 'dlq', '事件驱动', '消息队列', '架构图'],
    mermaid: [
      'flowchart LR',
      '  P1["Order Service"] --> Broker(("Kafka Broker"))',
      '  P2["Billing Service"] --> Broker',
      '  Broker --> C1["Notification Worker"]',
      '  Broker --> C2["Analytics Sink"]',
      '  C1 -.->|Retry Exhausted| DLQ["Dead Letter Topic"]',
      '  C2 --> Warehouse[("ClickHouse")]',
    ].join('\n'),
    ascii: [
      '┌───────────────┐     ┌──────────────┐     ┌─────────────────────┐     ┌─────┐',
      '│ Order Service │ ──▶ │ Kafka Broker │ ──▶ │ Notification Worker │ ╌╌▶ │ DLQ │',
      '└───────────────┘     └──────┬───────┘     └─────────────────────┘     └─────┘',
      '                             └──▶ ┌────────────────┐ ──▶ ┌────────────┐',
      '                                  │ Analytics Sink │     │ ClickHouse │',
      '                                  └────────────────┘     └────────────┘',
    ].join('\n'),
  },

  // GitGraph (2)
  {
    id: 'git-trunk',
    category: 'gitgraph',
    title: '主干开发与版本发布流 (GitGraph)',
    subtitle: 'GitGraph · main -> feature branch -> PR merge -> tag v1.0.0',
    keywords: ['git', 'gitgraph', 'trunk', 'branch', 'release', 'pr', '分支', '发布流'],
    mermaid: [
      'gitGraph',
      '  commit id: "init"',
      '  branch feat/color-lab',
      '  checkout feat/color-lab',
      '  commit id: "add oklch math"',
      '  commit id: "add wcag tests"',
      '  checkout main',
      '  merge feat/color-lab id: "PR #42" tag: "v1.0.0"',
      '  commit id: "docs sync"',
    ].join('\n'),
    ascii: [
      'main:      ●────────────────────────● (v1.0.0) ──●',
      '            ╲                      ╱',
      'feat/lab:    ●─────────●──────────╱',
    ].join('\n'),
  },
  {
    id: 'git-hotfix',
    category: 'gitgraph',
    title: '生产热修复分支流 (GitGraph)',
    subtitle: 'GitGraph · main -> release/1.0 -> hotfix -> merge back',
    keywords: ['git', 'gitgraph', 'hotfix', 'release', 'branch', '热修复', '分支'],
    mermaid: [
      'gitGraph',
      '  commit id: "v1.0.0" tag: "v1.0.0"',
      '  branch develop',
      '  checkout develop',
      '  commit id: "feat-next"',
      '  checkout main',
      '  branch hotfix/auth',
      '  checkout hotfix/auth',
      '  commit id: "fix token expiry"',
      '  checkout main',
      '  merge hotfix/auth tag: "v1.0.1"',
      '  checkout develop',
      '  merge main',
    ].join('\n'),
    ascii: [
      'main:       ● (v1.0.0) ───────────● (v1.0.1)',
      '             │ ╲                 ╱ │',
      'hotfix:      │  ●───────────────╱  │',
      '             ▼                     ▼',
      'develop:     ●─────────────────────●',
    ].join('\n'),
  },
]

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

function getIntelligence() {
  return globalThis.intelligence || globalThis.plugin?.intelligence
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

function displayWidth(text) {
  let width = 0
  for (const ch of String(text)) {
    const code = ch.codePointAt(0) || 0
    const isWide = (code >= 0x1100 && code <= 0x115F)
      || (code >= 0x2E80 && code <= 0xA4CF)
      || (code >= 0xAC00 && code <= 0xD7A3)
      || (code >= 0xF900 && code <= 0xFAFF)
      || (code >= 0xFE10 && code <= 0xFE6F)
      || (code >= 0xFF00 && code <= 0xFF60)
      || (code >= 0xFFE0 && code <= 0xFFE6)
      || (code >= 0x20000 && code <= 0x3FFFF)
    width += isWide ? 2 : 1
  }
  return width
}

function padCenterDisplay(text, targetWidth) {
  const w = displayWidth(text)
  const diff = Math.max(0, targetWidth - w)
  const left = Math.floor(diff / 2)
  const right = diff - left
  return `${' '.repeat(left)}${text}${' '.repeat(right)}`
}

function stripCommandPrefix(rawQuery) {
  const normalized = normalizeText(rawQuery).replace(/\s+/g, ' ')
  if (!normalized)
    return { prefix: '', rest: '' }
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

function parseAiPrompt(text) {
  const normalized = normalizeText(text)
  if (!normalized)
    return null
  const lower = normalized.toLowerCase()
  for (const prefix of AI_PREFIXES) {
    if (lower.startsWith(`${prefix} `) || lower.startsWith(`${prefix}:`)) {
      const offset = prefix.length + (lower.startsWith(`${prefix}:`) ? 1 : 0)
      const prompt = normalized.slice(offset).trim()
      if (prompt)
        return { explicit: true, prompt }
    }
  }
  return null
}

function hasArrowShorthand(text) {
  return /<-->|<->|-\.->|-->|==>|=>|->/.test(text)
}

function parseArrowShorthand(raw) {
  let input = normalizeText(raw)
  let direction = 'LR'
  let preferredType = 'flowchart'

  const hintMatch = /^(td|tb|lr|rl|bt|seq|sequence)\s*:\s*(.+)$/i.exec(input)
  if (hintMatch) {
    const hint = hintMatch[1].toLowerCase()
    input = hintMatch[2].trim()
    if (hint === 'seq' || hint === 'sequence') {
      preferredType = 'sequence'
    }
    else {
      direction = hint.toUpperCase()
    }
  }

  if (!hasArrowShorthand(input))
    return null

  const rawBranches = input
    .split(/\s*[;\n]+\s*/)
    .map(branch => branch.trim())
    .filter(Boolean)

  const arrowPattern = /\s*(<-->|<->|-\.->|-->|==>|=>|->)(?:\|([^|]+)\|)?\s*/g
  const branches = []
  const nodeMap = new Map()
  const nodeOrder = []
  const allEdges = []

  function ensureNode(label) {
    const clean = label.replace(/^["'`]|["'`]$/g, '').trim()
    if (!clean)
      return null
    const key = clean.toLowerCase()
    if (nodeMap.has(key))
      return nodeMap.get(key)
    const node = {
      id: `N${nodeOrder.length + 1}`,
      label: clean,
    }
    nodeMap.set(key, node)
    nodeOrder.push(node)
    return node
  }

  for (const branch of rawBranches) {
    arrowPattern.lastIndex = 0
    const tokens = []
    let lastIndex = 0
    let match = arrowPattern.exec(branch)
    while (match) {
      const segment = branch.slice(lastIndex, match.index).trim()
      tokens.push({ kind: 'node', value: segment })
      tokens.push({
        kind: 'arrow',
        raw: match[1],
        inlineLabel: (match[2] || '').trim(),
      })
      lastIndex = match.index + match[0].length
      match = arrowPattern.exec(branch)
    }
    const tail = branch.slice(lastIndex).trim()
    if (tail)
      tokens.push({ kind: 'node', value: tail })

    const chainNodes = []
    const chainEdges = []

    for (let i = 0; i < tokens.length; i += 2) {
      const nodeToken = tokens[i]
      if (!nodeToken || nodeToken.kind !== 'node')
        continue

      // Support trailing ": label" on a node before an arrow, e.g. "API : HTTPS -> DB"
      let nodeText = nodeToken.value
      let trailingLabel = ''
      if (i + 1 < tokens.length) {
        const colonIdx = nodeText.indexOf(':')
        if (colonIdx > 0) {
          trailingLabel = nodeText.slice(colonIdx + 1).trim()
          nodeText = nodeText.slice(0, colonIdx).trim()
        }
      }

      const node = ensureNode(nodeText)
      if (!node)
        continue
      chainNodes.push(node)

      if (i > 0) {
        const prevArrow = tokens[i - 1]
        const prevEdge = chainEdges[chainEdges.length - 1]
        if (prevEdge) {
          prevEdge.to = node
        }
        else if (prevArrow && chainNodes.length >= 2) {
          chainEdges.push({
            from: chainNodes[chainNodes.length - 2],
            to: node,
            style: classifyArrow(prevArrow.raw),
            label: prevArrow.inlineLabel,
          })
        }
      }

      if (i + 1 < tokens.length && tokens[i + 1].kind === 'arrow') {
        const nextArrow = tokens[i + 1]
        chainEdges.push({
          from: node,
          to: null,
          style: classifyArrow(nextArrow.raw),
          label: nextArrow.inlineLabel || trailingLabel,
        })
      }
    }

    const completeEdges = chainEdges.filter(edge => edge.from && edge.to)
    if (completeEdges.length > 0) {
      branches.push({ nodes: chainNodes, edges: completeEdges })
      allEdges.push(...completeEdges)
    }
  }

  if (allEdges.length === 0)
    return null

  return {
    direction,
    preferredType,
    nodes: nodeOrder,
    edges: allEdges,
    branches,
  }
}

function classifyArrow(raw) {
  if (raw === '<->' || raw === '<-->')
    return 'both'
  if (raw === '-->' || raw === '-.->')
    return 'dashed'
  if (raw === '=>' || raw === '==>')
    return 'thick'
  return 'solid'
}

function escapeMermaidLabel(label) {
  return String(label).replace(/"/g, "'")
}

function compileToMermaidFlowchart(graph) {
  const lines = [`flowchart ${graph.direction}`]
  for (const node of graph.nodes) {
    lines.push(`  ${node.id}["${escapeMermaidLabel(node.label)}"]`)
  }
  for (const edge of graph.edges) {
    const cleanLabel = edge.label ? escapeMermaidLabel(edge.label) : ''
    let op = '-->'
    if (edge.style === 'dashed')
      op = '-.->'
    else if (edge.style === 'thick')
      op = '==>'
    else if (edge.style === 'both')
      op = '<-->'

    if (cleanLabel) {
      lines.push(`  ${edge.from.id} ${op}|"${cleanLabel}"| ${edge.to.id}`)
    }
    else {
      lines.push(`  ${edge.from.id} ${op} ${edge.to.id}`)
    }
  }
  return lines.join('\n')
}

function compileToMermaidSequence(graph) {
  const lines = ['sequenceDiagram']
  for (const node of graph.nodes) {
    lines.push(`  participant ${node.id} as ${escapeMermaidLabel(node.label)}`)
  }
  for (const edge of graph.edges) {
    const msg = edge.label || 'request'
    const op = edge.style === 'dashed' ? '-->>' : '->>'
    lines.push(`  ${edge.from.id}${op}${edge.to.id}: ${msg}`)
    if (edge.style === 'both') {
      lines.push(`  ${edge.to.id}-->>${edge.from.id}: response`)
    }
  }
  return lines.join('\n')
}

function renderHorizontalBranchAscii(branch) {
  const topParts = []
  const midParts = []
  const botParts = []

  for (let i = 0; i < branch.nodes.length; i += 1) {
    const node = branch.nodes[i]
    const innerWidth = displayWidth(node.label) + 2
    topParts.push(`┌${'─'.repeat(innerWidth)}┐`)
    midParts.push(`│ ${node.label} │`)
    botParts.push(`└${'─'.repeat(innerWidth)}┘`)

    if (i < branch.edges.length) {
      const edge = branch.edges[i]
      const label = edge.label || ''
      const labelW = displayWidth(label)
      const connWidth = Math.max(5, labelW + 4)
      const lineChar = edge.style === 'thick' ? '═' : edge.style === 'dashed' ? '╌' : '─'

      if (label) {
        topParts.push(` ${padCenterDisplay(label, connWidth)} `)
      }
      else {
        topParts.push(' '.repeat(connWidth + 2))
      }

      if (edge.style === 'both') {
        midParts.push(` ◀${lineChar.repeat(Math.max(1, connWidth - 2))}▶ `)
      }
      else {
        midParts.push(` ${lineChar.repeat(Math.max(1, connWidth - 1))}▶ `)
      }

      botParts.push(' '.repeat(connWidth + 2))
    }
  }

  return [topParts.join(''), midParts.join(''), botParts.join('')].join('\n')
}

function renderVerticalBranchAscii(branch) {
  const maxInner = Math.max(...branch.nodes.map(node => displayWidth(node.label) + 2))
  const totalBoxWidth = maxInner + 2
  const centerIdx = Math.floor(totalBoxWidth / 2)
  const lines = []

  for (let i = 0; i < branch.nodes.length; i += 1) {
    const node = branch.nodes[i]
    const innerWidth = displayWidth(node.label) + 2
    const boxWidth = innerWidth + 2
    const padLeft = ' '.repeat(Math.max(0, Math.floor((totalBoxWidth - boxWidth) / 2)))
    lines.push(`${padLeft}┌${'─'.repeat(innerWidth)}┐`)
    lines.push(`${padLeft}│ ${node.label} │`)

    if (i < branch.edges.length) {
      const edge = branch.edges[i]
      const stemInBox = Math.floor(innerWidth / 2)
      lines.push(`${padLeft}└${'─'.repeat(stemInBox)}┬${'─'.repeat(innerWidth - stemInBox - 1)}┘`)
      const stemPad = ' '.repeat(centerIdx)
      const stemChar = edge.style === 'dashed' ? '┆' : edge.style === 'thick' ? '║' : '│'
      lines.push(edge.label ? `${stemPad}${stemChar} ${edge.label}` : `${stemPad}${stemChar}`)
      lines.push(`${stemPad}▼`)
    }
    else {
      lines.push(`${padLeft}└${'─'.repeat(innerWidth)}┘`)
    }
  }

  return lines.join('\n')
}

function compileToUnicodeAscii(graph) {
  const vertical = graph.direction === 'TD' || graph.direction === 'TB'
  return graph.branches
    .map(branch => (vertical ? renderVerticalBranchAscii(branch) : renderHorizontalBranchAscii(branch)))
    .join('\n\n')
}

function wrapMarkdownFence(mermaidCode) {
  return `\`\`\`mermaid\n${mermaidCode}\n\`\`\``
}

function wrapAsciiFence(asciiCode) {
  return `\`\`\`text\n${asciiCode}\n\`\`\``
}

function extractMermaidFromAiResponse(rawResponse) {
  const text = typeof rawResponse === 'string'
    ? rawResponse
    : typeof rawResponse?.result === 'string'
      ? rawResponse.result
      : typeof rawResponse?.text === 'string'
        ? rawResponse.text
        : typeof rawResponse?.content === 'string'
          ? rawResponse.content
          : ''

  const cleaned = normalizeText(text)
  if (!cleaned)
    return ''

  const fenced = /```(?:mermaid)?\s*\n([\s\S]*?)```/i.exec(cleaned)
  if (fenced && fenced[1].trim()) {
    return fenced[1].trim()
  }
  return cleaned
}

function scoreTemplate(template, query) {
  const q = normalizeText(query).toLowerCase()
  if (!q)
    return 10
  if (template.id === q || template.category === q)
    return 100
  if (template.title.toLowerCase().includes(q))
    return 80
  if (template.keywords.some(kw => kw.toLowerCase() === q))
    return 75
  if (template.keywords.some(kw => kw.toLowerCase().includes(q)))
    return 60
  const haystack = `${template.title} ${template.subtitle} ${template.category} ${template.keywords.join(' ')}`.toLowerCase()
  const words = q.split(/\s+/).filter(Boolean)
  if (words.length > 0 && words.every(word => haystack.includes(word)))
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

function buildTemplateItem(featureId, template) {
  const firstAsciiLine = template.ascii.split('\n')[0] || ''
  return buildActionItem({
    id: `${featureId}-tpl-${template.id}`,
    featureId,
    title: `${template.title} [${template.category}]`,
    subtitle: `${template.subtitle} · ${firstAsciiLine.slice(0, 42)}`,
    actions: [
      { id: 'copy-mermaid', title: '复制 Mermaid 源码', payload: { text: template.mermaid } },
      { id: 'copy-markdown', title: '复制 Markdown 代码块', payload: { text: wrapMarkdownFence(template.mermaid) } },
      { id: 'copy-ascii', title: '复制 Unicode ASCII 简图', payload: { text: template.ascii } },
    ],
  })
}

function buildCompiledItems(featureId, graph, rawInput) {
  const flowchart = compileToMermaidFlowchart(graph)
  const sequence = compileToMermaidSequence(graph)
  const ascii = compileToUnicodeAscii(graph)
  const primaryMermaid = graph.preferredType === 'sequence' ? sequence : flowchart
  const primaryLabel = graph.preferredType === 'sequence' ? 'Mermaid Sequence' : `Mermaid Flowchart (${graph.direction})`
  const asciiPreview = ascii.split('\n')[1] || ascii.split('\n')[0] || ''

  return [
    buildActionItem({
      id: `${featureId}-compiled-mermaid`,
      featureId,
      title: `${primaryLabel} · ${graph.nodes.length} 节点 / ${graph.edges.length} 连线`,
      subtitle: rawInput.slice(0, 80),
      actions: [
        { id: 'copy-mermaid', title: '复制 Mermaid 源码', payload: { text: primaryMermaid } },
        { id: 'copy-markdown', title: '复制 Markdown 代码块', payload: { text: wrapMarkdownFence(primaryMermaid) } },
        { id: 'copy-ascii', title: '复制 Unicode ASCII 简图', payload: { text: ascii } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-compiled-ascii`,
      featureId,
      title: 'Unicode Box-Drawing ASCII 简图',
      subtitle: asciiPreview.slice(0, 88),
      actions: [
        { id: 'copy-ascii', title: '复制 Unicode ASCII', payload: { text: ascii } },
        { id: 'copy-ascii-md', title: '复制 ASCII Markdown 代码块', payload: { text: wrapAsciiFence(ascii) } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-compiled-markdown`,
      featureId,
      title: 'Markdown 代码块 (```mermaid)',
      subtitle: '直接粘贴到 GitHub / Notion / 飞书 / Obsidian',
      actions: [
        { id: 'copy-markdown', title: '复制 Markdown 代码块', payload: { text: wrapMarkdownFence(primaryMermaid) } },
        { id: 'copy-mermaid', title: '复制纯 Mermaid', payload: { text: primaryMermaid } },
      ],
    }),
    buildActionItem({
      id: `${featureId}-compiled-alt`,
      featureId,
      title: graph.preferredType === 'sequence' ? '转为 Mermaid Flowchart' : '转为 Mermaid Sequence 时序图',
      subtitle: graph.preferredType === 'sequence' ? '切换为 flowchart 拓扑视图' : '自动生成 participant 与消息箭头',
      actions: [
        {
          id: 'copy-mermaid',
          title: '复制替代 Mermaid',
          payload: { text: graph.preferredType === 'sequence' ? flowchart : sequence },
        },
        {
          id: 'copy-markdown',
          title: '复制 Markdown 代码块',
          payload: { text: wrapMarkdownFence(graph.preferredType === 'sequence' ? flowchart : sequence) },
        },
      ],
    }),
  ]
}

function buildAiActionItem(featureId, prompt, aiPerm) {
  const statusNote = aiPerm.granted
    ? '已授权 intelligence.basic · 回车触发 AI 生成 Mermaid'
    : `需要 intelligence.basic 权限 (${aiPerm.reason})`
  return buildActionItem({
    id: `${featureId}-ai-generate`,
    featureId,
    title: `AI 生成 Mermaid: ${prompt.slice(0, 60)}`,
    subtitle: statusNote,
    actions: [
      { id: 'ai-generate', title: 'AI 生成并展示 Mermaid', payload: { prompt, featureId } },
      { id: 'ai-generate-copy', title: 'AI 生成并复制 Mermaid', payload: { prompt, featureId, copy: true } },
    ],
  })
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
    getLogger()?.error?.('[touch-diagram-sketch] clipboard write failed')
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

async function generateDiagramWithAi({ prompt, featureId, copy }) {
  const cleanPrompt = normalizeText(prompt)
  if (!cleanPrompt) {
    return blocked('invalid-action', '缺少绘图描述')
  }

  const perm = await checkPermission('intelligence.basic')
  if (!perm.granted) {
    const message = perm.reason === 'permission-sdk-unavailable'
      ? '权限 SDK 不可用，已阻止调用 AI'
      : perm.reason === 'permission-unavailable'
        ? '权限系统不可用'
        : perm.reason === 'permission-check-failed'
          ? '权限校验失败，已阻止调用 AI'
          : '缺少 intelligence.basic 权限'
    return blocked(perm.reason, message)
  }

  const client = getIntelligence()
  const invokeChat = typeof client?.text?.chat === 'function'
    ? payload => client.text.chat(payload)
    : typeof client?.invoke === 'function'
      ? payload => client.invoke('text.chat', payload)
      : null

  if (!invokeChat) {
    return blocked('capability-unavailable', '当前运行时未提供 intelligence.basic 能力')
  }

  let mermaidCode = ''
  try {
    const response = await invokeChat({
      messages: [
        {
          role: 'system',
          content: 'You are a software architecture diagram generator. Return ONLY valid Mermaid diagram syntax without explanations.',
        },
        {
          role: 'user',
          content: cleanPrompt,
        },
      ],
    })
    mermaidCode = extractMermaidFromAiResponse(response)
  }
  catch (error) {
    getLogger()?.error?.('[touch-diagram-sketch] AI generation failed')
    const code = error?.code
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_DENIED') {
      return blocked('permission-denied', '缺少 intelligence.basic 权限')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_PERMISSION_UNAVAILABLE') {
      return blocked('permission-unavailable', '权限系统不可用')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_UNAVAILABLE') {
      return blocked('capability-unavailable', 'AI 能力不可用')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_CANCELLED') {
      return blocked('cancelled', 'AI 生成已取消', 'cancelled')
    }
    if (code === 'PLUGIN_HOST_CAPABILITY_TIMEOUT') {
      return blocked('timeout', 'AI 生成超时', 'failed')
    }
    return blocked('ai-generate-failed', 'AI 生成 Mermaid 失败', 'failed')
  }

  if (!mermaidCode) {
    return blocked('ai-empty-response', 'AI 未返回有效的 Mermaid 代码', 'failed')
  }

  const targetFeatureId = normalizeText(featureId) || FEATURE_ID
  const generation = ++triggerGeneration
  await publishItems([
    buildActionItem({
      id: `${targetFeatureId}-ai-result-mermaid`,
      featureId: targetFeatureId,
      title: `AI 生成结果 · ${mermaidCode.split('\n')[0].slice(0, 48)}`,
      subtitle: `共 ${mermaidCode.split('\n').length} 行 Mermaid 代码 · 点击复制`,
      actions: [
        { id: 'copy-mermaid', title: '复制 Mermaid 源码', payload: { text: mermaidCode } },
        { id: 'copy-markdown', title: '复制 Markdown 代码块', payload: { text: wrapMarkdownFence(mermaidCode) } },
      ],
    }),
    buildActionItem({
      id: `${targetFeatureId}-ai-result-markdown`,
      featureId: targetFeatureId,
      title: '复制 AI 结果为 Markdown 代码块',
      subtitle: '```mermaid ... ```',
      actions: [
        { id: 'copy-markdown', title: '复制 Markdown 代码块', payload: { text: wrapMarkdownFence(mermaidCode) } },
      ],
    }),
  ], generation)

  if (copy) {
    const clipResult = await writeClipboardText(mermaidCode)
    if (!clipResult.success) {
      return clipResult
    }
  }

  return {
    externalAction: true,
    success: true,
    status: 'completed',
    mermaid: mermaidCode,
    message: copy ? '已生成 Mermaid 并复制到剪贴板' : '已生成 Mermaid 图表',
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

async function buildResultItems(featureId, query) {
  const { prefix, rest } = stripCommandPrefix(getQueryText(query))

  // 1. Arrow shorthand compilation takes top priority when arrows are present
  if (rest && hasArrowShorthand(rest)) {
    const graph = parseArrowShorthand(rest)
    if (graph) {
      return buildCompiledItems(featureId, graph, rest)
    }
  }

  // 2. Explicit AI prompt (non-mutating permission check only at display time!)
  const aiPrompt = parseAiPrompt(rest)
  if (aiPrompt) {
    const aiPerm = await checkPermission('intelligence.basic')
    return [
      buildAiActionItem(featureId, aiPrompt.prompt, aiPerm),
      buildInfoItem({
        id: `${featureId}-ai-hint`,
        featureId,
        title: '本地离线速记也可即时生成',
        subtitle: '例如输入: Client -> Gateway : HTTPS -> Auth; Gateway -> DB',
      }),
    ]
  }

  // 3. Category filter from command prefix (e.g., "sequence", "erd", "gitgraph", "flowchart")
  const categoryAliasMap = {
    flowchart: 'flowchart',
    流程图: 'flowchart',
    sequence: 'sequence',
    时序图: 'sequence',
    er: 'er',
    erd: 'er',
    gitgraph: 'gitgraph',
    架构图: 'architecture',
  }
  const effectiveQuery = rest || categoryAliasMap[prefix] || ''

  const matchedTemplates = TEMPLATES
    .map((template, index) => ({ template, score: scoreTemplate(template, effectiveQuery), index }))
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.template)

  const items = []
  if (!rest && !effectiveQuery) {
    items.push(buildInfoItem({
      id: `${featureId}-guide`,
      featureId,
      title: '输入箭头速记或搜索 16 套架构模板',
      subtitle: '速记: Client -> API -> DB · 模板: oauth / sequence / erd / state / class / gitgraph · AI: ai 订单支付流程',
    }))
  }

  for (const template of matchedTemplates) {
    items.push(buildTemplateItem(featureId, template))
  }

  // Offer optional AI natural-language generation when user enters descriptive text
  if (rest && rest.length >= 6 && matchedTemplates.length <= 2) {
    const aiPerm = await checkPermission('intelligence.basic')
    items.unshift(buildAiActionItem(featureId, rest, aiPerm))
  }

  if (!items.length) {
    const aiPerm = await checkPermission('intelligence.basic')
    items.push(
      buildAiActionItem(featureId, rest || 'system architecture diagram', aiPerm),
      buildInfoItem({
        id: `${featureId}-empty`,
        featureId,
        title: '未找到匹配模板',
        subtitle: '试试输入 Client -> API -> DB，或搜索 flowchart / sequence / erd / state / class / gitgraph',
      }),
    )
  }

  return items
}

const pluginLifecycle = {
  async onInit() {
    destroyed = false
  },

  async onFeatureTriggered(featureId = FEATURE_ID, query = '') {
    destroyed = false
    const generation = ++triggerGeneration
    try {
      const items = await buildResultItems(featureId, query)
      return await publishItems(items, generation)
    }
    catch {
      getLogger()?.error?.('[touch-diagram-sketch] feature execution failed')
      try {
        return await publishItems([
          buildInfoItem({
            id: `${featureId}-error`,
            featureId,
            title: '架构简图工坊运行失败',
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

    if (selected.id === 'ai-generate' || selected.id === 'ai-generate-copy') {
      return generateDiagramWithAi({
        prompt: selected.payload?.prompt,
        featureId: selected.payload?.featureId || item.meta?.featureId,
        copy: Boolean(selected.payload?.copy || selected.id === 'ai-generate-copy'),
      })
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
