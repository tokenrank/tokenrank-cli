#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { connect as tlsConnect } from "node:tls";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
let nodeSqliteModule = null;
let nodeSqliteLoaded = false;

const TOOL_KEYS = [
  "codex",
  "claude-code",
  "hermes",
  "openclaw",
  "cline",
  "opencode",
  "workbuddy",
  "gemini",
  "zcode",
  "kimi",
  "kilo-code",
  "codex-vps",
  "roo-code",
  "qwen",
  "codex-cache",
  "cursor",
  "github-copilot",
  "continue",
];
const CACHE_INCLUDED_INPUT_TOOLS = new Set(["codex"]);
const DEFAULT_MAX_JSONL_LINE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_JSON_DOCUMENT_BYTES = 64 * 1024 * 1024;
const cliMessages = {
  en: {
    active: "ACTIVE",
    ascendRanks: "ASCEND RANKS.",
    aggregateRows: "aggregate rows",
    allTools: "all tools",
    batch: "batch {current}/{total}: {count} {rows}",
    buildPayload: "Build payload",
    burnTokens: "BURN TOKENS.",
    collectorStarting: "COLLECTOR STARTING",
    commands: "Commands:",
    connect: "Connect",
    connected: "CONNECTED",
    collectionSchedule: "Collection schedule: {schedule}",
    dailySchedule: "daily at 12:00 and 24:00",
    detectedNoRows: "DETECTED / NO TOKEN ROWS",
    done: "DONE",
    error: "ERROR",
    exactSourceRequired: "EXACT SOURCE REQUIRED",
    files: "files",
    gridStatus: "GRID STATUS",
    ignoredInterval: "Ignored --interval: background collection is fixed to {schedule}.",
    installed: "Installed: {file}",
    installedBackgroundService: "Installed background service: {file}",
    invalidDate: "entry.date must be a real date in YYYY-MM-DD format.",
    invalidInterval: "--interval must be an integer of at least 60 seconds.",
    invalidNow: "TOKENRANK_NOW must be a valid date and time.",
    invalidSince: "--since must be YYYY-MM-DD.",
    invalidUsageEntry: "Each usage entry must be an object.",
    invalidUsageInput: "usage JSON must be an array or an object containing an entries array.",
    invalidWebhookProtocol: "The webhook URL must use http or https.",
    invalidWebhookUrl: "The webhook URL is invalid.",
    language: "Language: auto (override with --lang en|zh or TOKENRANK_LANG=en|zh)",
    lastError: "LAST ERROR",
    lastSuccess: "LAST SUCCESS",
    loadedUsageFile: "Loaded usage file",
    localSourceAdapters: "LOCAL SOURCE ADAPTERS",
    localSources: "LOCAL SOURCES",
    missingFile: "Missing the usage.json path after --file.",
    missingOptionValue: "Missing a value for {name}.",
    missingWebhook: "Missing webhook URL. Generate one in the TokenRank dashboard first.",
    never: "NEVER",
    nextBoundary: "NEXT BOUNDARY",
    nextUpload: "next: tokenrank upload",
    noLocalUsage: "No local token usage was found for upload.",
    none: "NONE",
    notConnected: "NOT CONNECTED",
    notInstalled: "Not installed",
    nonNegativeInteger: "{key} must be a non-negative integer.",
    tokenSumOverflow: "Token totals exceed JavaScript's safe integer range.",
    privacy: "PRIVATE CONTENT NEVER LEAVES THIS MACHINE",
    proxyConnectionFailed: "Proxy connection failed: HTTP {status}",
    proxyResponseInvalid: "The proxy response is invalid.",
    publicRankSignal: "PUBLIC RANK SIGNAL",
    rankSignal: "RANK SIGNAL",
    ready: "READY",
    removedWebhook: "Removed local webhook configuration.",
    row: "row",
    rows: "rows",
    savedWebhook: "Saved webhook.",
    scanComplete: "Scan complete",
    scanLocalUsage: "Scan local usage",
    scanning: "Scanning {source}",
    scope: "scope: {scope}",
    serviceInstalled: "SERVICE INSTALLED",
    serviceNotInstalled: "SERVICE NOT INSTALLED",
    skipped: "SKIPPED",
    sourceDiagnostics: "SOURCE DIAGNOSTICS",
    supportedTools: "SUPPORTED TOOLS",
    totalMismatch: "total must match the token accounting rule for this tool.",
    unattributedEmpty: "(empty)",
    unavailable: "UNAVAILABLE",
    uniqueRows: "unique",
    unknownCommand: "Unknown command: {command}",
    unknownServiceCommand: "Unknown service command.",
    unsupportedLanguage: "Unsupported language: {language}. Use en, zh, or auto.",
    unsupportedTool: "Unsupported tool: {tool}",
    unsupportedWebhookProtocol: "Unsupported webhook protocol: {protocol}",
    uninstallService: "Uninstalled background service: {file}",
    upload: "Upload",
    uploadComplete: "UPLOAD COMPLETE",
    uploadEndpoint: "UPLOAD ENDPOINT",
    uploadFailed: "Upload failed: {error}",
    uploadSuccess: "Upload complete: {count} {rows}",
    uploading: "Uploading {count} {rows} in {batches} batch(es)",
    usageDescription: "usage.json may be either { entries: [...] } or an array of aggregate entries.",
    usageTitle: "TokenRank collector",
    webhookConfigMissing: "Run tokenrank connect <webhook-url> first.",
    webhookReady: "Webhook ready",
  },
  zh: {
    active: "活跃",
    ascendRanks: "RANKING 狂飙。",
    aggregateRows: "聚合记录",
    allTools: "全部工具",
    batch: "批次 {current}/{total}：{count} {rows}",
    buildPayload: "构建上传数据",
    burnTokens: "TOKEN 燃烧。",
    collectorStarting: "采集器启动中",
    commands: "命令：",
    connect: "连接",
    connected: "已连接",
    collectionSchedule: "采集时间：{schedule}",
    dailySchedule: "每天 12:00 和 24:00",
    detectedNoRows: "已检测 / 暂无 Token 记录",
    done: "完成",
    error: "错误",
    exactSourceRequired: "需要精确数据源",
    files: "个文件",
    gridStatus: "运行状态",
    ignoredInterval: "已忽略 --interval：后台采集时间固定为{schedule}。",
    installed: "已安装：{file}",
    installedBackgroundService: "已安装后台服务：{file}",
    invalidDate: "entry.date 必须是 YYYY-MM-DD 格式的真实日期。",
    invalidInterval: "--interval 必须是不小于 60 的整数秒。",
    invalidNow: "TOKENRANK_NOW 必须是有效时间。",
    invalidSince: "--since 必须是 YYYY-MM-DD。",
    invalidUsageEntry: "每条 usage entry 必须是对象。",
    invalidUsageInput: "usage JSON 必须是数组，或包含 entries 数组。",
    invalidWebhookProtocol: "webhook URL 必须是 http 或 https。",
    invalidWebhookUrl: "webhook URL 格式不正确。",
    language: "语言：自动（可用 --lang en|zh 或 TOKENRANK_LANG=en|zh 覆盖）",
    lastError: "最近错误",
    lastSuccess: "最近成功",
    loadedUsageFile: "已载入用量文件",
    localSourceAdapters: "本地数据源适配器",
    localSources: "本地来源",
    missingFile: "缺少 --file 后面的 usage.json 路径。",
    missingOptionValue: "缺少 {name} 参数值。",
    missingWebhook: "缺少 webhook URL。请先在 TokenRank 仪表盘生成 webhook。",
    never: "从未",
    nextBoundary: "下次采集时间",
    nextUpload: "下一步：tokenrank upload",
    noLocalUsage: "没有发现可上传的本地 Token 统计。",
    none: "无",
    notConnected: "未连接",
    notInstalled: "未安装",
    nonNegativeInteger: "{key} 必须是非负整数。",
    tokenSumOverflow: "Token 总数超出 JavaScript 安全整数范围。",
    privacy: "私密内容绝不离开本机",
    proxyConnectionFailed: "代理连接失败：HTTP {status}",
    proxyResponseInvalid: "代理响应格式不正确。",
    publicRankSignal: "公开排名信号",
    rankSignal: "排名信号",
    ready: "就绪",
    removedWebhook: "已移除本机 webhook 配置。",
    row: "条记录",
    rows: "条记录",
    savedWebhook: "已保存 webhook。",
    scanComplete: "扫描完成",
    scanLocalUsage: "扫描本地用量",
    scanning: "正在扫描 {source}",
    scope: "范围：{scope}",
    serviceInstalled: "后台服务已安装",
    serviceNotInstalled: "后台服务未安装",
    skipped: "跳过",
    sourceDiagnostics: "数据源诊断",
    supportedTools: "支持的工具",
    totalMismatch: "total 必须匹配该工具的 Token 统计口径。",
    unattributedEmpty: "（空）",
    unavailable: "不可用",
    uniqueRows: "去重记录",
    unknownCommand: "未知命令：{command}",
    unknownServiceCommand: "未知 service 命令。",
    unsupportedLanguage: "不支持的语言：{language}。请使用 en、zh 或 auto。",
    unsupportedTool: "不支持的工具：{tool}",
    unsupportedWebhookProtocol: "不支持的 webhook 协议：{protocol}",
    uninstallService: "已卸载后台服务：{file}",
    upload: "上传",
    uploadComplete: "上传完成",
    uploadEndpoint: "上传端点",
    uploadFailed: "上传失败：{error}",
    uploadSuccess: "上传成功：{count} {rows}",
    uploading: "正在上传 {count} {rows}，共 {batches} 个批次",
    usageDescription: "usage.json 可以是 { entries: [...] }，也可以是聚合记录数组。",
    usageTitle: "TokenRank 采集器",
    webhookConfigMissing: "请先运行 tokenrank connect <webhook-url>。",
    webhookReady: "webhook 已就绪",
  },
};

function assertCliMessageParity() {
  const englishKeys = Object.keys(cliMessages.en).sort();
  const chineseKeys = Object.keys(cliMessages.zh).sort();

  if (englishKeys.join("\n") !== chineseKeys.join("\n")) {
    throw new Error("TokenRank CLI translation keys are incomplete.");
  }

  for (const key of englishKeys) {
    const englishValues = [...cliMessages.en[key].matchAll(/\{([a-zA-Z]+)\}/g)]
      .map((match) => match[1])
      .sort();
    const chineseValues = [...cliMessages.zh[key].matchAll(/\{([a-zA-Z]+)\}/g)]
      .map((match) => match[1])
      .sort();

    if (englishValues.join("\n") !== chineseValues.join("\n")) {
      throw new Error(`TokenRank CLI translation placeholders do not match: ${key}`);
    }
  }
}

