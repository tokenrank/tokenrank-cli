# TokenRank CLI Collector Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 TokenRank 自动同步在 Windows 静默运行并补跑错过的 00:00/12:00 边界，升级为高饱和动画 CLI，并以工具归属和事件去重方式新增 Cursor、GitHub Copilot、Continue。

**Architecture:** 保留 `bin/tokenrank.mjs` 单文件分发，在文件内部建立工具适配器、事件去重、同步状态和终端渲染四个独立边界。计划任务统一调用 `daemon --once --scheduled`；三端都通过本地边界状态实现幂等补跑。产品端继续以共享 `TOOL_KEYS` 为唯一工具集合，并通过显式 SQL 迁移扩展 Postgres enum。

**Tech Stack:** Node.js ESM、Node `crypto/fs/http/child_process`、可选 `node:sqlite`、Windows Task Scheduler XML、launchd、systemd、Next.js 16、TypeScript、Drizzle、Zod、Vitest。

## Global Constraints

- 编辑器不是排行榜维度；Cursor 中 Codex 仍归属 `codex`。
- 不上传或输出提示词、聊天、代码、文件路径、文件名或原始日志。
- 不把积分、请求数、AI units、字符估算当成 Token。
- Cursor 不读取 access token、refresh token 或未公开接口。
- 保持 `bin/tokenrank.mjs` 单文件分发和现有 webhook/安装路径兼容。
- 动画只在交互式 TTY 启用；后台、非 TTY、`NO_COLOR=1`、`TOKENRANK_NO_ANIMATION=1`、`--json` 必须稳定安静。
- 所有生产行为先写失败测试并观察预期失败。
- 不覆盖工作区内与本目标无关的现有修改。

---

### Task 1: 扩展共享工具枚举和产品标签

**Files:**
- Modify: `src/lib/types.ts`
- Modify: `src/db/schema.ts`
- Modify: `src/i18n/copy.ts`
- Create: `drizzle/0005_expand_cli_tools.sql`
- Modify: `drizzle/meta/_journal.json`
- Test: `src/lib/collector/upload.test.ts`
- Test: `src/lib/ranking/ranking.test.ts`

**Interfaces:**
- Produces: `ToolKey` 新增 `cursor | github-copilot | continue`。
- Produces: Postgres `tool` enum 接受相同三个值。
- Consumes: 现有 `TOOL_KEYS` 驱动 Zod、排行榜和仪表盘。

- [ ] **Step 1: 写新增工具贯通 schema 的失败测试**

在 `src/lib/collector/upload.test.ts` 增加：

```ts
it.each(["cursor", "github-copilot", "continue"] as const)(
  "accepts %s aggregate rows",
  (tool) => {
    const parsed = parseUploadPayload({
      deviceId: "device-12345678",
      clientVersion: "0.2.0",
      timezone: "Asia/Shanghai",
      generatedAt: "2026-07-12T04:00:00.000Z",
      entries: [{ date: "2026-07-12", tool, model: `${tool}-model`, input: 7, output: 5, cacheRead: 0, cacheWrite: 0, total: 12 }],
    });
    expect(parsed.entries[0].tool).toBe(tool);
  },
);
```

- [ ] **Step 2: 运行测试并确认因 enum 缺失失败**

Run: `pnpm vitest run src/lib/collector/upload.test.ts`
Expected: FAIL，Zod 报告 `cursor`、`github-copilot`、`continue` 不在 enum。

- [ ] **Step 3: 更新共享 enum、数据库 enum 和中英文标签**

把三个键追加到 `src/lib/types.ts` 与 `src/db/schema.ts` 的现有工具列表：

```ts
"cursor",
"github-copilot",
"continue",
```

在 `src/i18n/copy.ts` 两套工具标签映射中加入：

```ts
cursor: "Cursor",
"github-copilot": "GitHub Copilot",
continue: "Continue",
```

创建迁移：

