# Tuff v2.4.14-beta.23 更新说明

## 摘要

- 发布清单的回滚前驱现在只从已发布的同通道版本中选择。
- 失败或尚未发布但已存在 Git tag 的候选版本不再污染下一版本的回滚元数据。
- 发布门禁继续要求回滚前驱、GitHub Release、Nexus metadata 与下载矩阵保持一致。

## 变更内容

- 发布 workflow 从 GitHub 已发布 Release 列表生成回滚候选标签，而非从全部 git tags 推断。
- 回滚版本解析器新增 `--tags-file` 输入，并在文件不可读取时 fail-closed。
- beta.22 的 Linux musl runtime closure 修复仍包含在本候选版本中；本版用于重新生成可信发布清单。