assertCliMessageParity();

function localeFromTag(value) {
  const normalized = String(value ?? "").trim().replaceAll("_", "-").toLowerCase();
  if (!normalized || normalized === "auto") return null;
  if (normalized === "zh" || normalized.startsWith("zh-")) return "zh";
  if (normalized === "en" || normalized.startsWith("en-")) return "en";
  return null;
}

function detectSystemLocale() {
  const localeTag =
    process.env.LC_ALL ||
    process.env.LC_MESSAGES ||
    process.env.LANG ||
    Intl.DateTimeFormat().resolvedOptions().locale;
  return localeFromTag(localeTag) ?? "en";
}

function detectCliLocale() {
  const configured = String(process.env.TOKENRANK_LANG ?? "").trim();
  return configured && configured.toLowerCase() !== "auto"
    ? localeFromTag(configured) ?? detectSystemLocale()
    : detectSystemLocale();
}

let cliLocale = detectCliLocale();

function message(key, values = {}) {
  const template = cliMessages[cliLocale][key];
  if (typeof template !== "string") {
    throw new Error(`Missing ${cliLocale} CLI translation: ${key}`);
  }

  return template.replace(/\{([a-zA-Z]+)\}/g, (_, name) => String(values[name] ?? `{${name}}`));
}

function rowLabel(count) {
  return message(count === 1 ? "row" : "rows");
}

function parseGlobalOptions(argv) {
  const args = [];
  let requestedLanguage = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--lang") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        throw new Error(message("missingOptionValue", { name: "--lang" }));
      }
      requestedLanguage = value;
      index += 1;
      continue;
    }

    if (arg.startsWith("--lang=")) {
      const value = arg.slice("--lang=".length);
      if (!value) {
        throw new Error(message("missingOptionValue", { name: "--lang" }));
      }
      requestedLanguage = value;
      continue;
    }

    args.push(arg);
  }

  if (requestedLanguage) {
    if (requestedLanguage.toLowerCase() === "auto") {
      cliLocale = detectSystemLocale();
    } else {
      const locale = localeFromTag(requestedLanguage);
      if (!locale) {
        throw new Error(message("unsupportedLanguage", { language: requestedLanguage }));
      }
      cliLocale = locale;
    }
  }

  return args;
}

function unattributedModelForTool(tool) {
  return `${tool}-unattributed`;
}

function isUnknownModel(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return !normalized || normalized === "unknown" || normalized === "undefined" || normalized === "null";
}

function normalizeModel(value, tool) {
  const model = typeof value === "string" ? value.trim() : "";
  return isUnknownModel(model) ? unattributedModelForTool(tool) : model;
}

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = await readCliPackageJson([
  path.join(cliDir, "package.json"),
  path.resolve(cliDir, "..", "package.json"),
  path.join(process.env.TOKENRANK_HOME ?? path.join(homedir(), ".tokenrank"), "package.json"),
]);
const clientVersion = String(packageJson.version ?? "0.0.0");
const defaultCollectorIntervalSeconds = 12 * 60 * 60;
const collectorScheduleHours = [0, 12];
const terminalIsTty = process.env.TOKENRANK_TEST_TTY === "1" || Boolean(process.stdout.isTTY);
const terminalColumns = Math.max(40, Number(process.env.COLUMNS || process.stdout.columns || 80));
const useColor = process.env.NO_COLOR !== "1" && terminalIsTty;
const useAnimation = useColor && process.env.TOKENRANK_NO_ANIMATION !== "1";
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
const scoreboardMaxWidth = 50;
let sectionIndex = 0;

function fitLine(value, width) {
  const trimmed = trimLine(value, width);
  return `${trimmed}${" ".repeat(Math.max(0, width - displayWidth(trimmed)))}`;
}

function trimLine(value, width) {
  let result = "";
  let currentWidth = 0;

  for (const character of value) {
    const characterWidth = isFullWidthCodePoint(character.codePointAt(0) ?? 0) ? 2 : 1;
    if (currentWidth + characterWidth > Math.max(0, width)) {
      break;
    }
    result += character;
    currentWidth += characterWidth;
  }

  return result;
}

function displayWidth(value) {
  return [...value].reduce(
    (width, character) => width + (isFullWidthCodePoint(character.codePointAt(0) ?? 0) ? 2 : 1),
    0,
  );
}

function isFullWidthCodePoint(codePoint) {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe19) ||
      (codePoint >= 0xfe30 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0xffe0 && codePoint <= 0xffe6))
  );
}

function scoreboardWidth() {
  return Math.min(terminalColumns, scoreboardMaxWidth);
}

function trueColor(value, foreground, background) {
  if (!useColor) {
    return value;
  }

  const backgroundCode = background ? `\x1b[48;2;${background.join(";")}m` : "";
  return `${backgroundCode}\x1b[38;2;${foreground.join(";")}m${value}\x1b[0m`;
}

function panelLine(left, right = "", options = {}) {
  const innerWidth = Math.max(1, scoreboardWidth() - 4);
  const safeRight = trimLine(right, Math.max(0, innerWidth - 1));
  const leftWidth = Math.max(0, innerWidth - displayWidth(safeRight) - (safeRight ? 1 : 0));
  const leftValue = options.leftSegments?.map((segment) => segment.value).join("") ?? left;
  const safeLeft = trimLine(leftValue, leftWidth);
  const gap = " ".repeat(Math.max(0, innerWidth - displayWidth(safeLeft) - displayWidth(safeRight)));
  const borderColor = options.accent ? cliPalette.orange : cliPalette.line;
  let renderedLeft = trueColor(safeLeft, options.leftColor ?? cliPalette.ivory);

  if (options.leftSegments) {
    let remaining = leftWidth;
    renderedLeft = options.leftSegments
      .map((segment) => {
        const value = trimLine(segment.value, remaining);
        remaining -= displayWidth(value);
        return trueColor(value, segment.color);
      })
      .join("");
  }

  return `${trueColor("│ ", borderColor)}${renderedLeft}${gap}${trueColor(safeRight, options.rightColor ?? cliPalette.lime)}${trueColor(" │", cliPalette.line)}`;
}

function printPanel(rows, options = {}) {
  const width = scoreboardWidth();
  const border = `┌${"─".repeat(Math.max(0, width - 2))}┐`;
  const footer = `└${"─".repeat(Math.max(0, width - 2))}┘`;

  console.log("");
  console.log(trueColor(border, cliPalette.line));
  for (const row of rows) {
    console.log(panelLine(row.left, row.right, { ...row, accent: options.accent }));
  }
  console.log(trueColor(footer, cliPalette.line));
}

function renderConnectionPanel(host) {
  printPanel([
    { left: message("uploadEndpoint"), right: message("connected"), leftColor: cliPalette.muted },
    { left: host, leftColor: cliPalette.ivory },
  ]);
}

