# TokenRank CLI

TokenRank CLI 是 [TokenRank](https://tokenrank.org) 的独立本地采集器。它扫描受支持 AI 工具的本地用量记录，只生成按日期、工具、模型聚合的 Token 数据，再上传到用户自己的 TokenRank webhook。

本仓库独立维护 CLI 源码、安装器、跨平台后台任务、测试、版本与 release。TokenRank Web 主仓库只维护登录、webhook、上传 API、排行榜和带用户 token 的 onboarding。

## 安装

推荐使用 TokenRank 网站提供的稳定入口：

macOS / Linux：

```bash
curl -fsSL "https://tokenrank.org/install.sh" | bash
```

Windows PowerShell：

```powershell
irm "https://tokenrank.org/install.ps1" | iex
```

也可以直接使用本仓库最新 release 的安装器：

```bash
curl -fsSL "https://github.com/tokenrank/tokenrank-cli/releases/latest/download/install.sh" | bash
```

```powershell
irm "https://github.com/tokenrank/tokenrank-cli/releases/latest/download/install.ps1" | iex
```

CLI 需要 Node.js 20 或更高版本。

## 使用

在 TokenRank 网站生成私人 webhook 后连接：

```bash
tokenrank connect "https://tokenrank.org/api/collector/upload/<token>"
tokenrank preview --json
tokenrank upload
```

启用每小时后台同步：

```bash
tokenrank service install
tokenrank service status
tokenrank status
```

安装器按 `connect → initial upload → service install` 执行，只有首次上传成功才注册后台任务。`tokenrank status --json` 提供稳定的机器可读状态：仅有配置时为 `CONFIGURED`；成功记录必须绑定当前 endpoint、匿名 account identity 与合法 aggregate state 才是 `VERIFIED`；同时无最新错误或未完成尝试才是 `HEALTHY`。非健康状态使用非零退出码。并发的 scheduled run 会安静跳过，手动 `tokenrank upload` 遇到活跃采集锁则明确失败；锁使用 owner nonce，活 PID 不会因运行时间较长被抢占。

诊断本地数据源或移除后台任务：

```bash
tokenrank doctor
tokenrank sources
tokenrank service uninstall
tokenrank logout
```

macOS 使用 LaunchAgent，Linux 使用 persistent systemd user timer，Windows 使用隐藏的 Task Scheduler 任务。每台设备根据匿名 `deviceId` 固定选择 0–59 分钟中的一个错峰分钟；错过后会在下次启动或登录时补传，本机锁与计划边界状态会阻止并发快照和重复运行。

所有事件统一归入 UTC 日历日，全球排行榜使用同一条日界线。首次 v2 同步从当前 UTC 日期安全 cutover；之后每小时只上传新增或变大的 high-water 聚合行，没有变化就不发 GET 或 POST，每天 UTC 做一次可重试的原子 reconciliation。完整快照中途失败时，本地会保留可完整重放的规范化 pending snapshot；incremental 发送前也会写 WAL，全部批次确认后才清理，因此失败期间日志轮转或新增用量都不会覆盖未提交状态。本机 aggregate state 丢失或损坏时，CLI 会根据服务端权威 cutover 自动重扫并自愈。direct、HTTP proxy 与 HTTPS CONNECT 的每次尝试都有绝对 deadline。

每个新 webhook endpoint 会先通过同一路径的 GET 获取匿名 `accountId`，再运行一次不带筛选参数的 `tokenrank upload`。完成 full sync 后才能使用 `--file`、`--tool` 或 `--since`；同账号 Token 轮换会保留 cutover/high-water，并可按服务端返回的 active snapshot ID 精确重放旧 pending；切到不同账号则安全清空本机旧账号 state 后 fresh cutover，不会跨账号上传聚合。

CLI 默认跟随系统语言。可用 `--lang zh`、`--lang en`、`--lang auto` 或 `TOKENRANK_LANG=zh|en` 覆盖。

## 终端视觉与兼容性

彩色 TTY 使用适合一次性命令的紧凑卡片、对齐表格和单行状态反馈。视觉层级参考 Gum 的 `style`、`table`、`spin` 与结构化日志思路，但由 TokenRank 自己的零依赖渲染层实现，不会额外安装 TUI 框架。

界面沿用 TokenRank 品牌色：信号绿 `#D6FF3F`、警示橙 `#FF5B35`、象牙白 `#F2F1E8` 和灰绿 `#858B80`。默认保留终端自身背景，不再绘制满宽色块、大型 ASCII Logo 或装饰性赛事面板，让真实状态和 Token 数据成为视觉主体。

`preview`、`doctor`、本地扫描、文件读取、分批上传、状态检查和后台服务操作会在交互终端的 stderr 持续显示当前阶段、来源数、文件数、记录数、批次与耗时。进度不会写入 stdout，因此 `preview --json`、管道和重定向仍能获得纯净 JSON 或文本；非 TTY 与后台任务默认不显示交互进度。

`NO_COLOR=1` 关闭颜色，`TOKENRANK_NO_ANIMATION=1` 保留静态处理状态但关闭动画，`TOKENRANK_NO_PROGRESS=1` 可完全关闭进度。宽终端最多使用 78 列，窄终端会自动改为紧凑布局，不依赖 Nerd Font。

本地记录按流逐行解析并即时聚合，不会把完整 JSONL 和多份全量事件数组同时加载到内存。小时任务会确定排序枚举全部可用来源文件，再按事件的 UTC 日期过滤并与 `.tokenrank` 中的 aggregate high-water state 比较；不能用文件修改时间裁剪扫描范围，因为一个持续追加的文件可能同时包含多个日期的用量。state 只含日期、工具、模型和 Token 聚合，不含任何会话正文。每个来源根目录默认安全上限为 100,000 个匹配文件；任何 stateful scan 发生上限截断、读取错误或超大记录跳过都会拒绝上传和推进 ACK。异常单行默认上限为 64 MiB，可用 `TOKENRANK_MAX_JSONL_LINE_BYTES` 调整；普通 JSON 文档可用 `TOKENRANK_MAX_JSON_DOCUMENT_BYTES` 调整，文件数测试上限可用 `TOKENRANK_MAX_SOURCE_FILES` 调整。

## 隐私边界

CLI 只上传以下聚合字段：

- UTC 日期
- AI 工具
- 模型
- input、output、cache read、cache write 和 total Token 数
- 匿名设备标识、CLI 版本、时区和 payload 生成时间

不会上传 prompt、代码、聊天正文、文件名或文件内容。`preview --json` 可以在上传前查看完整 payload；`doctor` 不输出本机来源路径或原始日志内容。

## 支持的工具

当前支持：`codex`、`claude-code`、`hermes`、`openclaw`、`cline`、`opencode`、`workbuddy`、`gemini`、`zcode`、`kimi`、`kilo-code`、`codex-vps`、`roo-code`、`qwen`、`codex-cache`、`cursor`、`github-copilot`、`continue`。

工具归属按实际发起模型调用的 AI 工具判断，与宿主编辑器无关。例如 Cursor 中运行的 Codex 仍计入 `codex`。主 Agent 与本地日志可观测的 subagent 模型调用都会计入同一工具总量，但不会上传 subagent 明细。采集器按 provider event ID 和来源优先级去重，再生成每日聚合。

Cursor 只接受原生 Agent 的精确 Token 明细。GitHub Copilot 只读取带明确 Token 类型的 CLI OpenTelemetry NDJSON 或专属日志，Continue 读取会话 Token usage。缺少精确字段时不会使用请求数、积分、字符数或估算值替代。

## 本地开发

```bash
pnpm install
pnpm check
pnpm lint
pnpm typecheck
pnpm test
pnpm tokenrank tools
```

测试覆盖 UTC/offset/epoch 日期、本地来源与 subagent 汇总、事件去重、v2 cutover/high-water、原子多批快照、重试与 4xx 边界、HTTP/HTTPS 代理、计划边界补跑，以及 macOS、Linux、Windows 的小时后台任务配置。

## 项目边界

- 本仓库：本地采集、CLI 展示、安装器、后台调度、客户端 payload 和 release。
- TokenRank Web：身份认证、webhook 生命周期、服务端 payload 校验、持久化和排行榜。
- 共享边界：`GET/POST /api/collector/upload/:token` 的 identity 与 payload 契约；详见 [docs/api-contract.md](docs/api-contract.md)。

CLI 可以独立发布修复和数据源适配器。新增工具 key 或修改 payload 结构时，必须先确保 TokenRank Web 服务端接受该契约。

## 发布

1. 更新 `package.json` 版本与 `CHANGELOG.md`。
2. 完成 `pnpm check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`。
3. 推送 `vX.Y.Z` tag。
4. GitHub Actions 自动创建 release，并附加 `tokenrank.mjs`、`package.json`、`install.sh`、`install.ps1`。

`tokenrank.org/install.sh` 和 `tokenrank.org/install.ps1` 会继续作为稳定入口，并转交给本仓库最新 release。

## 开源许可

本项目采用 [MIT License](LICENSE) 开源。
