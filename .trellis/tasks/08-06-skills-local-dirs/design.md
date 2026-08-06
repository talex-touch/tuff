# 技能本地目录 · 设计

## 数据流

```
应用配置 skillsLocalDirs: string[] + skillsLocalDisabled: string[](id)
  → main: skill-local-sources.ts 扫描（每轮/每次设置页刷新）
    → 条目 { id: 'local:'+sha1(realpath).slice(12), name, description, path: realpathDir }
      → buildHomeInjection: imported ∪ enabled-local 的 metadata 清单
      → agent-context-source.readSkill(id):
           local: 前缀 → registry 查 path → 读 <path>/SKILL.md（或指定相对文件，v1 只 SKILL.md）
           校验：resolve 后必须以某注册条目的 realpath 为前缀
```

## 决策

- **不落库**：与 imported 的 contentRef 双轨并存，local 的真身永远是磁盘原文件——这就是「链接」语义
- 配置放 appSetting（renderer 管理、镜像到 main？）——不：目录注册表属主进程职权（扫描/读取都在 main），走 storage 模块的应用配置 JSON（main 侧 CRUDL 已有），设置 UI 经既有 storage 通道读写，不新增 transport 域
- id 用 realpath 哈希：目录改名=新技能（可接受）；同一目录多次注册去重
- 安全边界：readSkill 的包含性校验以**条目 realpath**为界（条目可为 symlink，跟随后以目标为界），拒绝 `..`、拒绝绝对路径参数——模型只能给 id，不能给 path
- 扫描性能：懒扫 + 100ms 内存缓存足够（每轮一次）；单目录 >50 条截断并 warn

## 回退

配置数组清空=完全回到今日行为；injection 合并处单点开关。