function renderSourceProgress(label, completed, total) {
  if (!useAnimation) {
    return;
  }

  const counter = `${String(completed).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
  const line = fitLine(`${message("localSources")}  ${counter}  ${label.toUpperCase()}`, scoreboardWidth());
  process.stdout.write(`\r${trueColor(line, cliPalette.muted)}`);
}

function clearSourceProgress() {
  if (useAnimation) {
    process.stdout.write("\r\x1b[2K");
  }
}

function renderSourcesPanel(sourceStats) {
  const active = sourceStats.filter((source) => source.entryCount > 0);
  const skipped = sourceStats.length - active.length;
  const rows = [
    {
      left: message("localSources"),
      right: `${String(sourceStats.length).padStart(2, "0")} / ${String(sourceStats.length).padStart(2, "0")}`,
      leftColor: cliPalette.muted,
      rightColor: cliPalette.muted,
    },
  ];

  for (const source of sourceStats.slice(0, 2)) {
    const hasUsage = source.entryCount > 0;
    const filledBar = hasUsage ? "██████████" : "";
    const emptyBar = hasUsage ? "░░░░" : "░░░░░░░░░░░░░░";
    rows.push({
      left: `${source.label} ${filledBar}${emptyBar}`,
      leftSegments: [
        { value: `${source.label} `, color: hasUsage ? cliPalette.ivory : cliPalette.muted },
        { value: filledBar, color: cliPalette.lime },
        { value: emptyBar, color: cliPalette.muted },
      ],
      right: hasUsage ? message("done") : message("skipped"),
      leftColor: hasUsage ? cliPalette.ivory : cliPalette.muted,
      rightColor: hasUsage ? cliPalette.lime : cliPalette.muted,
    });
  }

  rows.push({
    left: `${active.length} ${message("active")}`,
    right: `${skipped} ${message("skipped")}`,
    leftColor: cliPalette.lime,
    rightColor: cliPalette.muted,
  });
  printPanel(rows);
}

function renderPrivacyPanel() {
  printPanel(
    [{ left: message("privacy"), leftColor: cliPalette.orange }],
    { accent: true },
  );
}

function logo() {
  const width = scoreboardWidth();
  const compact = terminalColumns < 72;
  const liveLabel = "TOKEN/RANK // LIVE";
  const liveRank = "01";
  const liveBand = `${liveLabel}${" ".repeat(Math.max(1, width - displayWidth(liveLabel) - displayWidth(liveRank)))}${liveRank}`;

  if (compact) {
    return trueColor(fitLine(liveBand, width), cliPalette.background, cliPalette.lime);
  }

  const burn = `  ${message("burnTokens")}`;
  const rankGap = " ".repeat(Math.max(1, width - displayWidth(burn) - displayWidth(liveRank)));
  const lines = [
    trueColor(fitLine(liveBand, width), cliPalette.background, cliPalette.lime),
    trueColor(fitLine(`  ${message("publicRankSignal")}`, width), cliPalette.muted),
    "",
    `${trueColor(burn, cliPalette.ivory)}${rankGap}${trueColor(liveRank, cliPalette.orange)}`,
    trueColor(fitLine(`  ${message("ascendRanks")}`, width), cliPalette.lime),
  ];

  return lines.join("\n");
}

async function printLogo() {
  if (process.env.TOKENRANK_NO_LOGO === "1" || !useColor) {
    return;
  }

  if (useAnimation) {
    for (const point of ["○", "●"]) {
      process.stdout.write(`\r${trueColor(`  ${point} ${message("collectorStarting")}`, cliPalette.lime)}`);
      await sleep(70);
    }
    process.stdout.write("\r\x1b[2K");
  }

  console.log(logo());
}

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

function printStep(label, detail = "") {
  if (useColor) {
    const width = Math.min(terminalColumns, 104);
    const prefix = "  ■ ";
    const body = fitLine(`${label}${detail ? `  ${detail}` : ""}`, Math.max(1, width - [...prefix].length));
    console.log(`${trueColor(prefix, cliPalette.lime, cliPalette.surface2)}${trueColor(body, cliPalette.ivory, cliPalette.surface2)}`);
  } else {
    console.log(`-> ${label}${detail ? ` ${detail}` : ""}`);
  }
}

function printSuccess(label, detail = "") {
  if (useColor) {
    console.log(`${trueColor("OK", cliPalette.lime)} ${trueColor(`${label}${detail ? `  ·  ${detail}` : ""}`, cliPalette.ivory)}`);
  } else {
    console.log(`OK ${label}${detail ? ` ${detail}` : ""}`);
  }
}

function printMuted(label) {
  console.log(trueColor(label, cliPalette.muted));
}

async function renderUploadGrid(completed, total, entryCount) {
  if (!useColor) {
    return;
  }

  const width = scoreboardWidth();
  const barWidth = Math.max(10, Math.min(18, width - 28));
  const filled = Math.round((completed / total) * barWidth);
  const bar = `${"█".repeat(filled)}${"░".repeat(barWidth - filled)}`;

  if (useAnimation && completed < total) {
    const line = fitLine(`${message("rankSignal")}  ${bar}  ${completed}/${total}`, width);
    process.stdout.write(`\r${trueColor(line, cliPalette.lime)}`);
    return;
  }

  if (useAnimation) {
    process.stdout.write("\r\x1b[2K");
  }

  const percent = Math.round((completed / total) * 100);
  printPanel([
    { left: message("rankSignal"), right: message("uploadComplete"), leftColor: cliPalette.muted },
    { left: bar, right: `${percent}% / ${entryCount} ${rowLabel(entryCount)}`, leftColor: cliPalette.lime },
  ]);
}

async function readCliPackageJson(candidates) {
  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, "utf8"));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
  }

  return {};
}

function usage() {
  return [
    message("usageTitle"),
    "",
    message("commands"),
    "  tokenrank tools",
    "  tokenrank sources",
    "  tokenrank status",
    "  tokenrank doctor",
    "  tokenrank preview [--json] [--tool tool-id] [--since YYYY-MM-DD]",
    "  tokenrank connect <webhook-url>",
    "  tokenrank logout",
    "  tokenrank upload [--file usage.json] [--tool tool-id] [--since YYYY-MM-DD]",
    "  tokenrank daemon [--interval seconds] [--once]",
    "  tokenrank service install",
    "  tokenrank service status",
    "  tokenrank service uninstall",
    "",
    message("language"),
    message("usageDescription"),
  ].join("\n");
}

function sourceDefinitions() {
  const home = homedir();
  const platform = process.env.TOKENRANK_TEST_PLATFORM || process.platform;
  const appSupport = path.join(home, "Library", "Application Support");
  const editorData =
    platform === "win32"
      ? process.env.APPDATA ?? path.join(home, "AppData", "Roaming")
      : platform === "darwin"
        ? appSupport
        : process.env.XDG_CONFIG_HOME ?? path.join(home, ".config");
  const codeStorage = path.join(editorData, "Code", "User", "globalStorage");
  const cursorStorage = path.join(editorData, "Cursor", "User", "globalStorage");
  const codeLogs = path.join(editorData, "Code", "logs");
  const cursorLogs = path.join(editorData, "Cursor", "logs");
  const xdgData = process.env.XDG_DATA_HOME ?? path.join(home, ".local", "share");

  return [
    {
      tool: "codex",
      label: "Codex",
      roots: [
        path.join(process.env.CODEX_HOME ?? path.join(home, ".codex"), "sessions"),
        path.join(process.env.CODEX_HOME ?? path.join(home, ".codex"), "archived_sessions"),
      ],
    },
    {
      tool: "claude-code",
      label: "Claude Code",
      roots: [
        path.join(home, ".claude", "projects"),
        path.join(appSupport, "Claude", "local-agent-mode-sessions"),
      ],
    },
    {
      tool: "hermes",
      label: "Hermes",
      roots: [path.join(home, ".hermes", "sessions"), path.join(home, ".hermes", "logs")],
    },
    {
      tool: "openclaw",
      label: "OpenClaw",
      roots: [path.join(home, ".openclaw", "agents"), path.join(home, ".openclaw", "sessions")],
    },
    {
      tool: "cline",
      label: "Cline",
      roots: [
        path.join(codeStorage, "saoudrizwan.claude-dev", "tasks"),
        path.join(cursorStorage, "saoudrizwan.claude-dev", "tasks"),
        path.join(home, ".cline", "sessions"),
      ],
    },
    {
      tool: "opencode",
      label: "opencode",
      roots: [path.join(xdgData, "opencode"), path.join(home, ".opencode", "sessions")],
    },
    {
      tool: "workbuddy",
      label: "WorkBuddy",
      roots: [path.join(home, ".workbuddy", "traces"), path.join(home, ".workbuddy", "sessions")],
    },
    {
      tool: "gemini",
      label: "Gemini CLI",
      roots: [path.join(process.env.GEMINI_CLI_HOME ?? path.join(home, ".gemini"), "tmp")],
    },
    {
      tool: "zcode",
      label: "ZCode",
      roots: [path.join(home, ".zcode", "sessions"), path.join(home, ".zcode", "cli", "logs")],
    },
    {
      tool: "kimi",
      label: "Kimi CLI",
      roots: [path.join(home, ".kimi", "sessions"), path.join(home, ".kimi-code", "sessions")],
    },
    {
      tool: "kilo-code",
      label: "Kilo Code",
      roots: [
        path.join(codeStorage, "kilocode.kilo-code", "tasks"),
        path.join(cursorStorage, "kilocode.kilo-code", "tasks"),
        path.join(home, ".kilo-code", "sessions"),
      ],
    },
    {
      tool: "codex-vps",
      label: "Codex VPS",
      roots: [path.join(home, ".codex-vps", "sessions"), path.join(home, ".codex-vps", "logs")],
    },
    {
      tool: "roo-code",
      label: "Roo Code",
      roots: [
        path.join(codeStorage, "rooveterinaryinc.roo-cline", "tasks"),
        path.join(cursorStorage, "rooveterinaryinc.roo-cline", "tasks"),
        path.join(home, ".roo-code", "sessions"),
      ],
    },
    {
      tool: "qwen",
      label: "Qwen CLI",
      roots: [path.join(home, ".qwen", "sessions"), path.join(home, ".qwen", "logs")],
    },
    {
      tool: "codex-cache",
      label: "Codex Cache",
      roots: [path.join(process.env.CODEX_HOME ?? path.join(home, ".codex"), "cache")],
    },
    {
      tool: "cursor",
      label: "Cursor",
      roots: [
        path.join(home, ".tokenrank", "imports", "cursor-usage.json"),
        path.join(home, ".cursor", "usage"),
      ],
      priority: 300,
    },
    {
      tool: "github-copilot",
      label: "GitHub Copilot",
      roots: [
        path.join(home, ".copilot", "logs"),
        path.join(home, ".copilot", "telemetry"),
        codeLogs,
        cursorLogs,
      ],
      priority: 250,
      includeLogs: true,
      includeFile: (file) =>
        file.includes(`${path.sep}.copilot${path.sep}`) || /github[.-]copilot/i.test(file),
    },
    {
      tool: "continue",
      label: "Continue",
      roots: [path.join(home, ".continue", "sessions")],
      priority: 250,
    },
  ];
}

function configPath() {
  return process.env.TOKENRANK_CONFIG ?? path.join(homedir(), ".tokenrank", "config.json");
}

function serviceStatePath() {
  return path.join(homedir(), ".tokenrank", "service-state.json");
}

function collectorLockPath() {
  return path.join(homedir(), ".tokenrank", "collector.lock");
}

function currentTime() {
  const configured = process.env.TOKENRANK_NOW;
  const value = configured ? new Date(configured) : new Date();

  if (!Number.isFinite(value.getTime())) {
    throw new Error(message("invalidNow"));
  }

  return value;
}

function latestScheduleBoundary(now = currentTime()) {
  const boundary = new Date(now);
  boundary.setMinutes(0, 0, 0);
  boundary.setHours(now.getHours() >= 12 ? 12 : 0);
  return boundary;
}

async function readServiceState() {
  try {
    return JSON.parse(await readFile(serviceStatePath(), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return {};
    }

    throw error;
  }
}

async function writeServiceState(state) {
  const file = serviceStatePath();
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

async function recordSuccessfulLocalUpload(now = currentTime()) {
  const state = await readServiceState();
  await writeServiceState({
    ...state,
    lastAttemptAt: now.toISOString(),
    lastSuccessfulAt: now.toISOString(),
    lastScheduledBoundary: latestScheduleBoundary(now).toISOString(),
    lastErrorCode: null,
  });
}

async function collectorLockIsStale(file) {
  try {
    const lock = JSON.parse(await readFile(file, "utf8"));
    const createdAt = new Date(lock.createdAt).getTime();
    const expired = !Number.isFinite(createdAt) || currentTime().getTime() - createdAt > 2 * 60 * 60 * 1000;

    if (expired) {
      return true;
    }

    if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0) {
      return true;
    }

    try {
      process.kill(lock.pid, 0);
      return false;
    } catch (error) {
      return error?.code === "ESRCH";
    }
  } catch {
    return true;
  }
}

async function withCollectorLock(operation) {
  const file = collectorLockPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });

  try {
    await writeFile(file, `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } catch (error) {
    if (error?.code === "EEXIST") {
      if (await collectorLockIsStale(file)) {
        await rm(file, { force: true });
        return withCollectorLock(operation);
      }

      return { skipped: true, reason: "locked" };
    }

    throw error;
  }

  try {
    return await operation();
  } finally {
    await rm(file, { force: true });
  }
}

async function readConfig() {
  const file = configPath();

  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error(message("webhookConfigMissing"));
  }
}

