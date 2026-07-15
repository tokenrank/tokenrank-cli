# 更新日志

## 2026-07-15

- 将项目公开迁移到 `tokenrank/tokenrank-cli`，采用 MIT License 开源，并更新安装器、文档和 package metadata 中的仓库地址。
- 从 TokenRank Web 主仓库拆出独立 CLI 项目，保留 collector 源码历史，并建立独立版本、测试、CI 与 GitHub Release 流程。
- 将 macOS/Linux 与 Windows 安装逻辑迁入 CLI 项目；TokenRank Web 安装入口只负责注入用户 webhook 并调用最新 CLI release。
- 明确 CLI 与 Web 之间的上传 API 契约，新增工具 key 或修改 payload 时需先完成服务端兼容。

## 2026-07-13

- 新增完整中英文支持：默认跟随系统语言，并支持 `--lang en|zh|auto` 与 `TOKENRANK_LANG` 显式覆盖。
- 修复 Windows 安装器未注册命令路径的问题；安装目录现在幂等写入用户 PATH，并立即加入当前 PowerShell 会话。

## 2026-07-12

- 将 Windows 自动同步迁移为单个隐藏 Task Scheduler XML 任务，使用非交互 PowerShell，定时同步不再弹出控制台窗口。
- 新增 00:00/12:00 同步边界状态、登录触发补跑、失败重试和进程锁。
- 按 Scoreboard Panels 视觉重做 CLI，并补齐宽窄终端、非 TTY、无色和后台模式。
- 修复 Windows Task Scheduler XML 编码，改为带 BOM 的 UTF-16LE，并新增字节级回归测试。
- 新增 `cursor`、`github-copilot`、`continue`，以及工具专属来源、provider event 指纹和来源优先级去重。
- 新增 `tokenrank status` 与 `tokenrank doctor`。
- 修复 JSONL 事件 ID/发生时间跨记录继承、过滤上传推进完整计划边界、服务注册状态误报等问题。

## 2026-06-28

- 加固 payload 校验、500 行分批与代理上传。
- SQLite 读取优先使用 Node 内置 `node:sqlite`，不可用时回退外部 `sqlite3`。

## 2026-06-23

- 发布首个可用 collector CLI，支持连接私人 webhook、预览、手动上传与本地聚合。
