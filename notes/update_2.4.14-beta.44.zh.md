# Tuff v2.4.14-beta.44 更新说明

## 摘要

- 端侧语音的绑定释放提前到「禁用 / 用户已关闭」检查之前：模型库为空时不再留下指向已删除模型的 `audio.asr` 绑定，同一会话里再把通道打开，不会指回已经不在的权重。
- TuffEx 的 markdown 样式表不再被复制第二份：`stream-markdown` 改为声明样式依赖、借用 `markdown-view` 的样式表，单条样式从 51.3 KiB 降到 12.3 KiB，按需集合从 624.7 KiB 降到 585.8 KiB。
- 这一轮少掉的正是 39.0 KiB 重复规则，所以整包 CSS 上限抬到 618 KiB（实测 615.9 KiB），并把「这个上限是为哪一种浪费设的」记进 09-26 的说明。
- Cloudflare AI Gateway 报告订正两处事实错误：BYOK 其实有文档，`cf-aig-cache-key` 是替换默认键而不是新增维度。
- 本 beta 先把测试通道追平 `master` 再切版，beta.43 之后落在 `master` 上的改动这次才真正进入测试者的构建。

## 变更内容

- 绑定顺序：空的模型库原先在 `enabled === false` 与「用户已关闭」两个检查之后才返回，于是已禁用的 provider 保有一个指向刚被删除模型的绑定，同一会话里再把通道打开就会把 `audio.asr` 指向已经不在的权重。释放改到这些检查之前；偏好本身存在 `stored.providers` 上，不受释放影响，所以「已禁用」与「用户关闭」两个标记都照旧保留。
- TuffEx 样式依赖：`stream-markdown` 自身也渲染 `.markdown-body`，过去直接从 `markdown-view` 目录导入那份 vendored GitHub 样式表，per-entry CSS 拆分于是往 `stream-markdown/style.css` 里再输出一份完整拷贝（39.0 KiB 逐字节相同的规则）。现在规则只留在 `markdown-view` 的表里，通过声明的 style dependency 到达；两个根都带 `.tx-md`，作用域不变，`style-deps.json` 新增 `stream-markdown -> markdown-view`。
- 整包预算：这一轮三个组件各带一张样式表（`prism-glow` 4.9 KiB、`choice-card` 3.9 KiB、`fusion-surface` 0.7 KiB），减去上一条去掉的 39.0 KiB 拷贝，整包落在 615.9 KiB，上限相应抬到 618 KiB。
- 文档：Cloudflare AI Gateway 报告里，Custom Providers 页的 Best practices #6 明确推荐 BYOK，原报告「BYOK 支持未文档化」的说法不成立；`cf-aig-cache-key` 替换默认缓存键而不是增加维度；补上 dynamic-routing REST 页的名字；gateway-history 一行改为区分「仓库证据」与「只有控制台能确认的部分」。
- 通道：本 beta 先 `merge origin/master` 再切版，上面四条（`fc4ab9a0a`、`f775a3adc`、`8a707d179`、`139c92098`）随本次构建进入 beta 通道，`master` 不再跑在测试者构建之前。
