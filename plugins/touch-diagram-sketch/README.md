# Touch Diagram Sketch (`touch-diagram-sketch`)

Mermaid & Unicode Box-Drawing ASCII Diagram Sketcher for Tuff CoreBox. Browse 16 production-ready architecture and engineering templates, compile inline arrow shorthand (`Client -> API -> DB`) into clean Mermaid and aligned Unicode ASCII box diagrams, and optionally generate Mermaid from natural language via permission-gated `intelligence.basic`.

## Features / 核心功能

- **16 Production Templates across 7 Diagram Types / 16 套覆盖 7 类图表的生产模板**
  - **Flowchart**: OAuth 2.0 / OIDC Login, CI/CD Canary Pipeline, Incident Triage & Rollback
  - **Sequence**: API Gateway Auth Flow, Async Payment Webhook, AI SSE Token Streaming
  - **ER Diagram**: Multi-Tenant SaaS Schema, E-Commerce Order Schema
  - **State Machine**: Order Fulfillment Lifecycle, Background Worker Job Queue
  - **Class Diagram**: Plugin Host & Facades, Repository + Cache Decorator
  - **Architecture**: Edge CDN + Microservices, Event-Driven Kafka + DLQ
  - **GitGraph**: Trunk-Based Release Flow, Production Hotfix Branching
- **Arrow Shorthand Compiler / 箭头速记实时编译器**
  - Supports chains (`Client -> API -> DB`), edge labels (`Client -> API : HTTPS -> DB` or `Client -->|JWT| API`), arrow styles (`->` solid, `-->` dashed, `=>` thick, `<->` bidirectional), multi-branch graphs separated by `;`, and direction/type hints (`td:`, `lr:`, `seq:`).
  - Produces **Mermaid Flowchart**, **Mermaid Sequence**, **Markdown Fenced Code Block**, and CJK-width-aware **Unicode Box-Drawing ASCII Diagrams** (`┌───┐ ──▶ ┌───┐`).
- **Optional Permission-Gated AI Sketch / 可选受控 AI 绘图**
  - Prefix with `ai ` / `gen ` / `生成 ` (e.g. `diagram ai checkout flow with stripe webhook and retry queue`).
  - Display time uses non-mutating `permission.check('intelligence.basic')` only. Execution fails closed if `intelligence.basic` is denied, missing, or unavailable.

## Usage Examples / 使用示例

| Input | Result |
| --- | --- |
| `diagram Client -> API -> DB` | Compiles to Mermaid `flowchart LR`, `sequenceDiagram`, Markdown block, and Unicode ASCII box diagram |
| `diagram Client -> Gateway : HTTPS -> Auth; Gateway -> Cache` | Multi-branch Mermaid + stacked Unicode ASCII diagram with edge labels |
| `diagram td: Trigger -> Build -> Test -> Deploy` | Top-down `flowchart TD` + vertical Unicode box flow |
| `diagram oauth` / `sequence` / `erd` / `gitgraph` | Filters curated templates; copy Mermaid, Markdown, or ASCII via primary/secondary actions |
| `diagram ai microservices checkout with payment retry` | Offers gated `intelligence.basic` Mermaid generation action |

## Permissions / 权限说明

- `clipboard.write` *(optional)*: Copies Mermaid source, Markdown fenced blocks, or Unicode ASCII diagrams. Fails closed when denied or unavailable.
- `intelligence.basic` *(optional)*: Generates Mermaid diagrams from natural language only on explicit item action execution. Fails closed when denied or unavailable.

## Verification

```bash
node -c index.js
node --test index.test.cjs
```
