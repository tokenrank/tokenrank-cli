# 更新日志

## 2026-07-16

- 发布 v0.2.0 统计协议：所有事件按 UTC 日历日归档，精确 timestamp 优先于无时区 calendar date，全球榜单不再混用设备本地日界线。
- 新增 `accountingVersion: 2` 的 cutover/high-water 同步：首次从当前 UTC 日期原子切换，小时增量只发送非下降变化行，无变化不请求；日志缺失、轮转或回退不会误删、也不会调低历史总量。
- 完整快照使用持久化随机 `snapshotId`、0-based 批次、稳定 `batchHash` 和 `committed: true` 落盘门槛；pending state 完整保存规范化 entries 与批次边界，中途失败后原样重放。incremental 发送前新增可校验 WAL，全部批次 ACK 后才清理，日志轮转不会丢掉未确认 high-water。
- 新增 GET webhook 匿名 account identity 握手：同账号 Token 轮换时强制 full reconciliation 并保留 cutover/high-water；若服务端已有 active snapshot，只在本地 pending 的 account/device/snapshot ID/cutover 精确匹配时跨 endpoint 重放，再在同一命令继续新 candidate。不同账号会清空本机旧账号 state 后 fresh cutover。
- 本地 aggregate state 丢失或损坏时可根据服务端 `CUTOVER_DATE_CONFLICT` 权威日期自动重扫自愈；严格校验成功、cutover 与 active-snapshot 响应 envelope，成功 ACK 的 `uploaded` 必须精确匹配本批条目数，畸形 2xx 不落盘。超长 model 会保留可读前缀并追加稳定 hash，满足服务端 120 字符 schema 且避免截断碰撞。过滤或文件上传必须先完成当前连接的默认 full sync。
- 安装顺序调整为 connect、initial upload、service install；手动上传遇活跃锁会以脱敏错误非零退出，scheduled run 仍安全跳过。锁新增 owner nonce、活 PID 保护与原子 stale quarantine；`status --json` 只有成功记录绑定当前 endpoint/account、state 合法且无失败或未完成尝试时才返回 `HEALTHY`。
- macOS、Linux 与 Windows 统一改为每小时设备稳定错峰，保留 RunAtLoad、persistent timer 与 LogonTrigger 补跑；路径确定排序枚举来源文件、predicate 前置，100,000 文件安全上限及任何 stateful 扫描降级均 fail closed。direct、HTTP proxy、HTTPS CONNECT 的每次尝试增加覆盖响应 body 的绝对 deadline。
- 主 Agent 和本地可观测的 subagent 模型调用继续汇入同一工具总量，不新增 subagent 明细或任何会话内容字段。
- 为 `preview`、`doctor`、本地扫描、用量文件读取、分批上传、状态检查与后台服务操作增加 stderr 实时进度，持续报告处理阶段、来源、文件、记录、批次和耗时；JSON/stdout 保持纯净，并支持 `TOKENRANK_NO_PROGRESS=1` 与静态进度模式。
- 参考 Gum 的轻量 CLI 信息层级重做全部彩色终端输出：新增 TokenRank 品牌卡片、工具网格、状态/诊断面板、Token 预览表格和克制的扫描/上传反馈。
- 保留信号绿、警示橙、象牙白与灰绿品牌色，移除满宽绿色条、固定 50 列记分牌、赛事口号堆叠和单批次无意义进度条；宽度上限调整为 78 列并补齐 40 列窄屏回归。
- `NO_COLOR`、非 TTY、JSON 与后台任务仍保持稳定无装饰输出，视觉层继续使用 Node.js 标准库且不新增运行时依赖。
- 将 JSONL 来源改为有单行上限的逐行流式解析，并把日期过滤、精确去重和日维度聚合合并为单次流水线，避免长期 Codex 历史触发 `Invalid string length`、堆内存耗尽或大数组展开溢出。
- 对异常超长、损坏、CRLF 和无末尾换行的 JSONL 记录进行隔离处理；增加 Token 安全整数校验，避免上传失真的聚合值。
- macOS/Linux 与 Windows 安装器统一按 `connect → initial upload → service install` 执行；首次上传失败时不安装后台服务，避免把未验证连接留给计划任务。

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
