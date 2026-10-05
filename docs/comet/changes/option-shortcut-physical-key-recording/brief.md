# Outcome

修复应用详情「唤起方式」及共用快捷键录制器中的 macOS Option 组合键错录：Option＋1 不得录成 Option＋¡，Option 产生的特殊字符或 Dead key 不得替代用户按下的主键。

# Scope

- `FlatKeyInput` 的主键归一化，覆盖应用详情、插件详情和设置中复用该组件的入口。
- 对可识别的物理 `KeyboardEvent.code` 优先产生既有 Electron accelerator 主键；没有有效 code 时保留现有 key fallback。
- 保留平台修饰键命名、数字小键盘、特殊功能键、清除和捕获焦点行为；补必要回归与快捷键工程契约。

# Non-goals

- 不改默认快捷键、冲突提示、系统注册策略、应用启动行为和组件外观。
- 不根据 `¡` 等字符猜测键盘布局或批量迁移既有绑定；不修改用户真实快捷键配置。
- 不动运行中的开发实例，不提交、合并、推送或发布；前一个索引修复保持独立变更，不混入本次范围。

# Acceptance examples

- macOS 的 Digit1 即使 key 为 ¡，也录制并显示 Option+1；Option＋Shift＋数字键保留实际数字主键与 Shift 修饰，不保存输入法产生的字符。
- macOS 的字母与标点物理键在 Option 特殊字符或 Dead key 情况下仍生成对应既有主键，例如 KeyE → Option+E、Slash → Option+Slash；不生成 Option+Dead 或 Option+特殊字符。
- 无有效 code 的既有 fallback、各平台修饰键名称、修饰键单独按下、数字小键盘与特殊功能键，以及 Escape/Backspace/清除按钮和失焦恢复全局快捷键的原行为不变；真实浏览器中的共用录制组件能够捕获并回写正确字符串。

# Constraints and invariants

- 在 `/tmp/tuff-option-shortcut-1003` 的独立 Native worktree 实现，不写源工作区；该工作区与索引修复分开，遵守已有活跃变更的隔离要求。
- 修改现有局部归一化函数，不引入新的快捷键格式、共享抽象、兼容别名或按字符特殊处理。
- 取证：当前 normalizer 对单字符直接 `event.key.toUpperCase()`，对 Dead key 保留 Dead；AppDetail 将组件的字符串原样发给 update-shortcut，因此错误产生在共用录制层。

# Verification expectations

- 沿用 `FlatKeyInput.test.ts` 的组件测试模式，测试真实事件字段组合产生的 model 更新和既有捕获边界；测试由 Tester 编写。
- 在真实 ego-browser 页面中验证当前源码的录制组件，对 Option＋1、Option＋Shift＋1、Dead key 与清除/失焦取得可见结果；不导航或改动用户正在使用的标签页，不回写真实绑定。
- Native Runtime 执行定向检查，并由新的只读 Verifier 覆盖全部验收项。
