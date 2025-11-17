# 构建信息与签名系统 PRD

## 一、产品背景

### 1.1 现状

当前构建系统存在以下问题：

- **文件分散**: `signature.json` 和 `distinformation.json` 两个文件信息重复且不统一
- **构建标识不明确**: 没有基于时间戳的唯一构建标识符
- **缺少官方构建验证**: 无法识别应用是否被篡改或是否为官方构建
- **签名逻辑缓存**: `signature.json` 仅在首次不存在时生成，后续构建不更新

### 1.2 核心目标

- 统一构建信息存储，合并两个文件为单一来源
- 基于时间戳后6位生成唯一构建标识符
- 使用加密密钥（`TUFF_ENCRYPTION_KEY`）生成官方构建签名
- 支持构建完整性验证，检测应用是否被修改

## 二、功能需求

### 2.1 构建标识符生成

**规则**:
- 使用当前构建时间戳（毫秒）
- 提取时间戳后6位: `timestamp % 1000000`
- 对后6位进行哈希处理（使用 MD5 或 SHA256）
- 取哈希结果前6-8个字母数字字符作为构建标识符

**示例**:
```
时间戳: 1762133583600
后6位: 583600
哈希: MD5("583600") → "a3f5d2b1..."
标识符: "a3f5d2b" (前7个字符)
```

### 2.2 官方构建签名

**基于环境变量 `TUFF_ENCRYPTION_KEY`**:

1. **如果密钥存在**:
   - 使用 HMAC-SHA256 算法
   - 签名内容包含: `version`, `buildTime`, `buildType`
   - 生成签名哈希并存储
   - 标记为官方构建 (`hasOfficialKey: true`)

2. **如果密钥不存在**:
   - 跳过签名生成
   - 设置 `officialSignature: null/undefined`
   - 标记为非官方构建 (`hasOfficialKey: false`)
   - 验证时默认认为非官方构建

**签名格式**:
```typescript
// 签名内容
const payload = {
  version: string,
  buildTime: number,
  buildType: string
}
const signature = HMAC_SHA256(JSON.stringify(payload), TUFF_ENCRYPTION_KEY)
```

### 2.3 统一构建信息文件

**新的 `signature.json` 结构**:
```json
{
  "version": "2.3.0",
  "buildTime": 1762133583600,
  "buildIdentifier": "a3f5d2b",
  "buildType": "release",
  "isSnapshot": false,
  "isBeta": false,
  "isRelease": true,
  "officialSignature": "a1b2c3d4e5f6...",  // HMAC-SHA256 签名（可选）
  "hasOfficialKey": true  // 是否使用了加密密钥
}
```

**替换策略**:
- 移除 `distinformation.json` 的生成逻辑
- 所有构建信息统一存储在 `signature.json`
- 每次构建都重新生成（不缓存）

### 2.4 验证逻辑

**官方构建验证**:
```typescript
function isOfficialBuild(buildInfo: BuildInfo): boolean {
  // 1. 检查是否有签名密钥可用
  if (!buildInfo.hasOfficialKey) {
    return false  // 默认非官方
  }
  
  // 2. 如果签名存在，验证签名
  if (buildInfo.officialSignature) {
    // 重新计算签名并对比
    const expectedSignature = calculateSignature(buildInfo)
    return expectedSignature === buildInfo.officialSignature
  }
  
  return false
}
```

## 三、技术实现

### 3.1 修改文件清单

1. **`apps/core-app/generator-information.ts`**
   - 移除 `genSignature()` 缓存逻辑
   - 实现构建标识符生成函数
   - 实现官方签名生成函数（基于 `TUFF_ENCRYPTION_KEY`）
   - 统一信息生成到 `signature.json`
   - 移除 `distinformation.json` 生成逻辑

2. **`apps/core-app/src/renderer/src/utils/build-info.ts`**
   - 更新 `BuildInfo` 接口，添加新字段:
     - `buildIdentifier: string`
     - `officialSignature?: string`
     - `hasOfficialKey: boolean`
   - 添加辅助函数:
     - `getBuildIdentifier(): string`
     - `isOfficialBuild(): boolean`

3. **清理工作**
   - 移除对 `distinformation.json` 的引用
   - 确保所有读取构建信息的地方使用 `signature.json`

### 3.2 构建流程

**每次构建时**:
1. 获取当前时间戳
2. 生成构建标识符（时间戳后6位哈希）
3. 读取 `package.json` 获取版本号
4. 从环境变量读取 `BUILD_TYPE` 和 `TUFF_ENCRYPTION_KEY`
5. 如果存在密钥，生成官方签名
6. 生成统一的 `signature.json` 文件
7. 在构建过程中注入构建信息到虚拟模块

### 3.3 环境变量说明

- **`BUILD_TYPE`**: 构建类型 (`snapshot` | `beta` | `release`)
- **`TUFF_ENCRYPTION_KEY`**: 官方构建加密密钥（可选）
  - 存在时: 生成官方签名，标记为官方构建
  - 不存在时: 跳过签名生成，标记为非官方构建

## 四、验证与测试

### 4.1 功能验证

- [ ] 每次构建生成新的构建标识符
- [ ] 构建标识符基于时间戳后6位正确生成
- [ ] 存在 `TUFF_ENCRYPTION_KEY` 时生成官方签名
- [ ] 不存在 `TUFF_ENCRYPTION_KEY` 时标记为非官方构建
- [ ] `signature.json` 包含所有必要信息
- [ ] `distinformation.json` 不再生成
- [ ] 应用能正确读取并使用构建信息

### 4.2 安全性验证

- [ ] 签名算法使用 HMAC-SHA256，密钥不泄露
- [ ] 签名内容包含关键构建信息，可验证完整性
- [ ] 缺少密钥时默认判定为非官方，安全保守

## 五、注意事项

1. **向后兼容**: 确保现有读取构建信息的代码能正常工作
2. **开发模式**: 开发模式下可生成临时构建信息，不强制要求密钥
3. **CI/CD 集成**: 在 CI/CD 中设置 `TUFF_ENCRYPTION_KEY` 环境变量用于官方构建
4. **发布流程**: Release 构建必须提供加密密钥以生成官方签名

## 六、后续优化

1. 在应用启动时验证构建签名，检测应用是否被修改
2. 提供构建信息展示界面，显示构建标识符和官方状态
3. 支持签名验证 API，允许远程验证构建完整性

