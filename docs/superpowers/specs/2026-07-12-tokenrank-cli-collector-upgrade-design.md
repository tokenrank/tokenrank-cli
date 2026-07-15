# TokenRank CLI 采集器升级设计

日期：2026-07-12
状态：已批准，直接进入实施

## 目标

完成 TokenRank CLI 的一次完整升级：Windows 自动同步全程隐藏运行；用户错过 00:00 或 12:00 后，在下次登录时自动补传且不重复；交互式 CLI 升级为高饱和、强动画感的赛博竞技仪表盘；新增 Cursor、GitHub Copilot、Continue 三个工具级统计来源，并确保编辑器宿主不会改变工具归属。

## 非目标

- 不新增“编辑器”或“宿主”排行榜维度。
- 不把 Cursor 中运行的 Codex、Cline、Roo Code 等插件计入 Cursor。
- 不把积分、请求数、字符数或估算 Token 冒充真实 Token。
- 不上传提示词、聊天、代码、文件路径、文件名或原始日志。
- 不通过读取 Cursor 登录令牌或调用未公开接口获取个人账户数据。
- 不为了动画引入常驻进程、Electron、浏览器界面或重量级终端 UI 依赖。

## 工具归属

统计归属由实际发起模型调用的 AI 工具决定，编辑器只作为运行宿主：

- Cursor 原生 Agent、Chat、Background Agent 归属 `cursor`。
- Cursor 或 VS Code 中运行的 Codex 插件归属 `codex`。
- VS Code、Cursor 或 JetBrains 中运行的 GitHub Copilot 归属 `github-copilot`。
- VS Code 或 Cursor 中运行的 Cline、Roo Code、Kilo Code 分别归属已有工具键。
- Continue CLI 与 Continue IDE 扩展归属 `continue`。

服务端、数据库、排行榜、仪表盘、中英文文案和 CLI 必须使用同一组工具键。

## 新增工具与数据来源

### Cursor

`cursor` 适配器只读取 Cursor 自有数据，不递归扫描 Cursor 的扩展 `globalStorage`。

精确来源按优先级排列：

1. Cursor Teams Admin API 的 spend 事件，使用官方 `tokenUsage` 中的 input、output、cache read、cache write。
2. Cursor 自有结构化日志或数据库中明确出现的同等 Token 字段。
3. 用户显式提供的 Cursor 官方用量 JSON 文件。

同一次采集只启用最高优先级的可用来源。个人账户只有 Dashboard 明细、但本机没有精确字段时，`doctor` 显示“已检测，缺少精确 Token 来源”，不生成上传记录。

CLI 不读取 Cursor access token 或 refresh token。Cursor Admin API Key 仅由用户显式配置，写入权限受限的 TokenRank 本机配置；任何输出、日志和错误不得回显密钥。

### GitHub Copilot

`github-copilot` 适配器读取：

- GitHub Copilot CLI 暴露的 OpenTelemetry `gen_ai.client.token.usage` input/output 指标。
- VS Code/Cursor 中 GitHub Copilot 与 Copilot Chat 的专属日志；只接受带明确模型、时间和 Token 类型的记录。
- 用户显式提供的官方 Copilot 用量 JSON/NDJSON 文件。

只含请求数、活跃用户数、代码行数或 AI units、但不含 Token 数的记录不进入 Token 排行榜。

### Continue

`continue` 适配器读取 Continue CLI 和 IDE 会话持久化中与 `/info` 同源的 Token usage/cost 字段。它只扫描 `~/.continue` 及 Continue 自己的扩展目录，不扫描整个 VS Code/Cursor 存储。

### 暂不纳入

Windsurf、JetBrains AI、Amazon Q、Zed 和 Aider 暂不新增工具键。当前公开或本地可用数据以积分、额度、请求数、遥测或敏感调试日志为主，未形成可稳定映射到 input/output/cache Token 的个人级来源。后续只有满足精确字段、稳定来源和隐私约束时才加入。

## 采集器结构

保持 `bin/tokenrank.mjs` 单文件分发，避免安装器需要下载多文件；内部改为明确的工具适配器表：

```text
ToolAdapter
  key
  label
  sources[]
    id
    priority
    roots()
    detect()
    collect()
```

每个适配器只能返回内部 `UsageEvent`：

