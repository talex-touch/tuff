# 构建完整性验证系统 PRD

## 一、产品背景

### 1.1 现状

当前构建系统已经实现了：
- 基于时间戳后6位的构建标识符生成
- 基于 SSH RSA 密钥指纹的官方签名生成
- Git commit hash 和 channel 信息记录

但是，**应用运行时没有验证构建完整性**，存在以下风险：
- 无法检测应用是否被篡改
- 无法验证是否为官方构建
- 无法在运行时提示用户应用可能不安全

### 1.2 核心目标

- 在应用启动时验证构建签名
- 检测应用是否被修改（通过验证签名）
- 区分官方构建和非官方构建
- 提供用户友好的安全提示机制

## 二、功能需求

### 2.1 启动时验证

**验证时机**：
- 应用启动时（main process 初始化阶段）
- 在窗口创建之前执行验证
- 避免阻塞用户，使用异步验证

**验证内容**：
1. **签名完整性验证**：
   - 读取 `signature.json` 中的 `officialSignature`
   - 如果存在签名，重新计算签名并与存储的签名对比
   - 验证签名载荷（version, buildTime, buildType, gitCommitHash）是否匹配

2. **SSH 密钥指纹验证**：
   - 在运行时获取当前环境的 SSH 密钥指纹
   - 与构建时的密钥指纹对比（通过签名验证间接实现）
   - 如果指纹不匹配，说明可能不是官方构建环境

3. **文件完整性验证**（可选）：
   - 验证关键文件是否被修改
   - 可以检查主进程入口文件、签名文件等的哈希值

### 2.2 验证结果处理

**验证状态**：
```typescript
enum BuildVerificationStatus {
  OFFICIAL = 'official',           // 官方构建，签名验证通过
  UNOFFICIAL = 'unofficial',       // 非官方构建（无签名或签名缺失）
  TAMPERED = 'tampered',           // 签名验证失败，可能被篡改
  UNKNOWN = 'unknown'              // 无法确定（开发模式或缺少信息）
}
```

**处理策略**：

1. **OFFICIAL（官方构建）**：
   - 正常启动，无需提示
   - 记录验证状态到日志

2. **UNOFFICIAL（非官方构建）**：
   - 正常启动（允许用户自行构建）
   - 可选：在设置页面显示提示信息
   - 记录到日志

3. **TAMPERED（可能被篡改）**：
   - **警告模式**：显示警告提示，但允许继续使用
   - **严格模式**：阻止启动，要求用户确认或重新安装
   - 记录详细日志（包括签名对比信息）

4. **UNKNOWN（未知状态）**：
   - 开发模式：正常启动
   - 生产模式：按 UNOFFICIAL 处理

### 2.3 用户提示机制

**提示方式**：

1. **通知栏提示**（轻量级）：
   - 仅在验证失败时显示
   - 可以关闭，记录用户选择

2. **设置页面标识**：
   - 在"关于"页面显示构建状态
   - 显示官方构建标识或警告图标
   - 显示构建信息（版本、channel、commit hash、构建标识符）

3. **启动时对话框**（严格模式）：
   - 仅在检测到篡改时显示
   - 要求用户确认是否继续使用
   - 提供重新安装的链接

### 2.4 日志记录

**记录内容**：
- 验证时间戳
- 验证结果（状态、签名匹配情况）
- 构建信息（版本、channel、commit hash）
- 环境信息（是否有 SSH 密钥、操作系统等）
- 警告/错误详情

**日志级别**：
- INFO: 官方构建验证通过
- WARN: 非官方构建或验证失败
- ERROR: 严重验证错误（签名验证失败）

## 三、技术实现

### 3.1 验证模块设计

**文件位置**：`apps/core-app/src/main/modules/build-verification/`

**模块结构**：
```typescript
class BuildVerificationModule extends BaseModule {
  private signaturePath: string
  private buildInfo: BuildInfo | null = null
  
  onInit(ctx: ModuleInitContext): Promise<void> {
    // 初始化验证路径
    // 读取构建信息
  }
  
  async verify(): Promise<BuildVerificationResult> {
    // 执行验证逻辑
  }
  
  private verifySignature(): boolean {
    // 验证签名完整性
  }
  
  private verifyBuildInfo(): boolean {
    // 验证构建信息完整性
  }
}
```

### 3.2 签名验证实现