```sql
ALTER TYPE "public"."tool" ADD VALUE IF NOT EXISTS 'cursor';
ALTER TYPE "public"."tool" ADD VALUE IF NOT EXISTS 'github-copilot';
ALTER TYPE "public"."tool" ADD VALUE IF NOT EXISTS 'continue';
```

向 `_journal.json` 追加 idx 5、tag `0005_expand_cli_tools`。

- [ ] **Step 4: 运行 schema、ranking、i18n 相关测试**

Run: `pnpm vitest run src/lib/collector/upload.test.ts src/lib/ranking/ranking.test.ts src/lib/format.test.ts`
Expected: PASS。

### Task 2: 建立工具专属来源和事件去重

**Files:**
- Modify: `bin/tokenrank.mjs`
- Test: `src/lib/collector/cli.test.ts`

**Interfaces:**
- Produces: `sourceDefinitions()` 中三个新工具的 allowlist roots。
- Produces: 内部事件字段 `sourceId/sourcePriority/providerEventId/occurredAt/fingerprint`。
- Produces: `dedupeUsageEvents(events)`，聚合前执行。
- Consumes: `aggregateEntries()` 仅接收已去重事件。

- [ ] **Step 1: 写归属与重复来源失败测试**

新增 fixtures：

```ts
cursor: ".tokenrank/imports/cursor-usage.json",
"github-copilot": ".copilot/logs/otel-metrics.jsonl",
continue: ".continue/sessions/continue.json",
```

增加测试：同一 `providerEventId` 的 Cursor API/import 记录只生成一条；在 Cursor 扩展目录创建 Codex fixture 后，`--tool cursor` 返回零条而 `--tool codex` 返回一条。

- [ ] **Step 2: 运行 CLI 测试并确认新工具缺失与重复计数失败**

Run: `pnpm vitest run src/lib/collector/cli.test.ts -t "Cursor|Copilot|Continue|duplicate"`
Expected: FAIL，原因是来源未定义或同一事件被累加。

- [ ] **Step 3: 将来源定义改为工具自有 allowlist**

为 Windows/macOS/Linux 计算 VS Code/Cursor 日志根目录，但 `cursor` 不得使用整个 `globalStorage`：

```js
{
  tool: "cursor",
  label: "Cursor",
  sources: [
    { id: "cursor-import", priority: 300, roots: [path.join(home, ".tokenrank", "imports", "cursor-usage.json")] },
    { id: "cursor-owned", priority: 200, roots: [path.join(home, ".cursor", "usage"), path.join(appSupport, "Cursor", "User", "globalStorage", "anysphere.cursor-retrieval")] },
  ],
},
{
  tool: "github-copilot",
  label: "GitHub Copilot",
  sources: [
    { id: "copilot-cli-otel", priority: 300, roots: [path.join(home, ".copilot", "logs"), path.join(home, ".copilot", "telemetry")] },
    { id: "copilot-vscode-log", priority: 200, roots: [codeLogs, cursorLogs] },
  ],
},
{
  tool: "continue",
  label: "Continue",
  sources: [{ id: "continue-session", priority: 300, roots: [path.join(home, ".continue", "sessions")] }],
},
```

日志来源须按文件路径/内容标记验证确属 GitHub Copilot，不能递归接受其他扩展日志。

- [ ] **Step 4: 实现事件指纹和来源优先级去重**

加入：

```js
function usageFingerprint(event) {
  const stable = event.providerEventId
    ? `${event.tool}\0${event.providerEventId}`
    : [event.tool, event.occurredAt ?? event.date, event.model, event.input, event.output, event.cacheRead, event.cacheWrite, event.sourceRecordId].join("\0");
  return createHash("sha256").update(stable).digest("hex");
}

function dedupeUsageEvents(events) {
  const claimed = new Map();
  for (const event of events) {
    const fingerprint = event.fingerprint ?? usageFingerprint(event);
    const current = claimed.get(fingerprint);
    if (!current || (event.sourcePriority ?? 0) > (current.sourcePriority ?? 0)) claimed.set(fingerprint, { ...event, fingerprint });
  }
  return [...claimed.values()];
}
```