```text
date, tool, model, input, output, cacheRead, cacheWrite,
occurredAt, sourceId, sourcePriority, providerEventId, fingerprint
```

`sourceId`、`providerEventId`、`fingerprint` 仅用于本机去重，不进入上传 payload。

## 去重规则

去重发生在每日聚合之前：

1. 每条来源记录先由所属工具适配器认领，禁止多个工具适配器读取同一目录或数据库表。
2. 有 provider request/session/event ID 时，指纹为工具键与该稳定 ID 的哈希。
3. 没有稳定 ID 时，指纹包含工具键、时间、模型、各 Token 字段、来源文件标识和记录位置。
4. 同工具同指纹来自多个来源时，保留 `sourcePriority` 最高的一条。
5. 不同工具即使时间和 Token 数完全一致，也不得互相去重。
6. 每日聚合仍按 `date + tool + model` 合并；服务端按现有设备、日期、工具、模型唯一键覆盖上传，保证重传幂等。

必须有回归用例证明 Cursor 中的 Codex 插件只计入 Codex，以及相同 Cursor 事件同时出现在 API 与日志时只计算一次。

## 自动同步与补跑

### 本机同步状态

新增 `~/.tokenrank/service-state.json`，原子写入：

- `lastSuccessfulAt`
- `lastScheduledBoundary`
- `lastAttemptAt`
- `lastErrorCode`

计划执行先计算用户本地时区中最近一个不晚于当前时间的 00:00/12:00 边界：

- `lastScheduledBoundary` 已覆盖该边界时静默退出。
- 未覆盖时执行一次本地扫描和上传。
- 只有上传成功才推进成功时间和边界。
- 失败保留待补跑状态，在下一次登录或计划触发时重试。
- 进程锁保证多个触发器同时启动时只有一个实例执行。

手动执行完整本地 `upload` 成功后也更新同步状态；使用 `--file` 的导入上传不推进自动同步边界。

### Windows

迁移为一个 `TokenRankCollector` 任务，删除旧的 `TokenRankCollectorMidnight`、`TokenRankCollectorNoon` 和更早的 `TokenRankCollector`。

任务定义包含：

- 每天 00:00 触发。
- 每天 12:00 触发。
- 当前用户登录时触发。
- `StartWhenAvailable=true`。
- `Hidden=true`。
- `MultipleInstancesPolicy=IgnoreNew`。
- 最小权限、当前用户上下文，不要求管理员权限。

任务执行隐藏的 PowerShell runner；runner 使用 `-NoProfile -NonInteractive -WindowStyle Hidden`，启动 Node CLI 的 `daemon --once --scheduled`，将标准输出和错误写入 `~/.tokenrank/collector.log` 与 `collector.err.log`，不得弹出控制台窗口。

### macOS 与 Linux

- macOS LaunchAgent 保留 00:00/12:00 日历触发，并增加 `RunAtLoad=true`；加载时由同步边界判断是否补跑。
- Linux 保留 systemd user timer 的 `Persistent=true`，服务改为计划模式并使用同一同步边界判断。
- 三个平台的 `service status` 都显示注册状态、最后成功、最后错误和下次计划边界，而不是只检查文件是否存在。

## CLI 视觉系统

### 视觉方向

交互式 TTY 使用“赛博竞技场 / Neon telemetry wall”方向，而不是传统命令行列表：

- 以超宽 Block Art `TOKENRANK` 标志和 Token 核心图形构成首屏大图。
- 使用亮青、酸性绿、紫罗兰、热粉和橙色的 256 色或 TrueColor 渐变。
- 使用大面积背景色块、粗边框、上下分区面板和高对比数字，不只给文字上色。
- 扫描阶段呈现雷达扫过、脉冲点和工具卡片逐项点亮。
- 上传阶段呈现双层动态进度条、流动高光和实时行数。
- 成功阶段呈现短暂爆闪/能量充满动画，然后停在可复制的静态终帧。
- 动画总时长受真实工作进度驱动；快速操作最多增加约 600ms 的装饰延迟，不让视觉拖慢 CLI。

静态终帧示意：