async function writeConfig(config) {
  const file = configPath();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

async function removeConfig() {
  await rm(configPath(), { force: true });
  console.log(message("removedWebhook"));
}

function requireWebhookUrl(value) {
  if (!value) {
    throw new Error(message("missingWebhook"));
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error(message("invalidWebhookUrl"));
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(message("invalidWebhookProtocol"));
  }

  return url.toString();
}

function getTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getDeviceId() {
  const stableInput = `${hostname()}:${homedir()}`;
  const hash = createHash("sha256").update(stableInput).digest("hex").slice(0, 32);
  return `tokenrank-${hash}`;
}

function readOptionalNumber(record, keys) {
  for (const key of keys) {
    const value = record[key];

    if (value !== undefined) {
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(message("nonNegativeInteger", { key }));
      }

      return value;
    }
  }

  return null;
}

function safeTokenSum(...values) {
  let total = 0;

  for (const value of values) {
    const next = total + value;

    if (!Number.isSafeInteger(next) || next < 0) {
      throw new Error(message("tokenSumOverflow"));
    }

    total = next;
  }

  return total;
}

function sumNumbers(record, keys) {
  let total = 0;

  for (const key of keys) {
    const value = record[key];

    if (value === undefined) {
      continue;
    }

    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(message("nonNegativeInteger", { key }));
    }

    total = safeTokenSum(total, value);
  }

  return total;
}

function readNumber(record, keys) {
  return readOptionalNumber(record, keys) ?? 0;
}

function inputIncludesCacheRead(tool) {
  return CACHE_INCLUDED_INPUT_TOOLS.has(tool);
}

function canonicalTotalFor(tool, input, output, cacheRead, cacheWrite) {
  if (inputIncludesCacheRead(tool)) {
    return safeTokenSum(input, output);
  }

  return safeTokenSum(input, output, cacheRead, cacheWrite);
}

function legacySummedTotal(input, output, cacheRead, cacheWrite) {
  return safeTokenSum(input, output, cacheRead, cacheWrite);
}

function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function normalizeEntry(rawEntry) {
  if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
    throw new Error(message("invalidUsageEntry"));
  }

  const entry = rawEntry;
  const date = typeof entry.date === "string" ? entry.date : "";

  if (!isIsoCalendarDate(date)) {
    throw new Error(message("invalidDate"));
  }

  const tool = typeof entry.tool === "string" ? entry.tool : "";

  if (!TOOL_KEYS.includes(tool)) {
    throw new Error(message("unsupportedTool", { tool: tool || message("unattributedEmpty") }));
  }

  const model = normalizeModel(entry.model, tool);
  const input = readNumber(entry, ["input", "inputTokens"]);
  const output = readNumber(entry, ["output", "outputTokens"]);
  const cacheRead = readNumber(entry, ["cacheRead", "cacheReadTokens"]);
  const cacheWrite = readNumber(entry, ["cacheWrite", "cacheWriteTokens"]);
  const inferredTotal = canonicalTotalFor(tool, input, output, cacheRead, cacheWrite);
  const legacyTotal = legacySummedTotal(input, output, cacheRead, cacheWrite);
  const providedTotal = readOptionalNumber(entry, ["total", "totalTokens"]);
  const total = providedTotal ?? inferredTotal;

  if (total !== inferredTotal && total !== legacyTotal) {
    throw new Error(message("totalMismatch"));
  }

  return {
    date,
    tool,
    model,
    input,
    output,
    cacheRead,
    cacheWrite,
    total: inferredTotal,
  };
}

function localCalendarDate(parsed) {
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromValue(value) {
  if (typeof value === "string") {
    if (isIsoCalendarDate(value)) {
      return value;
    }

    const parsed = new Date(value);

    if (Number.isFinite(parsed.getTime())) {
      return localCalendarDate(parsed);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);

    if (Number.isFinite(parsed.getTime())) {
      return localCalendarDate(parsed);
    }
  }

  return null;
}

function pickDate(record, fallbackDate) {
  for (const key of ["date", "timestamp", "createdAt", "created_at", "startedAt", "started_at", "current_date"]) {
    const date = dateFromValue(record[key]);

    if (date) {
      return date;
    }
  }

  return fallbackDate;
}

function pickModel(record, fallbackModel) {
  for (const key of ["model", "modelId", "model_id", "modelName", "model_name"]) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return fallbackModel;
}

function pickProviderEventId(record, fallbackId = null) {
  for (const key of [
    "providerEventId",
    "provider_event_id",
    "requestId",
    "request_id",
    "eventId",
    "event_id",
    "id",
  ]) {
    const value = record[key];

    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallbackId;
}

function pickOccurredAt(record, fallbackValue = null) {
  for (const key of ["timestamp", "createdAt", "created_at", "startedAt", "started_at", "date"]) {
    const value = record[key];

    if (typeof value === "string" || typeof value === "number") {
      return String(value);
    }
  }

  return fallbackValue;
}

function usageFromRecord(record, tool) {
  const input = readNumber(record, [
    "input",
    "inputTokens",
    "input_tokens",
    "prompt_tokens",
    "promptTokenCount",
    "prompt_token_count",
    "tokensIn",
    "tokens_in",
  ]);
  const aggregateOutput = readOptionalNumber(record, [
    "output",
    "outputTokens",
    "output_tokens",
    "completion_tokens",
    "candidatesTokenCount",
    "candidates_token_count",
    "tokensOut",
    "tokens_out",
  ]);
  const detailOutput = sumNumbers(record, [
    "reasoning_output_tokens",
    "reasoningTokens",
    "reasoning_tokens",
    "thoughtsTokenCount",
    "thoughts_tokens",
  ]);
  const output = aggregateOutput ?? detailOutput;
  const cacheRead = sumNumbers(record, [
    "cacheRead",
    "cacheReadTokens",
    "cache_read_tokens",
    "cache_read_input_tokens",
    "cached_tokens",
    "cached_input_tokens",
    "cachedContentTokenCount",
    "cacheReads",
    "cache_reads",
  ]);
  const cacheWrite = sumNumbers(record, [
    "cacheWrite",
    "cacheWriteTokens",
    "cache_write_tokens",
    "cache_creation_input_tokens",
    "cacheCreationInputTokens",
    "cache_creation_tokens",
    "cacheWrites",
    "cache_writes",
  ]);
  const total = canonicalTotalFor(tool, input, output, cacheRead, cacheWrite);
  const observedTokens = input + output + cacheRead + cacheWrite;

  return total > 0 && observedTokens > 0 ? { input, output, cacheRead, cacheWrite, total } : null;
}

function extractEntriesFromValue(value, tool, fallbackDate, baseContext = {}) {
  const entries = [];

  function walk(node, context, keyPath) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child, context, keyPath);
      }

      return;
    }

    const record = node;
    const nextContext = {
      date: pickDate(record, context.date),
      model: pickModel(record, context.model),
      providerEventId: pickProviderEventId(record, context.providerEventId),
      occurredAt: pickOccurredAt(record, context.occurredAt),
    };
    const leafKey = keyPath.at(-1) ?? "";

    // Codex and several tools keep cumulative totals beside per-call usage.
    // Upload only local deltas when both are present.
    if (!/total_token_usage|totalUsage|aggregate/i.test(leafKey)) {
      const usage = usageFromRecord(record, tool);

      if (usage && nextContext.date) {
        entries.push({
          date: nextContext.date,
          tool,
          model: normalizeModel(nextContext.model, tool),
          providerEventId: nextContext.providerEventId,
          occurredAt: nextContext.occurredAt,
          ...usage,
        });
      }
    }

    for (const [key, child] of Object.entries(record)) {
      if (child && typeof child === "object") {
        walk(child, nextContext, [...keyPath, key]);
      }
    }
  }

  walk(
    value,
    {
      date: baseContext.date ?? fallbackDate,
      model: baseContext.model ?? null,
      providerEventId: baseContext.providerEventId ?? null,
      occurredAt: baseContext.occurredAt ?? null,
    },
    [],
  );

  return entries;
}

function otelAttribute(attributes, key) {
  if (!Array.isArray(attributes)) {
    return null;
  }

  const attribute = attributes.find((item) => item?.key === key);
  const value = attribute?.value;

  if (typeof value === "string" || typeof value === "number") {
    return value;
  }

  for (const field of ["stringValue", "intValue", "doubleValue"]) {
    if (typeof value?.[field] === "string" || typeof value?.[field] === "number") {
      return value[field];
    }
  }

  return null;
}

function dateFromUnixNano(value, fallbackDate) {
  try {
    const milliseconds = Number(BigInt(String(value)) / 1_000_000n);
    const parsed = new Date(milliseconds);
    return Number.isFinite(parsed.getTime()) ? localCalendarDate(parsed) : fallbackDate;
  } catch {
    return fallbackDate;
  }
}

function extractCopilotOtelEntries(value, fallbackDate) {
  const entries = [];
  let sequence = 0;

  function walk(node) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }
      return;
    }

    if (node.name === "gen_ai.client.token.usage") {
      const points = node.data?.dataPoints ?? node.dataPoints ?? [];

      for (const point of points) {
        const tokenType = String(otelAttribute(point.attributes, "gen_ai.token.type") ?? "");
        const amount = Number(point.sum ?? point.value ?? point.asInt ?? 0);

        if ((tokenType !== "input" && tokenType !== "output") || !Number.isSafeInteger(amount) || amount <= 0) {
          continue;
        }

        const model = String(
          otelAttribute(point.attributes, "gen_ai.request.model") ??
            otelAttribute(point.attributes, "gen_ai.response.model") ??
            unattributedModelForTool("github-copilot"),
        );
        const occurredAt = String(point.timeUnixNano ?? point.startTimeUnixNano ?? "");
        const input = tokenType === "input" ? amount : 0;
        const output = tokenType === "output" ? amount : 0;
        entries.push({
          date: dateFromUnixNano(occurredAt, fallbackDate),
          tool: "github-copilot",
          model: normalizeModel(model, "github-copilot"),
          input,
          output,
          cacheRead: 0,
          cacheWrite: 0,
          total: input + output,
          occurredAt,
          providerEventId: `otel:${occurredAt}:${model}:${tokenType}:${sequence}`,
        });
        sequence += 1;
      }
    }

    for (const child of Object.values(node)) {
      if (child && typeof child === "object") {
        walk(child);
      }
    }
  }

  walk(value);
  return entries;
}

