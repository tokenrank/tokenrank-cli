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

启用每天本地时间 00:00 和 12:00 的后台同步：

```bash
tokenrank service install
tokenrank service status
tokenrank status
```

诊断本地数据源或移除后台任务：

```bash
tokenrank doctor
tokenrank sources
tokenrank service uninstall
tokenrank logout
```

macOS 使用 LaunchAgent，Linux 使用 systemd user timer，Windows 使用隐藏的 Task Scheduler 任务。错过计划时间后，会在下次启动或登录时补传一次；本机状态会避免同一计划边界重复上传。

CLI 默认跟随系统语言。可用 `--lang zh`、`--lang en`、`--lang auto` 或 `TOKENRANK_LANG=zh|en` 覆盖。

## 隐私边界

CLI 只上传以下聚合字段：

- 日期
- AI 工具
- 模型
- input、output、cache read、cache write 和 total Token 数
- 匿名设备标识、CLI 版本、时区和 payload 生成时间

不会上传 prompt、代码、聊天正文、文件名或文件内容。`preview --json` 可以在上传前查看完整 payload；`doctor` 不输出本机来源路径或原始日志内容。

## 支持的工具

当前支持：`codex`、`claude-code`、`hermes`、`openclaw`、`cline`、`opencode`、`workbuddy`、`gemini`、`zcode`、`kimi`、`kilo-code`、`codex-vps`、`roo-code`、`qwen`、`codex-cache`、`cursor`、`github-copilot`、`continue`。

工具归属按实际发起模型调用的 AI 工具判断，与宿主编辑器无关。例如 Cursor 中运行的 Codex 仍计入 `codex`。采集器按 provider event ID 和来源优先级去重，再生成每日聚合。

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

测试覆盖本地来源解析、事件去重、payload 校验、HTTP/HTTPS 代理、500 行分批、计划边界补跑，以及 macOS、Linux、Windows 的后台任务配置。

## 项目边界

- 本仓库：本地采集、CLI 展示、安装器、后台调度、客户端 payload 和 release。
- TokenRank Web：身份认证、webhook 生命周期、服务端 payload 校验、持久化和排行榜。
- 共享边界：`POST /api/collector/upload/:token` 的 payload 契约；详见 [docs/api-contract.md](docs/api-contract.md)。

CLI 可以独立发布修复和数据源适配器。新增工具 key 或修改 payload 结构时，必须先确保 TokenRank Web 服务端接受该契约。

## 发布

1. 更新 `package.json` 版本与 `CHANGELOG.md`。
2. 完成 `pnpm check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`。
3. 推送 `vX.Y.Z` tag。
4. GitHub Actions 自动创建 release，并附加 `tokenrank.mjs`、`package.json`、`install.sh`、`install.ps1`。

`tokenrank.org/install.sh` 和 `tokenrank.org/install.ps1` 会继续作为稳定入口，并转交给本仓库最新 release。

## 开源许可

本项目采用 [MIT License](LICENSE) 开源。