```text
████████████████████████████████████████████████████████████████
█  TOKENRANK // LIVE GRID                         SYNC 100%    █
█  ◢██◣  ◢██◣  ◢██◣       2.49M FAIR TOKENS      ● ONLINE    █
████████████████████████████████████████████████████████████████

┏━ SCAN MATRIX ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃ CODEX              1.42M  ██████████████████  LOCKED         ┃
┃ CLAUDE CODE         860K  ███████████          LOCKED         ┃
┃ GITHUB COPILOT      214K  ███                  LOCKED         ┃
┃ CURSOR                 —  EXACT SOURCE REQUIRED               ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛

◈ UPLOAD  [████████████████████████████████████████] 35 / 35
✓ GRID SYNCHRONIZED  ·  NEXT 12:00  ·  MISSED RUNS AUTO-RECOVER
```

### 动画与兼容性

- 动画仅在 `stdout.isTTY`、未设置 `NO_COLOR=1`、未设置 `TOKENRANK_NO_ANIMATION=1` 且不是 `--json` 时启用。
- 后台计划模式强制设置无 Logo、无动画、无交互，只写日志。
- 不支持 TrueColor 时降级到 ANSI 256 色；无颜色时使用单色 Unicode；不支持 Unicode 时使用 ASCII。
- 窄终端使用紧凑卡片，不横向溢出；宽终端显示完整大图和双栏状态墙。
- `preview --json` 的 stdout 只能包含 JSON；错误写 stderr。
- 非 TTY 输出保持稳定、可测试、适合 CI 和日志解析。
- 动画不使用全屏 alternate buffer，不清空用户历史终端，只更新自己占用的行。

### 命令体验

- `tokenrank status`：连接状态、后台任务、最后成功、待补跑、下次边界。
- `tokenrank doctor`：逐工具显示检测状态、数据精度、记录数、重复来源和修复提示。
- `tokenrank tools`：显示支持、已检测、精确来源缺失三种状态。
- `tokenrank service status`：保留兼容，复用 `status` 的后台任务部分。

## 错误处理与隐私

- 一个工具适配器损坏时，`doctor` 显示该工具错误；其他工具仍可扫描和上传。
- 自动任务失败必须返回非零退出码、写错误日志并保留待补跑状态。
- 任何日志不得包含 webhook、Cursor API Key、GitHub Token、原始提示词或代码。
- CLI 只读取本机日志并提取允许的聚合字段；原始数据不会进入上传对象。
- Cursor API、代理或其他网络错误必须输出脱敏错误码，不输出认证头或完整响应体。

## 数据库与产品界面

新增 `cursor`、`github-copilot`、`continue` 工具枚举及数据库迁移。同步更新：

- `src/lib/types.ts`
- `src/db/schema.ts`
- 上传 Zod schema 与测试
- 排行榜工具页签和工具分解
- 仪表盘工具标签
- `src/i18n/copy.ts` 中英文标签与说明
- README、规则页和 CHANGELOG

历史数据不需要回填；新工具从首次有效上传开始出现。

## 测试与验收

所有行为按 TDD 实施，至少覆盖：

1. Windows 任务 XML/注册参数包含隐藏、补跑、登录和两个日历触发器。
2. Windows runner 使用隐藏非交互 PowerShell，且计划任务执行不会调用可见 `.cmd`。
3. 12:00 离线、13:00 登录时补传一次；随后重复触发不再上传。
4. 上传失败后不推进边界，并在下一次触发时重试。
5. 同一 Cursor 事件在 API 和日志中只保留高优先级记录。
6. Cursor 内 Codex、Cline、Roo、Kilo 数据不会进入 Cursor。
7. 新工具贯通 CLI、上传 schema、数据库、排行榜、仪表盘和中英文文案。
8. TTY 动画模式包含大图、色块、动态进度；窄终端不溢出。
9. `NO_COLOR`、非 TTY、后台模式和 `--json` 没有 ANSI 或动画控制字符。
10. PowerShell 安装脚本可解析，安装包仍能从单文件 CLI 布局运行。

最终验证命令：

```text
pnpm lint
pnpm test -- --runInBand
pnpm build
```

另外运行 Windows 计划任务生成物检查、PowerShell parser 检查、CLI TTY/非 TTY/JSON 快照检查，以及一次本地安装目录冒烟测试。

## 交付约束

- 保留并兼容当前用户的 webhook 配置和安装路径。
- 安装或升级时自动删除旧任务并注册新任务。
- 不覆盖工作区中与本目标无关的现有修改。
- README 与 CHANGELOG 必须说明新增工具、数据精度、隐藏运行、错过时间补跑和诊断命令。