**验证流程**：
```typescript
async function verifyBuildSignature(buildInfo: BuildInfo): Promise<boolean> {
  // 1. 检查是否有官方签名
  if (!buildInfo.officialSignature || !buildInfo.hasOfficialKey) {
    return false // 非官方构建
  }
  
  // 2. 获取当前环境的 SSH 密钥指纹
  const currentFingerprint = getSSHKeyFingerprint()
  if (!currentFingerprint) {
    console.warn('Cannot verify: no SSH key found')
    return false
  }
  
  // 3. 重新计算签名
  const payload = JSON.stringify({
    version: buildInfo.version,
    buildTime: buildInfo.buildTime,
    buildType: buildInfo.buildType,
    gitCommitHash: buildInfo.gitCommitHash
  })
  
  const hmac = crypto.createHmac('sha256', currentFingerprint)
  hmac.update(payload)
  const expectedSignature = hmac.digest('hex')
  
  // 4. 对比签名
  return expectedSignature === buildInfo.officialSignature
}
```

**注意**：
- 运行时的 SSH 密钥指纹可能与构建时不同（CI/CD 环境）
- 因此需要支持两种验证模式：
  - **严格模式**：必须匹配构建时的密钥指纹
  - **宽松模式**：只要有有效的签名即可（允许不同环境的官方构建）

### 3.3 验证触发时机

**推荐时机**：
1. **模块初始化阶段**（推荐）：
   - 在 `BuildVerificationModule.onInit()` 中执行
   - 在窗口创建之前验证
   - 异步执行，不阻塞启动

2. **应用就绪时**：
   - 在 `app.whenReady()` 之后执行
   - 可以在窗口显示后再验证

3. **延迟验证**：
   - 应用启动后 1-2 秒执行验证
   - 避免影响启动速度

### 3.4 配置选项

**环境变量**：
- `BUILD_VERIFICATION_MODE`: `strict` | `warn` | `off`
  - `strict`: 严格模式，篡改检测时阻止启动
  - `warn`: 警告模式，仅提示用户
  - `off`: 关闭验证（开发模式）

**应用配置**：
- 在应用设置中提供验证开关（高级选项）
- 允许用户选择是否启用验证

## 四、实施计划

### 4.1 Phase 1: 基础验证模块
- [ ] 创建 `BuildVerificationModule` 模块
- [ ] 实现签名读取和验证逻辑
- [ ] 集成 SSH 密钥指纹获取（复用构建时的逻辑）
- [ ] 实现验证结果枚举和状态管理

**工期**: 2-3 天

### 4.2 Phase 2: 验证结果处理
- [ ] 实现不同验证状态的处理逻辑
- [ ] 实现警告模式（提示但允许继续）
- [ ] 实现严格模式（阻止启动）
- [ ] 添加日志记录

**工期**: 1-2 天

### 4.3 Phase 3: 用户界面
- [ ] 在设置页面添加构建状态显示
- [ ] 实现通知栏提示（验证失败时）
- [ ] 实现启动时对话框（严格模式）
- [ ] 添加构建信息详情展示

**工期**: 2-3 天

### 4.4 Phase 4: 测试和优化
- [ ] 测试不同场景（官方构建、非官方构建、篡改场景）
- [ ] 测试不同环境（开发、CI/CD、生产）
- [ ] 性能优化（验证不应影响启动速度）
- [ ] 文档完善

**工期**: 1-2 天

**总工期**: 6-10 天

## 五、验收标准

### 5.1 功能验收
- [ ] 官方构建可以正常启动，验证通过
- [ ] 非官方构建可以正常启动，显示提示信息
- [ ] 篡改检测（修改签名后）可以正确识别并警告/阻止
- [ ] 开发模式下验证不影响开发流程

### 5.2 性能验收
- [ ] 验证过程不超过 500ms（异步执行）
- [ ] 不影响应用启动速度（< 100ms 额外开销）
- [ ] 验证失败时的提示不影响用户体验

### 5.3 安全验收
- [ ] 签名验证逻辑正确，无法绕过
- [ ] 警告信息准确，不会误报
- [ ] 严格模式下可以有效阻止被篡改的应用

## 六、风险与缓解

### 6.1 风险

1. **CI/CD 环境 SSH 密钥不同**：
   - **风险**：构建时和运行时密钥不同导致验证失败
   - **缓解**：支持宽松模式，或使用专用构建密钥

2. **性能影响**：
   - **风险**：验证逻辑影响启动速度
   - **缓解**：异步执行，缓存验证结果

3. **误报**：
   - **风险**：正常更新被误判为篡改
   - **缓解**：区分更新场景，只验证关键文件

### 6.2 缓解措施

- 提供验证开关，允许用户关闭（高级选项）
- 记录详细日志，便于排查问题
- 支持多种验证模式，适应不同场景

## 七、后续优化

1. **远程验证**：将验证结果上报到服务器，支持远程验证
2. **增量验证**：只验证修改过的文件，提高性能
3. **自动更新验证**：区分应用更新和恶意篡改
4. **多签名支持**：支持多个构建密钥，提高灵活性