function extractContextFromValue(value, baseContext) {
  const nextContext = {
    date: baseContext.date,
    model: baseContext.model,
  };

  function walk(node, context) {
    if (!node || typeof node !== "object") {
      return;
    }

    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child, context);
      }

      return;
    }

    const record = node;
    const date = pickDate(record, context.date);
    const model = pickModel(record, context.model);
    const providerEventId = pickProviderEventId(record, context.providerEventId);
    const occurredAt = pickOccurredAt(record, context.occurredAt);
    const childContext = { date, model, providerEventId, occurredAt };

    if (date) {
      nextContext.date = date;
    }

    if (model) {
      nextContext.model = model;
    }

    for (const child of Object.values(record)) {
      if (child && typeof child === "object") {
        walk(child, childContext);
      }
    }
  }

  walk(value, baseContext);

  return nextContext;
}

async function pathExists(file) {
  try {
    return await stat(file);
  } catch {
    return null;
  }
}

function isScannableFile(file, options = {}) {
  return (
    file.endsWith(".json") ||
    file.endsWith(".jsonl") ||
    file.endsWith(".db") ||
    file.endsWith(".sqlite") ||
    (options.includeLogs && file.endsWith(".log"))
  );
}

async function collectFiles(root, maxFiles = 1000, options = {}) {
  const rootStat = await pathExists(root);

  if (!rootStat) {
    return [];
  }

  if (rootStat.isFile()) {
    return isScannableFile(root, options) ? [root] : [];
  }

  const files = [];
  const queue = [root];

  while (queue.length && files.length < maxFiles) {
    const current = queue.shift();
    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (entry.isFile() && isScannableFile(fullPath, options)) {
        files.push(fullPath);

        if (files.length >= maxFiles) {
          break;
        }
      }
    }
  }

  return files;
}

function sourceEntry(entry, file, source, index) {
  return {
    ...entry,
    sourceId: source.id,
    sourcePriority: source.priority,
    sourceRecordId: `${file}:${index}`,
  };
}

function configuredByteLimit(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

async function* readBoundedLines(file) {
  const maxLineBytes = configuredByteLimit(
    "TOKENRANK_MAX_JSONL_LINE_BYTES",
    DEFAULT_MAX_JSONL_LINE_BYTES,
  );
  const input = createReadStream(file, { encoding: "utf8" });
  let parts = [];
  let bufferedBytes = 0;
  let discardUntilNewline = false;

  for await (const chunk of input) {
    let start = 0;

    while (start < chunk.length) {
      const newline = chunk.indexOf("\n", start);
      const end = newline === -1 ? chunk.length : newline;
      const part = chunk.slice(start, end);

      if (!discardUntilNewline) {
        const partBytes = Buffer.byteLength(part);

        if (bufferedBytes + partBytes > maxLineBytes) {
          parts = [];
          bufferedBytes = 0;
          discardUntilNewline = true;
        } else {
          parts.push(part);
          bufferedBytes += partBytes;
        }
      }

      if (newline === -1) {
        break;
      }

      if (!discardUntilNewline) {
        const line = parts.join("");
        yield line.endsWith("\r") ? line.slice(0, -1) : line;
      }

      parts = [];
      bufferedBytes = 0;
      discardUntilNewline = false;
      start = newline + 1;
    }
  }

  if (!discardUntilNewline && parts.length) {
    const line = parts.join("");
    yield line.endsWith("\r") ? line.slice(0, -1) : line;
  }
}

async function* readUsageFile(file, tool, source = { id: `${tool}-local`, priority: 100 }) {
  const fileStat = await stat(file);
  const fallbackDate = fileStat.mtime.toISOString().slice(0, 10);
  let recordIndex = 0;

  if (file.endsWith(".db") || file.endsWith(".sqlite")) {
    for (const entry of await readSqliteUsage(file, tool, fallbackDate)) {
      yield sourceEntry(entry, file, source, recordIndex);
      recordIndex += 1;
    }
    return;
  }

  if (file.endsWith(".jsonl")) {
    let context = { date: fallbackDate, model: null };

    for await (const line of readBoundedLines(file)) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      try {
        const value = JSON.parse(trimmed);
        const copilotEntries =
          tool === "github-copilot" ? extractCopilotOtelEntries(value, fallbackDate) : [];
        const extractedEntries = copilotEntries.length
          ? copilotEntries
          : extractEntriesFromValue(value, tool, fallbackDate, context);

        for (const entry of extractedEntries) {
          yield sourceEntry(entry, file, source, recordIndex);
          recordIndex += 1;
        }
        context = extractContextFromValue(value, context);
      } catch {
        continue;
      }
    }

    return;
  }

  const maxDocumentBytes = configuredByteLimit(
    "TOKENRANK_MAX_JSON_DOCUMENT_BYTES",
    DEFAULT_MAX_JSON_DOCUMENT_BYTES,
  );

  if (fileStat.size > maxDocumentBytes) {
    return;
  }

  const text = await readFile(file, "utf8");

  try {
    const value = JSON.parse(text);
    const copilotEntries =
      tool === "github-copilot" ? extractCopilotOtelEntries(value, fallbackDate) : [];
    const extractedEntries = copilotEntries.length
      ? copilotEntries
      : extractEntriesFromValue(value, tool, fallbackDate);

    for (const entry of extractedEntries) {
      yield sourceEntry(entry, file, source, recordIndex);
      recordIndex += 1;
    }
  } catch {
    return;
  }
}

function quoteSqlIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function quoteSqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function loadNodeSqlite() {
  if (nodeSqliteLoaded) {
    return nodeSqliteModule;
  }

  nodeSqliteLoaded = true;
  const moduleName = "node:sqlite";
  const originalEmitWarning = process.emitWarning;

  process.emitWarning = (warning, ...args) => {
    if (args[0] === "ExperimentalWarning" || String(warning).includes("SQLite")) {
      return;
    }

    originalEmitWarning.call(process, warning, ...args);
  };

  try {
    nodeSqliteModule = await import(moduleName);
  } catch {
    nodeSqliteModule = null;
  } finally {
    process.emitWarning = originalEmitWarning;
  }

  return nodeSqliteModule;
}

async function sqliteJsonViaNode(file, sql) {
  const sqlite = await loadNodeSqlite();

  if (!sqlite?.DatabaseSync) {
    return null;
  }

  let database = null;

  try {
    database = new sqlite.DatabaseSync(file, { readOnly: true });
    return database.prepare(sql).all();
  } catch {
    return null;
  } finally {
    database?.close();
  }
}

async function sqliteJson(file, sql) {
  const nodeRows = await sqliteJsonViaNode(file, sql);

  if (nodeRows) {
    return nodeRows;
  }

  try {
    const { stdout } = await execFileAsync("sqlite3", ["-readonly", "-json", file, sql], {
      maxBuffer: 1024 * 1024 * 20,
    });

    return stdout.trim() ? JSON.parse(stdout) : [];
  } catch {
    return [];
  }
}

function firstColumn(columns, names) {
  return names.find((name) => columns.has(name)) ?? null;
}

function sumSqlExpr(columns, names) {
  const existing = names.filter((name) => columns.has(name));

  if (!existing.length) {
    return "0";
  }

  return existing.map((name) => `coalesce(${quoteSqlIdent(name)}, 0)`).join(" + ");
}

async function readSqliteUsage(file, tool, fallbackDate) {
  const tables = await sqliteJson(
    file,
    "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
  );
  const entries = [];

  for (const table of tables) {
    const tableName = typeof table.name === "string" ? table.name : "";

    if (!tableName) {
      continue;
    }

    const columnRows = await sqliteJson(file, `pragma table_info(${quoteSqlIdent(tableName)})`);
    const columns = new Set(
      columnRows.map((column) => column.name).filter((name) => typeof name === "string"),
    );
    const inputExpr = sumSqlExpr(columns, [
      "input",
      "inputTokens",
      "input_tokens",
      "prompt_tokens",
      "promptTokenCount",
      "tokensIn",
    ]);
    const outputExpr = sumSqlExpr(columns, [
      "output",
      "outputTokens",
      "output_tokens",
      "completion_tokens",
      "candidatesTokenCount",
      "reasoning_output_tokens",
      "thoughts_tokens",
      "tokensOut",
    ]);
    const cacheReadExpr = sumSqlExpr(columns, [
      "cacheRead",
      "cacheReadTokens",
      "cache_read_tokens",
      "cache_read_input_tokens",
      "cached_tokens",
      "cached_input_tokens",
      "cacheReads",
    ]);
    const cacheWriteExpr = sumSqlExpr(columns, [
      "cacheWrite",
      "cacheWriteTokens",
      "cache_write_tokens",
      "cache_creation_input_tokens",
      "cacheWrites",
    ]);
    const tokenExpr = `${inputExpr} + ${outputExpr} + ${cacheReadExpr} + ${cacheWriteExpr}`;

    if (tokenExpr === "0 + 0 + 0 + 0") {
      continue;
    }

    const dateColumn = firstColumn(columns, [
      "date",
      "timestamp",
      "createdAt",
      "created_at",
      "startedAt",
      "started_at",
    ]);
    const modelColumn = firstColumn(columns, ["model", "modelId", "model_id", "modelName", "model_name"]);
    const dateSelect = dateColumn ? quoteSqlIdent(dateColumn) : "null";
    const fallbackModel = unattributedModelForTool(tool);
    const modelSelect = modelColumn ? quoteSqlIdent(modelColumn) : quoteSqlString(fallbackModel);
    const rows = await sqliteJson(
      file,
      [
        "select",
        `${dateSelect} as timestamp,`,
        `${modelSelect} as model,`,
        `${inputExpr} as input,`,
        `${outputExpr} as output,`,
        `${cacheReadExpr} as cacheRead,`,
        `${cacheWriteExpr} as cacheWrite`,
        `from ${quoteSqlIdent(tableName)}`,
        `where (${tokenExpr}) > 0`,
        "limit 10000",
      ].join(" "),
    );

    for (const row of rows) {
      const date = pickDate(row, fallbackDate);
      const model = normalizeModel(pickModel(row, fallbackModel), tool);
      const input = readNumber(row, ["input"]);
      const output = readNumber(row, ["output"]);
      const cacheRead = readNumber(row, ["cacheRead"]);
      const cacheWrite = readNumber(row, ["cacheWrite"]);
      const total = canonicalTotalFor(tool, input, output, cacheRead, cacheWrite);

      if (date && total > 0) {
        entries.push({ date, tool, model, input, output, cacheRead, cacheWrite, total });
      }
    }
  }

  return entries;
}

