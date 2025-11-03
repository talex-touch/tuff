# 主流启动器插件存储机制调研报告

本文档旨在通过分析 Raycast, uTools, HapiGo 等主流启动器产品的公开文档和社区信息，总结它们为插件开发者提供的存储机制，并为我们的项目提供决策参考。

---

## 1. Raycast

Raycast 以其精美的 UI 和强大的 API 设计著称，是 macOS 平台上的标杆产品。

### API 设计

Raycast 提供了一个名为 `LocalStorage` 的 API 模块，其接口设计非常现代化，类似 Web 的 `localStorage` API，但功能更强大。

-   **核心 API**:
    -   `LocalStorage.setItem(key: string, value: string | number | boolean | object): Promise<void>`
    -   `LocalStorage.getItem<T>(key: string): Promise<T | undefined>`
    -   `LocalStorage.removeItem(key: string): Promise<void>`
    -   `LocalStorage.clear(): Promise<void>`
    -   `LocalStorage.allItems<T>(): Promise<Record<string, T>>`
-   **特点**:
    -   **强类型支持**: 开发者可以使用泛型 `<T>` 来指定获取数据的类型。
    -   **异步操作**: 所有操作都是基于 `Promise` 的异步操作，避免阻塞主线程。
    -   **自动序列化**: 开发者可以直接存取 `object` 对象，无需手动 `JSON.stringify` 或 `JSON.parse`。
    -   **命名空间**: Raycast 自动为每个插件（官方称为 Extension）提供独立的存储空间，开发者无需关心命名冲突。

### 底层实现推测

-   **技术栈**: Raycast 是原生应用（Swift），但其插件运行在 Node.js 环境中。
-   **存储方式**: 极大概率使用 **文件系统** 进行存储。可能是将每个插件的数据序列化后存放在一个独立的 **JSON 文件**或 **SQLite 数据库**文件中。考虑到其 API 设计的灵活性和键值对的特性，**基于文件的键值数据库（如 LevelDB）** 或者 **一个大的 JSON 文件** 都是非常有可能的方案。SQLite 略显重型，但也能实现。无论哪种，其核心都是 **按插件隔离** + **统一的异步读写管理**。

---

## 2. uTools

uTools 是一个跨平台的插件化启动器，拥有庞大的开发者和用户社区。

### API 设计

uTools 的数据存储分为两类：应用内简单数据存储和数据库存储。

-   **简单数据存储 (`utools.dbStorage`)**:
    -   `utools.dbStorage.setItem(key, value)`
    -   `utools.dbStorage.getItem(key)`
    -   `utools.dbStorage.removeItem(key)`
    -   这是一个同步 API，用于存储少量、简单的配置数据。
-   **数据库存储 (`utools.db`)**:
    -   这是一个**完整的、内置的、基于文档的 NoSQL 数据库**，API 风格类似 `NeDB` 或 `MongoDB`。
    -   `utools.db.put({ _id: 'doc1', data: '...' })`
    -   `utools.db.get('doc1')`
    -   `utools.db.allDocs()`
    -   `utools.db.remove('doc1')`
    -   支持**文档版本号 `_rev`**，用于解决并发冲突。
-   **特点**:
    -   **方案分级**: 提供了从简单到复杂的两套方案，让开发者根据需求选择。
    -   **强大的数据库能力**: `utools.db` 不仅仅是存储，它是一个功能完备的文档数据库，这是其最大特色。
    -   **自动隔离**: uTools 同样为每个插件自动创建独立的数据库空间。

### 底层实现推测

-   **`dbStorage`**: 很可能是一个简单的 JSON 文件，通过同步读写实现。
-   **`utools.db`**: 官方文档明确指出其底层基于 **PouchDB**，这是一个用 JavaScript 实现的、兼容 CouchDB 协议的开源数据库。PouchDB 可以使用不同的后端，在 Electron 环境中通常使用 LevelDB 作为存储引擎。这解释了其强大的文档数据库功能和 `_rev` 机制。

---

## 3. HapiGo

HapiGo 同样是 macOS 平台的一款优秀启动器，注重效率和集成。

（*由于 HapiGo 的公开开发者文档相对较少，此部分主要基于通用设计模式推测*）

### API 设计推测

-   预计会提供一套类似于 `localStorage` 或 `electron-store` 的键值对存储 API。
-   `hapigo.storage.set(key, value)`
-   `hapigo.storage.get(key)`
-   可能会区分同步和异步 API，以应对不同场景。
-   同样，插件间的存储空间必然是隔离的。

### 底层实现推测

-   对于插件化应用，最成熟、最常见的方案就是 **“每个插件一个 JSON 文件”** 或使用 **`electron-store`** 这类成熟库。这种方案在简单性、可靠性和灵活性之间取得了最佳平衡。
-   如果追求更高性能和可靠性，可能会像 uTools 一样，内置一个轻量级的嵌入式数据库（如 LevelDB）。

---

## 总结与建议

| 产品 | 主要方案 | API 风格 | 底层技术推测 | 核心思想 |
| :--- | :--- | :--- | :--- | :--- |
| **Raycast** | 统一的键值存储 | `localStorage` (异步, Promise) | 文件系统 (JSON 或 LevelDB) | 简洁、现代、类型安全 |
| **uTools** | 简单存储 + 文档数据库 | `localStorage` (同步) + MongoDB-like | JSON 文件 + PouchDB (LevelDB) | **分级、强大、灵活** |
| **HapiGo** | 键值存储 (推测) | `localStorage` (推测) | JSON 文件或 `electron-store` | 简单、实用 |

**共同点**:
1.  **强制隔离**: 所有产品都为插件提供了独立的、沙箱化的存储空间。
2.  **封装 API**: 开发者面对的都是简洁的 API，无需关心底层是文件还是数据库。
3.  **键值对/文档模型**: 数据模型都偏向于灵活的键值对或文档形式，而非严格的关系型数据。

**给我们的启示**:

1.  **JSON 文件方案完全主流**: 我们的“一个插件一个 JSON 文件作为数据容器”的方案，与 Raycast 和 HapiGo 的可能实现非常吻合。这是一个被行业验证过的、成熟可靠的方案。
2.  **API 设计很重要**: Raycast 的异步、强类型 API 设计值得我们学习。这能提升开发体验和代码质量。
3.  **分级方案是亮点**: uTools 的分级方案（简单存储 + 数据库）非常出色，它满足了从简单到复杂的各种需求。

**最终建议**:

考虑到我们“尽量简单”的初衷，同时又要满足“一个插件多个配置”的灵活性，我建议我们采用 **“类 Raycast + uTools 简单存储”** 的混合模型：

1.  **底层实现**: 坚持使用 **JSON 文件** 作为存储介质，每个插件一个文件 (`plugin_xxx.json`)。这保证了简单性。
2.  **API 设计**: 设计一套类似 Raycast 的、基于 **Promise 的异步 API** (`storage.get`, `storage.set`)。这能避免 IO 操作阻塞进程，是更现代的做法。
3.  **未来扩展**: 我们可以预留接口，如果未来真的有插件需要更强大的数据库功能，再参考 uTools 的方式，引入一个嵌入式的文档数据库作为可选的高级功能。但当前，我们先从最简单、最核心的功能做起。

这个方案既采纳了竞品的优点（现代 API、文件容器），又保持了我们自己的技术简洁性，我认为是当前的最优解。