上传聚合前删除内部 provenance 字段。

- [ ] **Step 5: 运行全部 CLI 与上传测试**

Run: `pnpm vitest run src/lib/collector/cli.test.ts src/lib/collector/upload.test.ts src/lib/collector/upload-route.test.ts`
Expected: PASS，新工具 fixture 各产生一条且归属/去重测试通过。

### Task 3: 实现同步边界、失败重试和进程锁

**Files:**
- Modify: `bin/tokenrank.mjs`
- Test: `src/lib/collector/cli.test.ts`

**Interfaces:**
- Produces: `latestScheduleBoundary(now)`。
- Produces: `runScheduledUpload(args, now)`。
- Produces: `service-state.json` 与 `collector.lock`。
- Consumes: `upload(args)` 返回成功后的 entry count，而非只打印。

- [ ] **Step 1: 写错过边界、重复触发和失败重试测试**

测试通过 `TOKENRANK_NOW=2026-07-12T05:00:00+08:00` 固定时钟：第一次 `daemon --once --scheduled` 上传并写 `2026-07-12T04:00:00.000Z` 边界；第二次相同时钟不发请求；失败响应后状态不推进，再次执行会重试。

- [ ] **Step 2: 运行测试并观察因状态逻辑缺失失败**

Run: `pnpm vitest run src/lib/collector/cli.test.ts -t "scheduled boundary|missed run|retry"`
Expected: FAIL，第二次仍上传或状态文件不存在。

- [ ] **Step 3: 实现本地边界和原子状态写入**

```js
function latestScheduleBoundary(now = new Date()) {
  const boundary = new Date(now);
  boundary.setMinutes(0, 0, 0);
  boundary.setHours(now.getHours() >= 12 ? 12 : 0);
  return boundary;
}

async function writeServiceState(state) {
  const file = serviceStatePath();
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}
```

锁使用 `writeFile(lock, ..., { flag: "wx" })`；退出时删除，只在锁文件记录的 PID 不存在或 mtime 超过执行上限时回收。

- [ ] **Step 4: 在计划模式中只在成功后推进边界**

```js
async function runScheduledUpload(args) {
  return withCollectorLock(async () => {
    const now = currentTime();
    const boundary = latestScheduleBoundary(now);
    const state = await readServiceState();
    if (state.lastScheduledBoundary && new Date(state.lastScheduledBoundary) >= boundary) return { skipped: true };
    await writeServiceState({ ...state, lastAttemptAt: now.toISOString(), lastErrorCode: null });
    try {
      const result = await upload(args.filter((arg) => arg !== "--scheduled"), { quiet: true });
      await writeServiceState({ ...state, lastAttemptAt: now.toISOString(), lastSuccessfulAt: now.toISOString(), lastScheduledBoundary: boundary.toISOString(), lastErrorCode: null });
      return result;
    } catch (error) {
      await writeServiceState({ ...state, lastAttemptAt: now.toISOString(), lastErrorCode: safeErrorCode(error) });
      throw error;
    }
  });
}
```

- [ ] **Step 5: 运行计划同步测试和普通上传回归**

Run: `pnpm vitest run src/lib/collector/cli.test.ts -t "scheduled|upload"`
Expected: PASS。

### Task 4: Windows 隐藏任务及三端补跑注册

**Files:**
- Modify: `bin/tokenrank.mjs`
- Test: `src/lib/collector/cli.test.ts`

**Interfaces:**
- Produces: `windowsTaskXml(runnerPath)`。
- Produces: `tokenrank-collector.ps1` 和 `tokenrank-collector.xml`。
- Produces: 单任务 `TokenRankCollector`。
- Consumes: `daemon --once --scheduled`。