function sortedAggregateRows(rows) {
  return [...rows.values()].sort((a, b) => {
    const dateOrder = a.date.localeCompare(b.date);

    if (dateOrder) {
      return dateOrder;
    }

    const toolOrder = TOOL_KEYS.indexOf(a.tool) - TOOL_KEYS.indexOf(b.tool);

    if (toolOrder) {
      return toolOrder;
    }

    return a.model.localeCompare(b.model);
  });
}

function usageFingerprint(event) {
  const stable = event.providerEventId
    ? `${event.tool}\0${event.providerEventId}`
    : [
        event.tool,
        event.occurredAt ?? event.date,
        event.model,
        event.input,
        event.output,
        event.cacheRead,
        event.cacheWrite,
        event.sourceRecordId,
      ].join("\0");

  return createHash("sha256").update(stable).digest("hex");
}

function createUsageAccumulator() {
  const rows = new Map();
  const claimed = new Map();
  let filteredCount = 0;
  let uniqueCount = 0;

  function applyToAggregate(entry, direction) {
    const key = `${entry.date}\u0000${entry.tool}\u0000${entry.model}`;
    const current =
      rows.get(key) ?? {
        ...entry,
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      };

    for (const key of ["input", "output", "cacheRead", "cacheWrite", "total"]) {
      const next = current[key] + direction * entry[key];

      if (!Number.isSafeInteger(next) || next < 0) {
        throw new Error(message("tokenSumOverflow"));
      }

      current[key] = next;
    }

    if (
      current.input === 0 &&
      current.output === 0 &&
      current.cacheRead === 0 &&
      current.cacheWrite === 0 &&
      current.total === 0
    ) {
      rows.delete(key);
    } else {
      rows.set(key, current);
    }
  }

  function add(event) {
    filteredCount += 1;
    const entry = normalizeEntry(event);
    const fingerprint = event.fingerprint ?? (event.providerEventId ? usageFingerprint(event) : null);

    if (!fingerprint) {
      applyToAggregate(entry, 1);
      uniqueCount += 1;
      return;
    }

    const current = claimed.get(fingerprint);

    if (!current || (event.sourcePriority ?? 0) > (current.sourcePriority ?? 0)) {
      if (current) {
        applyToAggregate(current.entry, -1);
      } else {
        uniqueCount += 1;
      }

      claimed.set(fingerprint, {
        entry,
        sourcePriority: event.sourcePriority ?? 0,
      });
      applyToAggregate(entry, 1);
    }
  }

  return {
    add,
    get filteredCount() {
      return filteredCount;
    },
    get uniqueCount() {
      return uniqueCount;
    },
    values() {
      return sortedAggregateRows(rows);
    },
  };
}

function getOption(args, name, shortName = null) {
  const index = args.findIndex((arg) => arg === name || (shortName && arg === shortName));

  if (index === -1) {
    return null;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(message("missingOptionValue", { name }));
  }

  return value;
}

function getScanOptions(args) {
  const tool = getOption(args, "--tool");
  const since = getOption(args, "--since");

  if (tool && !TOOL_KEYS.includes(tool)) {
    throw new Error(message("unsupportedTool", { tool }));
  }

  if (since && !isIsoCalendarDate(since)) {
    throw new Error(message("invalidSince"));
  }

  return { tool, since };
}

async function scanLocalUsage(args, options = {}) {
  const { tool, since } = getScanOptions(args);
  const accumulator = createUsageAccumulator();
  const progress = Boolean(options.progress);
  const sources = sourceDefinitions().filter((source) => !tool || source.tool === tool);
  const sourceStats = [];

  if (progress && !useColor) {
    printSection(message("scanLocalUsage"));
    printMuted(
      `${message("scope", { scope: tool || message("allTools") })}${since ? ` · ${since}` : ""}`,
    );
  }

  for (const [sourceIndex, source] of sources.entries()) {
    let sourceFileCount = 0;
    let sourceEntryCount = 0;

    if (progress) {
      if (useColor) {
        renderSourceProgress(source.label, sourceIndex + 1, sources.length);
      } else {
        printStep(message("scanning", { source: source.label }), source.tool);
      }
    }

    for (const root of source.roots) {
      const files = (await collectFiles(root, 1000, { includeLogs: source.includeLogs })).filter(
        (file) => !source.includeFile || source.includeFile(file),
      );
      sourceFileCount += files.length;

      for (const file of files) {
        for await (const entry of readUsageFile(file, source.tool, {
          id: source.id ?? `${source.tool}-local`,
          priority: source.priority ?? 100,
        })) {
          sourceEntryCount += 1;

          if (!since || entry.date >= since) {
            accumulator.add(entry);
          }
        }
      }
    }

    sourceStats.push({
      label: source.label,
      tool: source.tool,
      fileCount: sourceFileCount,
      entryCount: sourceEntryCount,
    });

    if (progress && !useColor) {
      printMuted(
        `   ${source.tool}: ${sourceFileCount} ${message("files")}, ${sourceEntryCount} ${rowLabel(sourceEntryCount)}`,
      );
    }
  }

  const aggregatedEntries = accumulator.values();

  if (progress) {
    if (useColor) {
      clearSourceProgress();
      renderSourcesPanel(sourceStats);
      renderPrivacyPanel();
    } else {
      printSuccess(
        message("scanComplete"),
        `${accumulator.filteredCount} ${rowLabel(accumulator.filteredCount)} -> ${accumulator.uniqueCount} ${message("uniqueRows")} -> ${aggregatedEntries.length} ${message("aggregateRows")}`,
      );
    }
  }

  return aggregatedEntries;
}

function printSources() {
  for (const source of sourceDefinitions()) {
    const roots = source.roots.map((root) => root.replace(homedir(), "~")).join(", ");
    console.log(`${source.tool}\t${source.label}\t${roots}`);
  }
}

function getEntriesInput(raw) {
  if (Array.isArray(raw)) {
    return raw;
  }

  if (raw && typeof raw === "object" && Array.isArray(raw.entries)) {
    return raw.entries;
  }

  throw new Error(message("invalidUsageInput"));
}

function buildUploadPayload(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const entries = getEntriesInput(raw).map(normalizeEntry);

  return {
    deviceId: typeof source.deviceId === "string" && source.deviceId.trim() ? source.deviceId.trim() : getDeviceId(),
    clientVersion: typeof source.clientVersion === "string" && source.clientVersion.trim() ? source.clientVersion.trim() : clientVersion,
    timezone: typeof source.timezone === "string" && source.timezone.trim() ? source.timezone.trim() : getTimezone(),
    generatedAt: typeof source.generatedAt === "string" && source.generatedAt.trim() ? source.generatedAt.trim() : new Date().toISOString(),
    entries,
  };
}

function firstProxyValue(names) {
  for (const name of names) {
    const value = process.env[name];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeProxyUrl(value) {
  const proxyUrl = value.includes("://") ? new URL(value) : new URL(`http://${value}`);

  if (proxyUrl.protocol !== "http:" && proxyUrl.protocol !== "https:") {
    return null;
  }

  return proxyUrl;
}

function proxyPort(proxyUrl) {
  if (proxyUrl.port) {
    return Number(proxyUrl.port);
  }

  return proxyUrl.protocol === "https:" ? 443 : 80;
}

function shouldBypassProxy(hostnameValue) {
  const host = hostnameValue.toLowerCase();

  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function explicitProxyFor(targetUrl) {
  const protocolNames =
    targetUrl.protocol === "https:"
      ? ["TOKENRANK_HTTPS_PROXY", "HTTPS_PROXY", "https_proxy"]
      : ["TOKENRANK_HTTP_PROXY", "HTTP_PROXY", "http_proxy"];
  const value = firstProxyValue([
    "TOKENRANK_PROXY",
    ...protocolNames,
    "ALL_PROXY",
    "all_proxy",
  ]);

  return value ? normalizeProxyUrl(value) : null;
}

function parseMacSystemProxy(output, targetUrl) {
  const entries = Object.fromEntries(
    output
      .split("\n")
      .map((line) => line.match(/^\s*([A-Za-z]+(?:Enable|Proxy|Port))\s*:\s*(.+?)\s*$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  );
  const prefix = targetUrl.protocol === "https:" ? "HTTPS" : "HTTP";

  if (entries[`${prefix}Enable`] !== "1" || !entries[`${prefix}Proxy`] || !entries[`${prefix}Port`]) {
    return null;
  }

  return normalizeProxyUrl(`http://${entries[`${prefix}Proxy`]}:${entries[`${prefix}Port`]}`);
}

async function systemProxyFor(targetUrl) {
  if (process.env.TOKENRANK_TEST_SYSTEM_PROXY) {
    return normalizeProxyUrl(process.env.TOKENRANK_TEST_SYSTEM_PROXY);
  }

  if (process.env.TOKENRANK_DISABLE_SYSTEM_PROXY === "1" || process.platform !== "darwin") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("scutil", ["--proxy"]);
    return parseMacSystemProxy(stdout, targetUrl);
  } catch {
    return null;
  }
}

async function proxyFor(targetUrl) {
  if (shouldBypassProxy(targetUrl.hostname)) {
    return null;
  }

  return explicitProxyFor(targetUrl) ?? (await systemProxyFor(targetUrl));
}

function responseFromNode(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    res.on("end", () => {
      const status = res.statusCode ?? 0;

      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => Buffer.concat(chunks).toString("utf8"),
      });
    });
    res.on("error", reject);
  });
}

function bufferIndexOf(buffer, needle, start = 0) {
  return buffer.indexOf(Buffer.from(needle), start);
}

function decodeChunkedBody(buffer) {
  const chunks = [];
  let offset = 0;

  for (;;) {
    const lineEnd = bufferIndexOf(buffer, "\r\n", offset);

    if (lineEnd === -1) {
      return buffer;
    }

    const sizeText = buffer.subarray(offset, lineEnd).toString("ascii").split(";", 1)[0];
    const size = Number.parseInt(sizeText, 16);

    if (!Number.isFinite(size)) {
      return buffer;
    }

    offset = lineEnd + 2;

    if (size === 0) {
      return Buffer.concat(chunks);
    }

    chunks.push(buffer.subarray(offset, offset + size));
    offset += size + 2;
  }
}

