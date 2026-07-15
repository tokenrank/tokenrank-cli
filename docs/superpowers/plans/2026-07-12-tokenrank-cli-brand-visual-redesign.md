# TokenRank CLI 品牌视觉重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 TokenRank CLI 从青紫粉 Block Art 霓虹主题重做为与网站一致的骨黑、信号绿、警示橙 Scoreboard Panels，并保持 Windows Terminal、窄终端、NO_COLOR、非 TTY、JSON 和后台运行兼容。

**Architecture:** 保留 `bin/tokenrank.mjs` 单文件可分发架构，在现有 `terminalIsTty`、`terminalColumns`、`useColor`、`useAnimation`、`fitLine` 与单行覆盖机制上替换视觉渲染层。所有行为通过 `src/lib/collector/cli.test.ts` 的真实子进程测试锁定，不修改采集、归属、计分、上传或服务调度数据流。

**Tech Stack:** Node.js ESM、ANSI TrueColor、Windows Terminal/PowerShell、Vitest、pnpm。

## Global Constraints

- 宽终端阈值固定为 72 列；40–71 列使用紧凑布局。
- 颜色只使用 `#070907`、`#F2F1E8`、`#858B80`、`#D6FF3F`、`#FF5B35`、`#0D100E`、`#141814`、`#343A33`。
- 禁止旧色 `#24FFB8`、`#00DAFF`、`#6930FF`、`#FF258D` 及对应 ANSI TrueColor 序列。
- 宽屏品牌文案固定为 `TOKEN/RANK // COLLECTOR`、`BURN TOKENS.`、`ASCEND RANKS.`、`COLLECTOR ONLINE`。
- 移除大型 TOKENRANK ASCII/Block Art、`NEON TOKEN GRID`、`LIVE GRID`、`BOOTING TOKEN GRID` 和 `GRID SYNCHRONIZED`。
- 动画只允许最多 180ms 的短状态点变化、当前扫描项状态变化和单行上传进度覆盖；命令完成后不得持续动画。
- `TOKENRANK_NO_ANIMATION=1`、`NO_COLOR=1`、非 TTY、JSON 和后台模式不得输出动画。
- NO_COLOR 与非 TTY 不输出 Logo 或 ANSI escape sequence；JSON 仍只能输出 JSON。
- 不引入新依赖，不修改 collector 业务逻辑。

---

### Task 1: 用失败测试锁定品牌色、宽屏与紧凑布局

**Files:**
- Modify: `src/lib/collector/cli.test.ts:433-472`
- Modify: `bin/tokenrank.mjs:63-191`
- Test: `src/lib/collector/cli.test.ts`

**Interfaces:**
- Consumes: `runCli(args, home, extraEnv)`、`stripAnsi(value)`、`TOKENRANK_TEST_TTY`、`COLUMNS`、`NO_COLOR`。
- Produces: 宽屏 Scoreboard header、紧凑 header、品牌 TrueColor 输出和无色纯文本降级。

- [ ] **Step 1: 将旧 Neon Grid 测试改成品牌 Scoreboard 失败测试**

```ts
it("renders the TokenRank scoreboard brand in a wide TTY", async () => {
  const home = await tempHome();
  const { stdout } = await runCli(["tools"], home, {
    TOKENRANK_TEST_TTY: "1",
    TOKENRANK_NO_ANIMATION: "1",
    COLUMNS: "120",
  });

  expect(stdout).toContain("TOKEN/RANK // COLLECTOR");
  expect(stdout).toContain("BURN TOKENS.");
  expect(stdout).toContain("ASCEND RANKS.");
  expect(stdout).toContain("COLLECTOR ONLINE");
  expect(stdout).toContain("\u001b[48;2;214;255;63m");
  expect(stdout).toContain("\u001b[38;2;255;91;53m");
  expect(stdout).not.toMatch(/48;2;(36;255;184|0;218;255|105;48;255|255;37;141)m/);
  expect(stdout).not.toContain("████████╗");
});
```

将窄终端测试改为循环验证 40 与 71 列：

```ts
for (const columns of [40, 71]) {
  const { stdout } = await runCli(["tools"], home, {
    TOKENRANK_TEST_TTY: "1",
    TOKENRANK_NO_ANIMATION: "1",
    COLUMNS: String(columns),
  });
  expect(stripAnsi(stdout).split("\n").every((line) => [...line].length <= columns)).toBe(true);
  expect(stdout).toContain("TOKEN/RANK // COLLECTOR");
  expect(stdout).not.toContain("BURN TOKENS.");
}
```

NO_COLOR 断言改为：

