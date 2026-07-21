<p align="right">
  <a href="./README.md">English</a> · <strong>简体中文</strong>
</p>

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="TokenRank CLI 在本机预览 AI Token 用量，只把 UTC 聚合行同步到私人 webhook">
</p>

<p align="center">
  <a href="https://tokenrank.org"><strong>TokenRank 榜单</strong></a> ·
  <a href="https://tokenrank.org/onboard">生成私人 webhook</a> ·
  <a href="./docs/api-contract.md">上传 API 契约</a> ·
  <a href="./CHANGELOG.md">更新日志</a>
</p>

TokenRank CLI 是 [TokenRank](https://tokenrank.org) 的独立本地采集器。它扫描受支持 AI 工具的精确 Token 记录，在设备上按 UTC 日期、工具和模型聚合，再把聚合行上传到用户自己的私人 webhook。

**先预览，再决定是否连接：**

```bash
npx --yes tokenrank preview
```

这条命令不需要账号、不会上传数据，也不会修改后台任务。

## 安装

CLI 需要 Node.js 20 或更高版本，运行时零第三方依赖。

### 稳定安装入口

macOS / Linux：

```bash
curl -fsSL "https://tokenrank.org/install.sh" | bash
```

Windows PowerShell：

```powershell
irm "https://tokenrank.org/install.ps1" | iex
```

网站安装入口会注入当前用户的私人 webhook，并转交到本仓库最新 release。也可以直接使用 [GitHub Releases](https://github.com/tokenrank/tokenrank-cli/releases/latest) 中的安装器。

## 快速开始

在 [TokenRank Onboarding](https://tokenrank.org/onboard) 生成私人 webhook 后：

```bash
tokenrank connect "https://tokenrank.org/api/collector/upload/<token>"
tokenrank preview
tokenrank upload
tokenrank service install
tokenrank status
```

安装器按 `connect → initial upload → service install` 执行；只有首次上传成功才注册后台任务。

## 命令地图

| 命令 | 用途 | 是否上传 |
| --- | --- | --- |
| `tokenrank preview [--json]` | 扫描并展示即将生成的聚合 payload | 否 |
| `tokenrank tools` | 列出支持的 AI 工具 | 否 |
| `tokenrank sources` | 查看来源适配器状态 | 否 |
| `tokenrank doctor` | 诊断精确数据源与可用记录 | 否 |
| `tokenrank connect <url>` | 在本机保存私人 webhook | 否 |
| `tokenrank upload` | 上传本次完整或增量聚合 | 是 |
| `tokenrank status [--json]` | 检查连接、同步与 aggregate state | 否 |
| `tokenrank service install` | 注册每小时错峰同步 | 首次安装前已完成上传 |
| `tokenrank service status` | 检查系统后台任务 | 否 |
| `tokenrank service uninstall` | 移除后台任务 | 否 |
| `tokenrank logout` | 移除本机连接信息 | 否 |

所有命令支持 `--lang zh`、`--lang en`、`--lang auto`；也可以设置 `TOKENRANK_LANG=zh|en`。

## 隐私边界

| 会上传 | 永远不上传 |
| --- | --- |
| UTC 日期、AI 工具、模型 | Prompt、聊天正文 |
| input、output、cache read、cache write、total | 源码、文件名、文件内容 |
| 匿名设备标识、CLI 版本、时区、生成时间 | 原始日志、Provider 凭据 |

- `preview --json` 可以在上传前检查完整 payload。
- `doctor` 不显示本机来源路径或原始日志内容。
- 本地 state 只保存日期、工具、模型与 Token 聚合，不保存会话正文。
- 缺少精确 Token 字段时，CLI 不会用请求数、积分、字符数或估算值替代。

## 支持的工具

当前内置 18 个来源适配器：

```text
codex             claude-code       hermes
openclaw          cline             opencode
workbuddy         gemini            zcode
kimi              kilo-code         codex-vps
roo-code          qwen              codex-cache
cursor            github-copilot    continue
```

工具归属按实际发起模型调用的 AI 工具判断，与宿主编辑器无关。例如 Cursor 中运行的 Codex 仍计入 `codex`。主 Agent 与本地日志可观测的 subagent 调用汇入同一工具总量，但不会上传 subagent 明细。

采集器按 provider event ID 和来源优先级去重。Cursor、GitHub Copilot 与 Continue 只有在来源包含明确 Token 类型时才会计入。

## 自动同步与恢复

macOS 使用 LaunchAgent，Linux 使用 persistent systemd user timer，Windows 使用隐藏、非交互的 Task Scheduler 任务。

- 每台设备按匿名 `deviceId` 固定选择一个 0–59 分钟的错峰分钟；
- 错过计划时间后会在下次启动或登录时补传；
- 本机锁与计划边界状态会避免并发快照和重复运行；
- 非 TTY 与后台任务默认不输出交互进度；
- direct、HTTP proxy 与 HTTPS CONNECT 都有绝对 deadline。

<details>
<summary><strong>v2 cutover / high-water 正确性模型</strong></summary>

所有事件统一归入 UTC 日历日。首次 v2 同步从服务端确认的 UTC cutover 日期开始，使用可重放的原子完整快照；之后每小时只发送新增或变大的 high-water 聚合行，没有变化就不请求服务器。

完整快照与 incremental 在发送前都会持久化 pending/WAL，全部批次确认后才清理。日志轮转、短暂失败或扫描范围缩小不会调低已确认历史；本机 aggregate state 丢失或损坏时，CLI 会依据服务端权威 cutover 自动重扫。切换到不同账号时会清空旧账号 aggregate state，避免跨账号复用数据。

任何 stateful scan 出现文件上限截断、读取错误或超大记录跳过，都会拒绝上传和推进 ACK。协议详情见 [docs/api-contract.md](docs/api-contract.md)。

</details>

## 终端行为

彩色 TTY 使用信号绿 `#D6FF3F`、警示橙 `#FF5B35`、象牙白 `#F2F1E8` 与灰绿 `#858B80`，以紧凑卡片、表格和单行状态反馈呈现真实扫描与上传进度。

- 进度只写入 stderr，`preview --json`、管道和重定向的 stdout 保持纯净；
- `NO_COLOR=1` 关闭颜色；
- `TOKENRANK_NO_ANIMATION=1` 保留静态状态但关闭动画；
- `TOKENRANK_NO_PROGRESS=1` 完全关闭交互进度；
- 宽终端最多使用 78 列，窄终端自动切换紧凑布局，不依赖 Nerd Font。

## 本地开发

```bash
pnpm install
pnpm check
pnpm lint
pnpm typecheck
pnpm test
pnpm tokenrank tools
```

测试覆盖日期归一化、来源解析、subagent 汇总、事件去重、v2 cutover/high-water、原子多批快照、重试与 4xx 边界、代理、计划补跑，以及 macOS、Linux、Windows 的后台任务配置。

## 项目边界

| TokenRank CLI | TokenRank Web |
| --- | --- |
| 本地扫描与流式聚合 | X 身份与 webhook 生命周期 |
| CLI 展示、安装器、后台调度 | 服务端 payload 校验与持久化 |
| 客户端 payload、版本与 release | 排行榜、公开资料与 Dashboard |

共享边界是 `GET/POST /api/collector/upload/:token`。本仓库不得导入 TokenRank Web 源码，也不依赖 Next.js、数据库或认证模块。

## 发布

1. 更新 `package.json` 版本与 `CHANGELOG.md`。
2. 运行 `pnpm check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`。
3. 推送 `vX.Y.Z` tag。
4. GitHub Actions 创建 release 并附加 CLI、package metadata 与两端安装器。

## 参与与许可

问题与数据源建议请提交到 [GitHub Issues](https://github.com/tokenrank/tokenrank-cli/issues)。项目采用 [MIT License](LICENSE) 开源。