- [ ] **Step 1: 写 Windows XML 与 runner 失败测试**

断言 XML 包含两个 CalendarTrigger、LogonTrigger、`StartWhenAvailable>true`、`Hidden>true`、`IgnoreNew`；runner 包含 `-NoProfile`、`-NonInteractive`、`daemon --once --scheduled`，且不通过 `.cmd` 启动。

- [ ] **Step 2: 运行 service 测试并观察旧双任务实现失败**

Run: `pnpm vitest run src/lib/collector/cli.test.ts -t "Windows background task"`
Expected: FAIL，当前 runner 是 `.cmd` 且没有 XML/登录触发。

- [ ] **Step 3: 生成隐藏 PowerShell runner 与 Task Scheduler XML**

runner 核心：

```powershell
$ErrorActionPreference = 'Stop'
$env:TOKENRANK_NO_LOGO = '1'
$env:TOKENRANK_NO_ANIMATION = '1'
& '<node>' '<tokenrank.mjs>' daemon --once --scheduled 1>> '<collector.log>' 2>> '<collector.err.log>'
exit $LASTEXITCODE
```

Task action 执行：

```text
powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "...tokenrank-collector.ps1"
```

用 `schtasks.exe /Create /TN TokenRankCollector /XML tokenrank-collector.xml /F` 注册，并删除三个旧任务名。

- [ ] **Step 4: 补齐 macOS RunAtLoad 和统一计划参数**

LaunchAgent 增加 `<key>RunAtLoad</key><true/>`；launchd/systemd ExecStart 都包含 `daemon --once --scheduled`；Linux 保留 `Persistent=true`。

- [ ] **Step 5: 运行跨平台 service 测试**

Run: `pnpm vitest run src/lib/collector/cli.test.ts -t "background service|systemd|Windows|schedule"`
Expected: PASS。

### Task 5: 实现 Neon Arena 动画渲染和诊断命令

**Files:**
- Modify: `bin/tokenrank.mjs`
- Test: `src/lib/collector/cli.test.ts`

**Interfaces:**
- Produces: `terminalCapabilities()`、`renderHero()`、`renderScanMatrix()`、`withAnimatedProgress()`。
- Produces: `tokenrank status` 与 `tokenrank doctor`。
- Consumes: scan per-tool diagnostics、service state、service registration status。

- [ ] **Step 1: 写 TTY、窄终端、NO_COLOR、JSON 输出失败测试**

测试环境增加 `TOKENRANK_TEST_TTY=1` 和 `COLUMNS=120/52` 注入；断言宽 TTY 含 `TOKENRANK // LIVE GRID`、ANSI background `\x1b[48;`、Block Art 和 `SCAN MATRIX`；窄终端每行不超过 52 个可见字符；`NO_COLOR=1`、非 TTY、后台与 `preview --json` 不含 `\x1b[`。

- [ ] **Step 2: 运行视觉输出测试并观察旧 Logo 失败**

Run: `pnpm vitest run src/lib/collector/cli.test.ts -t "LIVE GRID|narrow terminal|NO_COLOR|JSON output"`
Expected: FAIL，当前输出没有背景色块、响应式布局或动画模式隔离。

- [ ] **Step 3: 实现能力检测和高饱和渲染器**