```ts
expect(stdout).not.toContain("\u001b[");
expect(stdout).not.toContain("TOKEN/RANK // COLLECTOR");
expect(stdout).toContain("SUPPORTED TOOLS");
```

- [ ] **Step 2: 运行目标测试并确认因旧主题失败**

Run: `pnpm exec vitest run src/lib/collector/cli.test.ts -t "scoreboard brand|compact layout|NO_COLOR"`

Expected: FAIL，输出仍包含 `TOKENRANK // LIVE GRID`、旧 TrueColor 与 Block Art，且缺少新品牌文案。

- [ ] **Step 3: 在 CLI 中定义网站品牌 palette 与基础渲染函数**

在 `bin/tokenrank.mjs` 中用以下常量替换散落 RGB：

```js
const cliPalette = {
  background: [7, 9, 7],
  ivory: [242, 241, 232],
  muted: [133, 139, 128],
  lime: [214, 255, 63],
  orange: [255, 91, 53],
  surface: [13, 16, 14],
  surface2: [20, 24, 20],
  line: [52, 58, 51],
};

function trueColor(value, foreground, background) {
  if (!useColor) return value;
  const backgroundCode = background ? `\x1b[48;2;${background.join(";")}m` : "";
  return `${backgroundCode}\x1b[38;2;${foreground.join(";")}m${value}\x1b[0m`;
}
```

- [ ] **Step 4: 用宽屏 Scoreboard 与紧凑 header 替换 logo**

宽屏 `logo()` 输出：

```js
const lines = [
  trueColor(fitLine("  TOKEN/RANK // COLLECTOR", width), cliPalette.background, cliPalette.lime),
  trueColor("  AI TOKEN LEAGUE // PRIVATE AGGREGATES", cliPalette.muted),
  trueColor("  BURN TOKENS.", cliPalette.ivory),
  trueColor("  ASCEND RANKS.", cliPalette.lime),
  `${trueColor("  01", cliPalette.orange)}  ${trueColor("● COLLECTOR ONLINE", cliPalette.lime)}`,
];
```

紧凑模式只输出 `TOKEN/RANK // COLLECTOR` 与 `● COLLECTOR ONLINE`。`printLogo()` 在 `!useColor` 时直接返回，不输出品牌头。

- [ ] **Step 5: 将 section、step、success 改成深色面板语义**

```js
let sectionIndex = 0;

function printSection(title) {
  console.log("");
  sectionIndex += 1;
  const prefix = String(sectionIndex).padStart(2, "0");
  if (useColor) {
    console.log(`${trueColor(`${prefix} /`, cliPalette.lime)} ${trueColor(title.toUpperCase(), cliPalette.ivory)}`);
  } else {
    console.log(`== ${title.toUpperCase()} ==`);
  }
}
```

`printStep()` 使用信号绿 `■`、象牙白 label、灰绿 detail；`printSuccess()` 使用信号绿 `OK`。不再为普通步骤绘制青色或紫色全宽背景。

- [ ] **Step 6: 运行目标测试确认通过**

Run: `pnpm exec vitest run src/lib/collector/cli.test.ts -t "scoreboard brand|compact layout|NO_COLOR"`

Expected: 3 tests PASS，宽度断言通过且旧色/Block Art 不再出现。

- [ ] **Step 7: 提交品牌布局**

```bash
git add bin/tokenrank.mjs src/lib/collector/cli.test.ts
git commit -m "feat: align CLI visuals with TokenRank brand"
```

---

### Task 2: 收敛启动与上传动效

**Files:**
- Modify: `src/lib/collector/cli.test.ts:1112-1135`
- Modify: `bin/tokenrank.mjs:131-150`
- Modify: `bin/tokenrank.mjs:197-237`
- Modify: `bin/tokenrank.mjs:1905-1913`
- Test: `src/lib/collector/cli.test.ts`

**Interfaces:**
- Consumes: `useAnimation`、`renderUploadGrid(completed, total)`、真实 upload batch 流程。
- Produces: 最多 180ms 的启动状态点、单行 `UPLOAD PROGRESS`、静态 `UPLOAD COMPLETE`。

- [ ] **Step 1: 将旧 Upload Grid 测试改成克制动效失败测试**

```ts
expect(stdout).toContain("COLLECTOR ONLINE");
expect(stdout).toContain("UPLOAD PROGRESS");
expect(stdout).toContain("UPLOAD COMPLETE");
expect(stdout).not.toContain("BOOTING TOKEN GRID");
expect(stdout).not.toContain("GRID SYNCHRONIZED");
expect(stdout).not.toMatch(/48;2;(105;48;255|255;37;141)m/);
```

- [ ] **Step 2: 运行真实上传测试并确认旧动效失败**

Run: `pnpm exec vitest run src/lib/collector/cli.test.ts -t "animates the real upload batch"`

Expected: FAIL，因为输出仍使用 `BOOTING TOKEN GRID`、`UPLOAD GRID`、紫色/粉色背景与 `GRID SYNCHRONIZED`。

- [ ] **Step 3: 将启动动画限制为两个状态点帧**

```js
if (useAnimation) {
  for (const point of ["○", "●"]) {
    process.stdout.write(`\r${trueColor(`  ${point} COLLECTOR STARTING`, cliPalette.lime)}`);
    await sleep(70);
  }
  process.stdout.write("\r\x1b[2K");
}
```

总时长 140ms，不使用背景色，不重绘 Logo。

- [ ] **Step 4: 将上传动画改为单行进度覆盖**

```js
async function renderUploadGrid(completed, total) {
  if (!terminalIsTty) return;
  const width = Math.min(terminalColumns, 104);
  const barWidth = Math.max(10, Math.min(36, width - 34));
  const filled = Math.round((completed / total) * barWidth);
  const bar = `${"█".repeat(filled)}${"░".repeat(barWidth - filled)}`;
  const line = fitLine(`  UPLOAD PROGRESS  [${bar}]  ${completed}/${total}`, width);
  const rendered = trueColor(line, cliPalette.lime);

  if (useAnimation && completed < total) process.stdout.write(`\r${rendered}`);
  else if (useAnimation) process.stdout.write(`\r${rendered}\n`);
  else console.log(rendered);
}
```

上传完成文案改为 `printSuccess("UPLOAD COMPLETE", `${payload.entries.length} rows`)`。

- [ ] **Step 5: 运行真实上传测试与 NO_ANIMATION 回归**

Run: `pnpm exec vitest run src/lib/collector/cli.test.ts -t "animates the real upload batch|NO_COLOR|scoreboard brand"`

Expected: PASS；无旧动效文案或旧色。

- [ ] **Step 6: 提交动效收敛**

```bash
git add bin/tokenrank.mjs src/lib/collector/cli.test.ts
git commit -m "fix: simplify CLI terminal animation"
```

---

### Task 3: 文档同步与全量验证

**Files:**
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Verify: `bin/tokenrank.mjs`
- Verify: `src/lib/collector/cli.test.ts`

**Interfaces:**
- Consumes: 最终 CLI 品牌布局、动效与降级行为。
- Produces: 中文项目说明、变更记录和完整验证证据。

- [ ] **Step 1: 更新 README CLI 说明**

在 Collector CLI 章节增加：CLI 与网站共享骨黑、信号绿和警示橙 Scoreboard Panels；Windows Terminal 不再使用大型 Block Art；`NO_COLOR=1`、非 TTY、JSON 与后台任务保持纯文本/结构化输出。

- [ ] **Step 2: 更新 CHANGELOG**

在 `2026-07-12` 下记录：CLI 视觉统一到网站品牌；移除青紫粉 Block Art；改为克制启动/上传动效；补齐窄终端与 NO_COLOR 回归测试。

- [ ] **Step 3: 扫描旧主题残留**

Run:

```powershell
rg -n -S "NEON TOKEN GRID|LIVE GRID|BOOTING TOKEN GRID|GRID SYNCHRONIZED|36, 255, 184|0, 218, 255|105, 48, 255|255, 37, 141" bin/tokenrank.mjs src/lib/collector/cli.test.ts
```

Expected: 无命中。

- [ ] **Step 4: 运行语法、lint 与全量测试**

Run: `node --check bin/tokenrank.mjs`

Expected: exit code 0。

Run: `pnpm lint`

Expected: exit code 0。

Run: `pnpm test -- --runInBand`

Expected: 20 个测试文件全部 PASS。

- [ ] **Step 5: 运行 production build**

先停止同目录 dev server，运行：`pnpm build`

Expected: exit code 0，所有 App Router routes 构建成功。构建后清理 `.next/dev` 并通过 Doppler 重新启动 `pnpm dev --hostname 0.0.0.0 -p 3000`。

- [ ] **Step 6: 运行真实 Windows TTY 预览检查**

Run:

```powershell
$env:TOKENRANK_TEST_TTY='1'; $env:TOKENRANK_NO_ANIMATION='1'; $env:COLUMNS='100'; node bin/tokenrank.mjs tools
```

Expected: 显示品牌 Scoreboard、信号绿/警示橙面板和 supported tools；无 Block Art 断裂、青紫粉背景或超宽行。

- [ ] **Step 7: 提交文档并确认工作区干净**

```bash
git add README.md CHANGELOG.md
git commit -m "docs: document branded CLI experience"
git status --short
```

Expected: 工作区为空。
