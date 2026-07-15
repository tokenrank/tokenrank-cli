# TokenRank CLI 项目约定

- 项目文档、计划、报告、README 和 CHANGELOG 默认使用中文；命令、API、代码标识符保留英文。
- CLI 必须保持独立：不得导入 TokenRank Web 仓库源码或依赖 Next.js、数据库、认证模块。
- 运行时优先保持零第三方依赖。新增依赖前先确认 Node 标准库不能满足需求。
- 隐私边界是硬约束：不得采集或上传 prompt、代码、聊天正文、文件名或文件内容。
- 新增工具 key、payload 字段或 Token 统计口径前，先确认 TokenRank Web 上传 API 已兼容。
- 修改调度、安装或来源解析后，必须运行 `pnpm check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`。
- Windows 后台任务必须隐藏、非交互，并保留错过计划时间后的登录补跑；macOS/Linux 同样要保留 persistent recovery。