function responseFromRawHttp(buffer) {
  const headerEnd = bufferIndexOf(buffer, "\r\n\r\n");

  if (headerEnd === -1) {
    throw new Error(message("proxyResponseInvalid"));
  }

  const headerText = buffer.subarray(0, headerEnd).toString("ascii");
  const status = Number(headerText.match(/^HTTP\/\d(?:\.\d)?\s+(\d+)/)?.[1] ?? 0);
  const isChunked = /\r\ntransfer-encoding:\s*chunked\b/i.test(headerText);
  const body = buffer.subarray(headerEnd + 4);
  const responseBody = isChunked ? decodeChunkedBody(body) : body;

  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => responseBody.toString("utf8"),
  };
}

function requestViaHttpProxy(targetUrl, proxyUrl, body, headers) {
  return new Promise((resolve, reject) => {
    const request = (proxyUrl.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: proxyUrl.protocol,
        hostname: proxyUrl.hostname,
        port: proxyPort(proxyUrl),
        method: "POST",
        path: targetUrl.href,
        headers: {
          ...headers,
          host: targetUrl.host,
        },
      },
      (res) => {
        responseFromNode(res).then(resolve, reject);
      },
    );

    request.on("error", reject);
    request.end(body);
  });
}

function requestViaHttpsProxy(targetUrl, proxyUrl, body) {
  return new Promise((resolve, reject) => {
    const targetPort = Number(targetUrl.port || 443);
    const proxyRequest = (proxyUrl.protocol === "https:" ? httpsRequest : httpRequest)({
      protocol: proxyUrl.protocol,
      hostname: proxyUrl.hostname,
      port: proxyPort(proxyUrl),
      method: "CONNECT",
      path: `${targetUrl.hostname}:${targetPort}`,
      headers: {
        host: `${targetUrl.hostname}:${targetPort}`,
      },
    });

    proxyRequest.on("connect", (res, socket) => {
      if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
        socket.destroy();
        reject(new Error(message("proxyConnectionFailed", { status: res.statusCode ?? 0 })));
        return;
      }

      const tlsSocket = tlsConnect({
        socket,
        servername: targetUrl.hostname,
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ? false : undefined,
      });
      tlsSocket.once("error", reject);
      tlsSocket.once("secureConnect", () => {
        const responseChunks = [];
        let settled = false;
        const settle = () => {
          if (settled) {
            return;
          }

          settled = true;
          try {
            resolve(responseFromRawHttp(Buffer.concat(responseChunks)));
          } catch (error) {
            reject(error);
          }
        };

        tlsSocket.on("data", (chunk) => responseChunks.push(Buffer.from(chunk)));
        tlsSocket.once("end", settle);
        tlsSocket.once("close", settle);
        tlsSocket.write(
          [
            `POST ${targetUrl.pathname}${targetUrl.search} HTTP/1.1`,
            `Host: ${targetUrl.host}`,
            "Content-Type: application/json",
            `Content-Length: ${Buffer.byteLength(body)}`,
            "Connection: close",
            "",
            body,
          ].join("\r\n"),
        );
      });
    });
    proxyRequest.on("error", reject);
    proxyRequest.end();
  });
}

async function postJson(webhookUrl, payload) {
  const body = JSON.stringify(payload);
  const targetUrl = new URL(webhookUrl);
  const headers = {
    "content-type": "application/json",
    "content-length": String(Buffer.byteLength(body)),
    connection: "close",
  };
  const proxyUrl = await proxyFor(targetUrl);

  if (!proxyUrl) {
    return fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
  }

  if (targetUrl.protocol === "http:") {
    return requestViaHttpProxy(targetUrl, proxyUrl, body, headers);
  }

  if (targetUrl.protocol === "https:") {
    return requestViaHttpsProxy(targetUrl, proxyUrl, body);
  }

  throw new Error(message("unsupportedWebhookProtocol", { protocol: targetUrl.protocol }));
}

function getFileArg(args) {
  const index = args.findIndex((arg) => arg === "--file" || arg === "-f");

  if (index === -1) {
    return null;
  }

  const file = args[index + 1];

  if (!file || file.startsWith("-")) {
    throw new Error(message("missingFile"));
  }

  return file;
}

function isFullLocalUpload(args, file) {
  return !file && !getOption(args, "--tool") && !getOption(args, "--since");
}

async function upload(args, options = {}) {
  const quiet = Boolean(options.quiet);
  if (!quiet) {
    await printLogo();
  }
  const config = await readConfig();
  const webhookUrl = requireWebhookUrl(config.webhookUrl);
  const file = getFileArg(args);
  if (!quiet) {
    if (useColor) {
      renderConnectionPanel(new URL(webhookUrl).host);
    } else {
      printSection(message("upload"));
      printStep(message("webhookReady"), new URL(webhookUrl).origin);
    }
  }
  const raw = file
    ? JSON.parse(await readFile(file, "utf8"))
    : { entries: await scanLocalUsage(args, { progress: !quiet }) };
  if (file && !quiet) {
    printStep(message("loadedUsageFile"), file);
  }
  if (!quiet && !useColor) {
    printStep(message("buildPayload"));
  }
  const payload = buildUploadPayload(raw);
  const batches = payload.entries.length
    ? Array.from({ length: Math.ceil(payload.entries.length / 500) }, (_, index) => ({
        ...payload,
        entries: payload.entries.slice(index * 500, index * 500 + 500),
      }))
    : [payload];

  if (!quiet && !useColor) {
    printStep(
      message("uploading", {
        count: payload.entries.length,
        rows: rowLabel(payload.entries.length),
        batches: batches.length,
      }),
    );
  }

  for (const [index, batch] of batches.entries()) {
    if (!quiet && !useColor) {
      printMuted(
        `   ${message("batch", {
          current: index + 1,
          total: batches.length,
          count: batch.entries.length,
          rows: rowLabel(batch.entries.length),
        })}`,
      );
    }
    const response = await postJson(webhookUrl, batch);
    const responseText = await response.text();
    let responseJson = null;

    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }

    if (!response.ok || responseJson?.status !== 0) {
      const error = responseJson?.error || responseText || `HTTP ${response.status}`;
      throw new Error(message("uploadFailed", { error }));
    }

    if (!quiet) {
      await renderUploadGrid(index + 1, batches.length, payload.entries.length);
    }
  }

  if (!quiet && !useColor) {
    if (terminalIsTty) {
      printSuccess(message("uploadComplete"), `${payload.entries.length} ${rowLabel(payload.entries.length)}`);
    } else {
      printSuccess(
        message("uploadSuccess", {
          count: payload.entries.length,
          rows: rowLabel(payload.entries.length),
        }),
      );
    }
  }

  if (isFullLocalUpload(args, file) && options.trackState !== false) {
    await recordSuccessfulLocalUpload();
  }

  return { uploaded: payload.entries.length };
}

function parseInterval(args) {
  const raw = getOption(args, "--interval");

  if (!raw) {
    return defaultCollectorIntervalSeconds;
  }

  const interval = Number(raw);

  if (!Number.isSafeInteger(interval) || interval < 60) {
    throw new Error(message("invalidInterval"));
  }

  return interval;
}

function servicePaths() {
  const platform = process.env.TOKENRANK_TEST_PLATFORM || process.platform;

  if (platform === "darwin") {
    return {
      kind: "launchd",
      file: path.join(homedir(), "Library", "LaunchAgents", "com.tokenrank.collector.plist"),
    };
  }

  if (platform === "win32") {
    return {
      kind: "schtasks",
      file: path.join(homedir(), ".tokenrank", "tokenrank-collector.ps1"),
      taskFile: path.join(homedir(), ".tokenrank", "tokenrank-collector.xml"),
      taskName: "TokenRankCollector",
      legacyTaskNames: [
        "TokenRankCollector",
        "TokenRankCollectorMidnight",
        "TokenRankCollectorNoon",
      ],
    };
  }

  return {
    kind: "systemd",
    file: path.join(homedir(), ".config", "systemd", "user", "tokenrank-collector.service"),
    timerFile: path.join(homedir(), ".config", "systemd", "user", "tokenrank-collector.timer"),
  };
}