```js
function terminalCapabilities(args = []) {
  const tty = process.env.TOKENRANK_TEST_TTY === "1" || process.stdout.isTTY;
  const json = args.includes("--json");
  const colorEnabled = tty && !json && process.env.NO_COLOR !== "1";
  return {
    tty,
    json,
    colorEnabled,
    animated: colorEnabled && process.env.TOKENRANK_NO_ANIMATION !== "1",
    columns: Math.max(40, Number(process.env.COLUMNS || process.stdout.columns || 80)),
  };
}

function rgb(fg, bg, value) {
  if (!activeTerminal.colorEnabled) return value;
  const foreground = `38;2;${fg.join(";")}`;
  const background = bg ? `;48;2;${bg.join(";")}` : "";
  return `\x1b[${foreground}${background}m${value}\x1b[0m`;
}
```

Hero 使用固定 Block Art 形状与逐行渐变；扫描卡片用背景色填充至可用宽度；动画只用 `\r`、erase-line 和短帧更新，不启用 alternate buffer。

- [ ] **Step 4: 将扫描/上传进度连接到真实事件**

`scanLocalUsage` 每完成一个工具调用 renderer；上传每完成一个 batch 更新双层进度条。快速流程装饰延迟总计不超过 600ms；测试模式 `TOKENRANK_NO_ANIMATION=1` 无延迟。

- [ ] **Step 5: 实现 status 与 doctor**

`status` 输出 webhook 是否连接、任务注册、last success、pending boundary、next boundary；`doctor` 逐工具输出 `ready | detected-no-exact-source | unavailable | error`、文件数、原始记录数和去重数，且不输出根路径。

- [ ] **Step 6: 运行完整 CLI 测试**

Run: `pnpm vitest run src/lib/collector/cli.test.ts`
Expected: PASS，JSON 解析测试继续直接 `JSON.parse(stdout)` 成功。

### Task 6: 安装器、文档和最终验证

**Files:**
- Modify: `src/lib/connect/install-script.ts`
- Modify: `src/lib/connect/install-script.test.ts`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Modify: `src/i18n/copy.ts`
- Test: `src/lib/connect/sync-copy.test.tsx`

**Interfaces:**
- Consumes: 新 service install/status 文案、三个新工具、补跑语义。
- Produces: 安装后首次上传、隐藏任务注册、升级旧任务迁移的完整用户路径。

- [ ] **Step 1: 写安装和产品文案失败测试**

断言 Windows 一键脚本仍依次 connect、upload、service install；界面文案包含“后台静默运行”“错过 00:00/12:00 后登录补传”“不会重复计算”；README 列出新工具和精确来源限制。

- [ ] **Step 2: 运行安装与文案测试并观察失败**

Run: `pnpm vitest run src/lib/connect/install-script.test.ts src/lib/connect/sync-copy.test.tsx`
Expected: FAIL，当前文案没有补跑和去重说明。

- [ ] **Step 3: 更新安装器、README、CHANGELOG 和中英文文案**

README 明确：

```text
- Windows 任务在隐藏 PowerShell 中运行，不弹窗。
- 00:00/12:00 错过后，在下次登录时自动补传一次。
- Cursor 原生 Agent、Copilot、Continue 是独立工具；宿主编辑器不改变归属。
- Cursor 个人版缺少精确来源时不会估算或上传。
```

CHANGELOG 新增 `Unreleased` 条目，列出 scheduler、CLI visual、tool adapters、dedupe 和 doctor/status。

- [ ] **Step 4: 验证生成的 PowerShell 可解析**

Run: `pnpm vitest run src/lib/connect/install-script.test.ts`
Expected: PASS，并由测试调用 PowerShell parser 验证脚本文本无语法错误。

- [ ] **Step 5: 运行全量验证**

Run: `pnpm lint`
Expected: exit 0。

Run: `pnpm test -- --runInBand`
Expected: 所有测试 PASS。

Run: `pnpm build`
Expected: exit 0。

Run: `node bin/tokenrank.mjs preview --json`
Expected: stdout 是唯一 JSON 文档，无 ANSI 控制符。

Run: `$env:TOKENRANK_TEST_TTY='1'; $env:COLUMNS='120'; node bin/tokenrank.mjs tools`
Expected: 显示 Block Art、大色块和新工具；退出码 0。

- [ ] **Step 6: 审计需求和工作区边界**

逐项对照设计规格的四个用户目标；用 `git diff --name-only` 确认只修改目标相关文件；确认 README 与 CHANGELOG 已更新；确认未回显任何密钥或原始日志内容。
