# 最终实施计划：在现有数据库上实现高级搜索

## 1. 核心原则与约束

根据最终决策，本项目须在以下核心约束下完成：

1.  **数据库结构不变**: 严格禁止修改现有数据表（`files`, `keywordMappings` 等）的结构。不准新增、修改或删除任何字段。
2.  **废弃旧搜索逻辑**: 彻底替换 `app-provider.ts` 中的 `onSearch` 方法，不保留任何旧的查询逻辑。
3.  **应用层负责“精加工”**: 数据库（`keywordMappings`）仅用于快速召回匹配项的 `itemId`。所有高级功能，如来源（source）判断、命中区间（indices）计算，均在应用层内存中完成。
4.  **采用 Node UDF**: 编辑距离（Levenshtein）模糊搜索功能将通过在 Node.js 中注册 UDF (User-Defined Function) 到 SQLite 实例来实现。

## 2. 架构设计：混合查询模型

我们将采用一个两阶段的混合查询模型：

-   **主路径 (精确查询)**: 利用 `keywordMappings` 表进行快速、基于关键词的初步筛选。
-   **兜底路径 (模糊查询)**: 当精确查询无结果时，利用注册的 Node UDF 对 `files` 表的原文进行全文模糊匹配。

---

## 3. 实施步骤

### 步骤 1: 搭建 UDF 环境

**目标**: 让 Drizzle/SQLite 具备执行我们自定义 Node 函数的能力。

-   **文件**: `apps/core-app/src/main/main.ts` (或数据库初始化的地方)
-   **操作**:
    1.  引入一个 npm 包来实现 Levenshtein 距离计算，例如 `fast-levenshtein`。
    2.  在创建数据库连接后，调用 `db.function('levenshtein', (a, b) => levenshtein.get(a, b))` 来注册一个名为 `levenshtein` 的自定义SQL函数。
-   **交付物**: 成功注册 UDF 的代码。

### 步骤 2: 重写 `onSearch` 核心逻辑

**目标**: 替换 `onSearch` 方法，实现新的两阶段查询模型。

-   **文件**: `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
-   **操作**:
    1.  **清空 `onSearch` 方法**。
    2.  **实现精确查询路径**:
        -   将用户输入拆分为 `terms` (e.g., "vsc code" -> `['vsc', 'code']`)。
        -   对每个 `term`，并发地执行 `db.select().from(keywordMappings).where(like(keywordMappings.keyword, `%${term}%`))`，获取匹配的 `itemId` 集合。
        -   在应用层，对所有 `term` 返回的 `itemId` 集合**取交集**，得到最终的候选 `itemId` 列表。
        -   如果交集为空，则**直接进入步骤 3 (模糊查询路径)**。
        -   如果交集不为空，根据 `itemId` 从 `files` 表中获取完整的应用信息。
    3.  **实现模糊查询路径 (兜底)**:
        -   当精确查询无结果时，执行 `db.select().from(files).where(sql`levenshtein(lower(files.name), lower(${query})) <= 2`)`。
        -   这将使用我们在步骤 1 中注册的 UDF 进行全表模糊匹配。
    4.  **调用“精加工”服务**:
        -   将上述两条路径获得的结果（`file` 对象列表和匹配的关键词/查询词），传递给一个新的函数，例如 `processResults(files, query)`。
-   **交付物**: 结构清晰、包含两条查询路径的 `onSearch` 方法。

### 步骤 3: 实现“精加工”服务 (应用层核心)

**目标**: 在内存中为每个搜索结果动态计算 `source` 和 `indices`。

-   **文件**: `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts` (或新建一个 `processing-service.ts`)
-   **操作**:
    1.  创建一个 `processResults` 函数，它接收 `file` 对象和用户查询作为输入。
    2.  **来源 (Source) 推断**:
        -   对于精确匹配的结果，根据其匹配上的 `keyword`，与 `file.name` 进行比对。
        -   在内存中重新生成该 `name` 的首字母、拼音等。
        -   判断 `keyword` 属于哪个类别（`initials`, `pinyin`, `alias`, `name`），从而确定 `source`。
    3.  **区间 (Indices) 计算**:
        -   复用并增强现有的 `calculateHighlights` 函数。
        -   如果 `source` 是 `initials`，则在 `file.name` 中查找首字母位置来计算区间。
        -   如果 `source` 是 `name` 或 `alias`，则在 `file.name` 中查找子串位置。
        -   对于模糊查询的结果，使用**滑窗算法**在 `file.name` 上找到与用户查询最相似的子串，并计算其区间。
    4.  **结果组装**: 将计算出的 `source`, `indices` 等信息，组装成 PRD 要求的最终 `TuffItem` 格式。
-   **交付物**: 功能完备的 `processResults` 函数。

### 步骤 4: 排序与返回

**目标**: 对所有结果进行统一排序并返回。

-   **文件**: `apps/core-app/src/main/modules/box-tool/addon/apps/app-provider.ts`
-   **操作**:
    -   在 `onSearch` 的末尾，对 `processResults` 返回的所有 `TuffItem` 进行排序。
    -   排序规则：精确匹配 > 首字母匹配 > 别名/标签匹配 > 模糊匹配。
-   **交付物**: 具备最终排序逻辑的 `onSearch` 方法。

## 4. 可视化流程

```mermaid
graph TD
    A[用户输入查询] --> B{拆分关键词 (Terms)};
    
    subgraph "精确查询 (主路径)"
        B --> C[并发查询 keywordMappings];
        C --> D{对 itemId 取交集};
        D -- "有结果" --> E[获取 File 详情];
    end
    
    subgraph "模糊查询 (兜底路径)"
        D -- "无结果" --> F[使用 Node UDF 全文模糊搜索 files 表];
        F --> G[获取 File 详情];
    end

    subgraph "应用层精加工"
        E --> H[Process Results];
        G --> H;
        H --> I[反向推断 Source];
        H --> J[计算 Indices (高亮/滑窗)];
        I & J --> K[组装 TuffItem];
    end

    K --> L{排序};
    L --> M[返回最终结果];

    style M fill:#ccf,stroke:#333,stroke-width:2px