function xmlEscape(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function launchdPlist() {
  const binPath = fileURLToPath(import.meta.url);
  const logDir = path.join(homedir(), ".tokenrank");
  const args = [process.execPath, binPath, "daemon", "--once", "--scheduled"];
  const schedule = collectorScheduleHours
    .map(
      (hour) => `    <dict>
      <key>Hour</key>
      <integer>${hour}</integer>
      <key>Minute</key>
      <integer>0</integer>
    </dict>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.tokenrank.collector</string>
  <key>ProgramArguments</key>
  <array>
${args.map((arg) => `    <string>${xmlEscape(arg)}</string>`).join("\n")}
  </array>
  <key>StartCalendarInterval</key>
  <array>
${schedule}
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${xmlEscape(path.join(logDir, "collector.log"))}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(path.join(logDir, "collector.err.log"))}</string>
</dict>
</plist>
`;
}

function systemdUnit() {
  const binPath = fileURLToPath(import.meta.url);

  return `[Unit]
Description=TokenRank collector

[Service]
Type=oneshot
ExecStart=${process.execPath} ${binPath} daemon --once --scheduled
`;
}

function systemdTimer() {
  return `[Unit]
Description=Run TokenRank collector at 00:00 and 12:00

[Timer]
OnCalendar=*-*-* 00:00:00
OnCalendar=*-*-* 12:00:00
Persistent=true

[Install]
WantedBy=timers.target
`;
}

function powershellSingleQuote(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function windowsTaskRunner() {
  const binPath = fileURLToPath(import.meta.url);
  const logDir = path.join(homedir(), ".tokenrank");

  return `$ErrorActionPreference = 'Stop'
$env:TOKENRANK_NO_LOGO = '1'
$env:TOKENRANK_NO_ANIMATION = '1'
& ${powershellSingleQuote(process.execPath)} ${powershellSingleQuote(binPath)} daemon --once --scheduled 1>> ${powershellSingleQuote(path.join(logDir, "collector.log"))} 2>> ${powershellSingleQuote(path.join(logDir, "collector.err.log"))}
exit $LASTEXITCODE
`;
}

function windowsTaskXml(runnerPath) {
  const userName = [process.env.USERDOMAIN, process.env.USERNAME].filter(Boolean).join("\\") ||
    process.env.USERNAME ||
    "SYSTEM";
  const runnerArgs = `-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "${runnerPath}"`;

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>TokenRank collector at 00:00, 12:00, and after missed runs.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger><StartBoundary>2020-01-01T00:00:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
    <CalendarTrigger><StartBoundary>2020-01-01T12:00:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
    <LogonTrigger><Enabled>true</Enabled><UserId>${xmlEscape(userName)}</UserId></LogonTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>${xmlEscape(userName)}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
    <Hidden>true</Hidden>
    <ExecutionTimeLimit>PT2H</ExecutionTimeLimit>
    <Enabled>true</Enabled>
  </Settings>
  <Actions Context="Author"><Exec><Command>powershell.exe</Command><Arguments>${xmlEscape(runnerArgs)}</Arguments></Exec></Actions>
</Task>
`;
}

async function runOptional(command, args) {
  try {
    await execFileAsync(command, args);
  } catch {
    // The service file is still useful even when launchd/systemd registration
    // is unavailable, for example inside CI or restricted shells.
  }
}

async function serviceRegistrationExists() {
  const { kind, taskName } = servicePaths();

  try {
    if (kind === "launchd") {
      const userId = typeof process.getuid === "function" ? process.getuid() : null;
      const target = userId === null ? "com.tokenrank.collector" : `gui/${userId}/com.tokenrank.collector`;
      await execFileAsync("launchctl", userId === null ? ["list", target] : ["print", target]);
    } else if (kind === "schtasks") {
      await execFileAsync("schtasks.exe", ["/Query", "/TN", taskName]);
    } else {
      await execFileAsync("systemctl", ["--user", "is-enabled", "--quiet", "tokenrank-collector.timer"]);
    }

    return true;
  } catch {
    return false;
  }
}

async function installService(args = []) {
  await readConfig();
  const hasLegacyIntervalArg =
    args.includes("--interval") || args.some((arg) => arg.startsWith("--interval="));
  const {
    kind,
    file,
    timerFile,
    taskFile,
    taskName,
    legacyTaskNames = [],
  } = servicePaths();
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(path.join(homedir(), ".tokenrank"), { recursive: true, mode: 0o700 });
  await writeFile(
    file,
    kind === "launchd" ? launchdPlist() : kind === "schtasks" ? windowsTaskRunner() : systemdUnit(),
  );
  if (timerFile) {
    await writeFile(timerFile, systemdTimer());
  }
  if (taskFile) {
    await writeFile(taskFile, `\uFEFF${windowsTaskXml(file)}`, "utf16le");
  }

  if (!process.env.TOKENRANK_SERVICE_NO_REGISTER) {
    if (kind === "launchd") {
      await runOptional("launchctl", ["unload", file]);
      await execFileAsync("launchctl", ["load", file]);
    } else if (kind === "schtasks") {
      for (const legacyName of legacyTaskNames) {
        await runOptional("schtasks.exe", ["/Delete", "/TN", legacyName, "/F"]);
      }
      await execFileAsync("schtasks.exe", [
        "/Create",
        "/TN",
        taskName,
        "/XML",
        taskFile,
        "/F",
      ]);
    } else {
      await execFileAsync("systemctl", ["--user", "daemon-reload"]);
      await execFileAsync("systemctl", ["--user", "enable", "--now", "tokenrank-collector.timer"]);
    }
  }

  if (hasLegacyIntervalArg) {
    console.log(message("ignoredInterval", { schedule: message("dailySchedule") }));
  }
  console.log(message("installedBackgroundService", { file }));
  console.log(message("collectionSchedule", { schedule: message("dailySchedule") }));
}

async function serviceStatus() {
  const { file } = servicePaths();
  const installed = await serviceInstalled();
  console.log(installed ? message("installed", { file }) : message("notInstalled"));
}

async function serviceInstalled() {
  const { file, timerFile, taskFile } = servicePaths();
  const configExists =
    Boolean(await pathExists(file)) &&
    (!timerFile || Boolean(await pathExists(timerFile))) &&
    (!taskFile || Boolean(await pathExists(taskFile)));

  if (!configExists) {
    return false;
  }

  if (process.env.TOKENRANK_SERVICE_NO_REGISTER) {
    return true;
  }

  return serviceRegistrationExists();
}

async function uninstallService() {
  const { kind, file, timerFile, taskFile, legacyTaskNames = [] } = servicePaths();

  if (!process.env.TOKENRANK_SERVICE_NO_REGISTER) {
    if (kind === "launchd") {
      await runOptional("launchctl", ["unload", file]);
    } else if (kind === "schtasks") {
      for (const legacyName of legacyTaskNames) {
        await runOptional("schtasks.exe", ["/Delete", "/TN", legacyName, "/F"]);
      }
    } else {
      await runOptional("systemctl", ["--user", "disable", "--now", "tokenrank-collector.timer"]);
      await runOptional("systemctl", ["--user", "daemon-reload"]);
    }
  }

  await rm(file, { force: true });
  if (timerFile) {
    await rm(timerFile, { force: true });
  }
  if (taskFile) {
    await rm(taskFile, { force: true });
  }
  console.log(message("uninstallService", { file }));
}

function nextScheduleBoundary(now = currentTime()) {
  const next = latestScheduleBoundary(now);
  next.setHours(next.getHours() + 12);
  return next;
}

async function statusCommand() {
  let connected = false;
  try {
    const config = await readConfig();
    requireWebhookUrl(config.webhookUrl);
    connected = true;
  } catch {
    connected = false;
  }

  const state = await readServiceState();
  const installed = await serviceInstalled();
  console.log(connected ? message("connected") : message("notConnected"));
  console.log(installed ? message("serviceInstalled") : message("serviceNotInstalled"));
  console.log(`${message("lastSuccess")}\t${state.lastSuccessfulAt ?? message("never")}`);
  console.log(`${message("lastError")}\t${state.lastErrorCode ?? message("none")}`);
  console.log(`${message("nextBoundary")}\t${nextScheduleBoundary().toISOString()}`);
}

async function doctorCommand() {
  for (const source of sourceDefinitions()) {
    let files = 0;
    let rows = 0;
    let failed = false;

    for (const root of source.roots) {
      const sourceFiles = (
        await collectFiles(root, 1000, { includeLogs: source.includeLogs })
      ).filter(
        (file) => !source.includeFile || source.includeFile(file),
      );
      files += sourceFiles.length;

      for (const file of sourceFiles) {
        try {
          for await (const _entry of readUsageFile(file, source.tool, {
            id: source.id ?? `${source.tool}-local`,
            priority: source.priority ?? 100,
          })) {
            void _entry;
            rows += 1;
          }
        } catch {
          failed = true;
        }
      }
    }

    const status = failed
      ? message("error")
      : rows > 0
        ? message("ready")
        : source.tool === "cursor"
          ? message("exactSourceRequired")
          : files > 0
            ? message("detectedNoRows")
            : message("unavailable");
    console.log(
      `${source.tool}\t${status}\t${files} ${message("files")}\t${rows} ${rowLabel(rows)}`,
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runScheduledUpload(args) {
  return withCollectorLock(async () => {
    const now = currentTime();
    const boundary = latestScheduleBoundary(now);
    const state = await readServiceState();

    if (
      state.lastScheduledBoundary &&
      new Date(state.lastScheduledBoundary).getTime() >= boundary.getTime()
    ) {
      return { skipped: true, reason: "already-synced" };
    }

    await writeServiceState({
      ...state,
      lastAttemptAt: now.toISOString(),
      lastErrorCode: null,
    });

    try {
      const result = await upload(
        args.filter((arg) => arg !== "--scheduled"),
        { quiet: true, trackState: false },
      );
      await writeServiceState({
        ...state,
        lastAttemptAt: now.toISOString(),
        lastSuccessfulAt: now.toISOString(),
        lastScheduledBoundary: boundary.toISOString(),
        lastErrorCode: null,
      });
      return result;
    } catch (error) {
      await writeServiceState({
        ...state,
        lastAttemptAt: now.toISOString(),
        lastErrorCode: "UPLOAD_FAILED",
      });
      throw error;
    }
  });
}

async function daemon(args) {
  if (args.includes("--once")) {
    if (args.includes("--scheduled")) {
      await runScheduledUpload(args);
    } else {
      await upload(args);
    }
    return;
  }

  const interval = parseInterval(args);

  for (;;) {
    await upload(args);
    await sleep(interval * 1000);
  }
}

async function preview(args) {
  const entries = await scanLocalUsage(args);
  const payload = buildUploadPayload({ entries });

  if (args.includes("--json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!entries.length) {
    console.log(message("noLocalUsage"));
    return;
  }

  for (const entry of entries) {
    console.log(`${entry.date}\t${entry.tool}\t${entry.model}\t${entry.total}`);
  }
}

async function main() {
  const [command, ...args] = parseGlobalOptions(process.argv.slice(2));

  switch (command) {
    case "tools":
      await printLogo();
      printSection(message("supportedTools"));
      for (const tool of TOOL_KEYS) {
        console.log(`${trueColor("•", cliPalette.lime)} ${tool}`);
      }
      return;
    case "sources":
      await printLogo();
      printSection(message("localSourceAdapters"));
      printSources();
      return;
    case "status":
      await printLogo();
      printSection(message("gridStatus"));
      await statusCommand();
      return;
    case "doctor":
      await printLogo();
      printSection(message("sourceDiagnostics"));
      await doctorCommand();
      return;
    case "preview":
      await preview(args);
      return;
    case "connect": {
      const compact = process.env.TOKENRANK_NO_LOGO === "1";
      if (!compact) {
        await printLogo();
        printSection(message("connect"));
      }
      const webhookUrl = requireWebhookUrl(args[0]);
      await writeConfig({ webhookUrl, connectedAt: new Date().toISOString() });
      printSuccess(message("savedWebhook"));
      if (!compact) {
        printMuted(message("nextUpload"));
      }
      return;
    }
    case "logout":
      await removeConfig();
      return;
    case "upload":
      await upload(args);
      return;
    case "daemon":
      await daemon(args);
      return;
    case "service":
      if (args[0] === "install") {
        await printLogo();
        await installService(args.slice(1));
        return;
      }

      if (args[0] === "status") {
        await printLogo();
        await serviceStatus();
        return;
      }

      if (args[0] === "uninstall") {
        await printLogo();
        await uninstallService();
        return;
      }

      throw new Error(message("unknownServiceCommand"));
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(usage());
      return;
    default:
      throw new Error(`${message("unknownCommand", { command })}\n\n${usage()}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
