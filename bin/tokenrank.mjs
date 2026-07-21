#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
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
const MODEL_MAX_LENGTH = 120;
const MODEL_HASH_LENGTH = 16;
const DEFAULT_MAX_JSONL_LINE_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_JSON_DOCUMENT_BYTES = 64 * 1024 * 1024;
const cliMessages = {
  en: {
    active: "ACTIVE",
    aggregatesOnly: "AGGREGATES ONLY",
    aggregateRows: "aggregate rows",
    allTools: "all tools",
    batch: "batch {current}/{total}: {count} {rows}",
    buildPayload: "Build payload",
    checkingBackgroundSync: "Checking background sync",
    checkingCollectorStatus: "Checking collector status",
    collectorSubtitle: "Local AI usage collector",
    commands: "Commands:",
    connect: "Connect",
    connected: "CONNECTED",
    contentStaysLocal: "CONTENT STAYS LOCAL",
    collectionSchedule: "Collection schedule: {schedule}",
    collectorLocked: "Another TokenRank upload is already running. Wait and try again.",
    dailySchedule: "hourly at minute {minute}, with missed-run recovery",
    detectedNoRows: "DETECTED / NO TOKEN ROWS",
    discoveringSourceProgress: "Discovering {source} · {current}/{total} sources · {files} files",
    doctorProgressSummary: "Diagnosis complete · {sources} sources · {files} files · {rows} rows · {ready} ready",
    error: "ERROR",
    exactSourceRequired: "EXACT SOURCE REQUIRED",
    files: "files",
    filteredUploadRequiresFullSync:
      "Run `tokenrank upload` once for this connection before using --file, --tool, or --since.",
    gridStatus: "GRID STATUS",
    ignoredInterval: "Ignored --interval: background collection is fixed to {schedule}.",
    incompleteCutover: "The initial UTC cutover scan was incomplete; no snapshot was uploaded.",
    installed: "Installed: {file}",
    installedBackgroundService: "Installed background service: {file}",
    installingBackgroundSync: "Installing background sync",
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
    loadingUsageFileProgress: "Loading {file}",
    localSourceAdapters: "LOCAL SOURCE ADAPTERS",
    localSources: "LOCAL SOURCES",
    locations: "locations",
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
    previewActiveDays: "ACTIVE DAYS",
    previewActivity: "DAILY ACTIVITY · LAST {days} ACTIVE DAYS",
    previewActivitySingle: "DAILY ACTIVITY · LAST ACTIVE DAY",
    previewAiTools: "AI TOOLS",
    previewConnectReady: "PRIVATE UPLOAD LINK CONNECTED",
    previewCopyConnectCommand: "COPY PRIVATE CONNECT COMMAND",
    previewCopyConnectHint: "shown after sign-in",
    previewDailyAverage: "DAILY AVERAGE",
    previewDateRange: "UTC DATE RANGE",
    previewFootprint: "YOUR AI FOOTPRINT",
    previewHeroPrivacy: "Local scan · Nothing uploaded",
    previewHeroTagline: "YOUR AI USAGE, MADE VISIBLE",
    previewModelBreakdown: "TOP MODELS",
    previewModels: "MODELS",
    previewMoreRows: "+{count} more aggregate rows",
    previewNextClaimTitle: "NEXT · CLAIM YOUR RANK",
    previewNextConnectedTitle: "NEXT · UPDATE YOUR RANK",
    previewNothingUploaded: "THIS PREVIEW UPLOADED NOTHING",
    previewOpenRanking: "OPEN YOUR RANKING",
    previewPeakDay: "PEAK DAY",
    previewRecent: "RECENT ACTIVITY · {shown}/{total}",
    previewTokensFound: "Your local AI history adds up to {total} tokens.",
    previewToolBreakdown: "AI TOOL BREAKDOWN",
    previewTotalTokens: "TOTAL TOKENS",
    previewSignInWithX: "SIGN IN WITH X & CREATE PROFILE",
    previewUploadAggregates: "UPLOAD DAILY AGGREGATES",
    previewUploadPrivacy: "PROMPTS, CODE & CHATS STAY LOCAL",
    previewViewJson: "full detail: tokenrank preview --json",
    requestTimedOut: "The webhook request deadline was exceeded.",
    ready: "READY",
    removingBackgroundSync: "Removing background sync",
    removedWebhook: "Removed local webhook configuration.",
    row: "row",
    rows: "rows",
    savedWebhook: "Saved webhook.",
    scanComplete: "Scan complete",
    scanProgressSummary: "Scan complete · {sources} sources · {files} files · {rows} rows · {aggregates} aggregates",
    snapshotNotCommitted: "The server did not commit the full snapshot.",
    snapshotTooLarge: "The full snapshot exceeds the 100-batch safety limit.",
    scanLocalUsage: "Scan local usage",
    scanning: "Scanning {source}",
    scanningSourceProgress: "Scanning {source} · {current}/{total} sources · {fileCurrent}/{fileTotal} files · {rows} rows",
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
    uploadBatchProgress: "Uploading batch {current}/{total} · {count} {rows}",
    uploadProgressSummary: "Upload complete · {count} {rows} · {batches} batches",
    uploadSuccess: "Upload complete: {count} {rows}",
    uploading: "Uploading {count} {rows} in {batches} batch(es)",
    usageDescription: "usage.json may be either { entries: [...] } or an array of aggregate entries.",
    usageTitle: "TokenRank collector",
    webhookConfigMissing: "Run tokenrank connect <webhook-url> first.",
    webhookReady: "Webhook ready",
  },
  zh: {
    active: "活跃",
    aggregatesOnly: "仅聚合数据",
    aggregateRows: "聚合记录",
    allTools: "全部工具",
    batch: "批次 {current}/{total}：{count} {rows}",
    buildPayload: "构建上传数据",
    checkingBackgroundSync: "正在检查后台同步",
    checkingCollectorStatus: "正在检查采集器状态",
    collectorSubtitle: "本地 AI Token 用量采集器",
    commands: "命令：",
    connect: "连接",
    connected: "已连接",
    contentStaysLocal: "内容留在本机",
    collectionSchedule: "采集时间：{schedule}",
    collectorLocked: "另一个 TokenRank 上传正在运行，请稍后重试。",
    dailySchedule: "每小时第 {minute} 分钟，并在错过后补跑",
    detectedNoRows: "已检测 / 暂无 Token 记录",
    discoveringSourceProgress: "发现 {source} · 来源 {current}/{total} · 已发现 {files} 个文件",
    doctorProgressSummary: "诊断完成 · {sources} 个来源 · {files} 个文件 · {rows} 条记录 · {ready} 个就绪",
    error: "错误",
    exactSourceRequired: "需要精确数据源",
    files: "个文件",
    filteredUploadRequiresFullSync:
      "当前连接请先运行一次 `tokenrank upload` 完成全量同步，再使用 --file、--tool 或 --since。",
    gridStatus: "运行状态",
    ignoredInterval: "已忽略 --interval：后台采集时间固定为{schedule}。",
    incompleteCutover: "首次 UTC 切换扫描不完整，未上传快照。",
    installed: "已安装：{file}",
    installedBackgroundService: "已安装后台服务：{file}",
    installingBackgroundSync: "正在安装后台同步",
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
    loadingUsageFileProgress: "正在载入 {file}",
    localSourceAdapters: "本地数据源适配器",
    localSources: "本地来源",
    locations: "个位置",
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
    previewActiveDays: "活跃天数",
    previewActivity: "每日活动 · 最近 {days} 个活跃日",
    previewActivitySingle: "每日活动 · 最近 1 个活跃日",
    previewAiTools: "AI 工具",
    previewConnectReady: "私人上传链接已连接",
    previewCopyConnectCommand: "复制私人连接命令",
    previewCopyConnectHint: "登录后显示",
    previewDailyAverage: "日均用量",
    previewDateRange: "UTC 日期范围",
    previewFootprint: "你的 AI 足迹",
    previewHeroPrivacy: "仅本地扫描 · 尚未上传任何数据",
    previewHeroTagline: "你的 AI 用量，一眼看清",
    previewModelBreakdown: "常用模型",
    previewModels: "模型数量",
    previewMoreRows: "另有 {count} 条聚合记录",
    previewNextClaimTitle: "下一步 · 认领你的排名",
    previewNextConnectedTitle: "下一步 · 更新你的排名",
    previewNothingUploaded: "本次预览没有上传任何数据",
    previewOpenRanking: "查看你的排名",
    previewPeakDay: "峰值日期",
    previewRecent: "近期活动 · {shown}/{total}",
    previewTokensFound: "你的本地 AI 历史累计使用了 {total} Token。",
    previewToolBreakdown: "AI 工具分布",
    previewTotalTokens: "Token 总量",
    previewSignInWithX: "使用 X 登录并创建主页",
    previewUploadAggregates: "上传每日聚合",
    previewUploadPrivacy: "Prompt、代码和聊天内容始终留在本机",
    previewViewJson: "完整明细：tokenrank preview --json",
    requestTimedOut: "webhook 请求超过截止时间。",
    ready: "就绪",
    removingBackgroundSync: "正在移除后台同步",
    removedWebhook: "已移除本机 webhook 配置。",
    row: "条记录",
    rows: "条记录",
    savedWebhook: "已保存 webhook。",
    scanComplete: "扫描完成",
    scanProgressSummary: "扫描完成 · {sources} 个来源 · {files} 个文件 · {rows} 条记录 · {aggregates} 条聚合",
    snapshotNotCommitted: "服务端尚未提交完整快照。",
    snapshotTooLarge: "完整快照超过 100 批安全上限。",
    scanLocalUsage: "扫描本地用量",
    scanning: "正在扫描 {source}",
    scanningSourceProgress: "扫描 {source} · 来源 {current}/{total} · 文件 {fileCurrent}/{fileTotal} · {rows} 条记录",
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
    uploadBatchProgress: "正在上传批次 {current}/{total} · {count} {rows}",
    uploadProgressSummary: "上传完成 · {count} {rows} · {batches} 个批次",
    uploadSuccess: "上传成功：{count} {rows}",
    uploading: "正在上传 {count} {rows}，共 {batches} 个批次",
    usageDescription: "usage.json 可以是 { entries: [...] }，也可以是聚合记录数组。",
    usageTitle: "TokenRank 采集器",
    webhookConfigMissing: "请先运行 tokenrank connect <webhook-url>。",
    webhookReady: "webhook 已就绪",
  },
};

const cliHelp = {
  en: {
    usage: "Usage",
    commands: "Commands",
    options: "Global options",
    commandRows: [
      ["tools", "List supported AI tools"],
      ["sources", "Show local source adapters"],
      ["status [--json]", "Show verified connection and sync health"],
      ["doctor", "Diagnose every local source"],
      ["preview [filters]", "Preview aggregate usage before upload"],
      ["connect <webhook-url>", "Connect a private TokenRank webhook"],
      ["logout", "Remove the local webhook configuration"],
      ["upload [filters]", "Scan and upload aggregate usage"],
      ["daemon [--once]", "Run uploads in the foreground"],
      ["service install", "Install scheduled background sync"],
      ["service status", "Check the background sync service"],
      ["service uninstall", "Remove scheduled background sync"],
    ],
    optionRows: [
      ["--tool <tool-id>", "Limit preview or upload to one tool"],
      ["--since <YYYY-MM-DD>", "Only include usage on or after a date"],
      ["--file <usage.json>", "Upload an aggregate usage file"],
      ["--lang <en|zh|auto>", "Override the detected language"],
      ["-h, --help", "Show this help"],
    ],
  },
  zh: {
    usage: "用法",
    commands: "命令",
    options: "全局选项",
    commandRows: [
      ["tools", "列出支持的 AI 工具"],
      ["sources", "查看本地数据源适配器"],
      ["status [--json]", "查看已验证的连接与同步健康状态"],
      ["doctor", "诊断全部本地数据源"],
      ["preview [筛选参数]", "上传前预览聚合用量"],
      ["connect <webhook-url>", "连接私人 TokenRank webhook"],
      ["logout", "移除本机 webhook 配置"],
      ["upload [筛选参数]", "扫描并上传聚合用量"],
      ["daemon [--once]", "在前台运行上传任务"],
      ["service install", "安装后台定时同步"],
      ["service status", "检查后台同步服务"],
      ["service uninstall", "移除后台定时同步"],
    ],
    optionRows: [
      ["--tool <tool-id>", "只预览或上传一个工具"],
      ["--since <YYYY-MM-DD>", "只包含该日期及之后的用量"],
      ["--file <usage.json>", "上传聚合用量文件"],
      ["--lang <en|zh|auto>", "覆盖自动检测的语言"],
      ["-h, --help", "显示帮助"],
    ],
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
  const normalized = isUnknownModel(model) ? unattributedModelForTool(tool) : model;

  if (normalized.length <= MODEL_MAX_LENGTH) return normalized;

  const suffix = `~${createHash("sha256").update(normalized).digest("hex").slice(0, MODEL_HASH_LENGTH)}`;
  let prefix = normalized.slice(0, MODEL_MAX_LENGTH - suffix.length);
  if (/[\uD800-\uDBFF]$/u.test(prefix)) prefix = prefix.slice(0, -1);
  return `${prefix}${suffix}`;
}

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = await readCliPackageJson([
  path.join(cliDir, "package.json"),
  path.resolve(cliDir, "..", "package.json"),
  path.join(process.env.TOKENRANK_HOME ?? path.join(homedir(), ".tokenrank"), "package.json"),
]);
const clientVersion = String(packageJson.version ?? "0.0.0");
const accountingVersion = 2;
const defaultCollectorIntervalSeconds = 60 * 60;
const uploadBatchSize = 500;
const maxUploadAttempts = 4;
const TOKEN_COUNT_FIELDS = ["input", "output", "cacheRead", "cacheWrite", "total"];
const terminalIsTty = process.env.TOKENRANK_TEST_TTY === "1" || Boolean(process.stdout.isTTY);
const progressIsTty = process.env.TOKENRANK_TEST_TTY === "1" || Boolean(process.stderr.isTTY);
const terminalColumns = Math.max(40, Number(process.env.COLUMNS || process.stdout.columns || 80));
const useColor = process.env.NO_COLOR !== "1" && terminalIsTty;
const useProgressColor = process.env.NO_COLOR !== "1" && progressIsTty;
const progressEnabled = progressIsTty && process.env.TOKENRANK_NO_PROGRESS !== "1";
const useProgressAnimation = progressEnabled && process.env.TOKENRANK_NO_ANIMATION !== "1";
const cliPalette = {
  ivory: [242, 241, 232],
  muted: [133, 139, 128],
  lime: [214, 255, 63],
  orange: [255, 91, 53],
  line: [52, 58, 51],
};
const uiMaxWidth = 78;

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

function uiWidth() {
  return Math.min(terminalColumns, uiMaxWidth);
}

function trueColor(value, foreground) {
  if (!useColor) {
    return value;
  }

  return `\x1b[38;2;${foreground.join(";")}m${value}\x1b[0m`;
}

function padCell(value, width, align = "left") {
  const safe = trimLine(String(value), width);
  const padding = " ".repeat(Math.max(0, width - displayWidth(safe)));
  return align === "right" ? `${padding}${safe}` : `${safe}${padding}`;
}

function wrapDisplayLine(value, width) {
  const lines = [];
  let line = "";
  let lineWidth = 0;

  for (const character of String(value)) {
    const characterWidth = isFullWidthCodePoint(character.codePointAt(0) ?? 0) ? 2 : 1;
    if (line && lineWidth + characterWidth > width) {
      lines.push(line.trimEnd());
      line = "";
      lineWidth = 0;
    }
    line += character;
    lineWidth += characterWidth;
  }

  if (line || lines.length === 0) {
    lines.push(line.trimEnd());
  }

  return lines;
}

function panelLine(left, right = "", options = {}) {
  const innerWidth = Math.max(1, uiWidth() - 4);
  const safeRight = trimLine(right, Math.max(0, innerWidth - 1));
  const leftWidth = Math.max(0, innerWidth - displayWidth(safeRight) - (safeRight ? 1 : 0));
  const leftValue = options.leftSegments?.map((segment) => segment.value).join("") ?? left;
  const safeLeft = trimLine(leftValue, leftWidth);
  const gap = " ".repeat(Math.max(0, innerWidth - displayWidth(safeLeft) - displayWidth(safeRight)));
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

  return `${trueColor("│ ", cliPalette.line)}${renderedLeft}${gap}${trueColor(safeRight, options.rightColor ?? cliPalette.lime)}${trueColor(" │", cliPalette.line)}`;
}

function panelLines(rows, options = {}) {
  const width = uiWidth();
  const accentColor = options.accentColor ?? cliPalette.lime;
  const title = trimLine(String(options.title ?? "").toUpperCase(), Math.max(0, width - 6));
  const top = title
    ? `${trueColor("╭─ ", cliPalette.line)}${trueColor(title, accentColor)}${trueColor(` ${"─".repeat(Math.max(0, width - displayWidth(title) - 5))}╮`, cliPalette.line)}`
    : trueColor(`╭${"─".repeat(Math.max(0, width - 2))}╮`, cliPalette.line);
  const divider = trueColor(`├${"─".repeat(Math.max(0, width - 2))}┤`, cliPalette.line);
  const footer = trueColor(`╰${"─".repeat(Math.max(0, width - 2))}╯`, cliPalette.line);

  return [
    top,
    ...rows.map((row) =>
      row.divider ? divider : panelLine(row.left ?? "", row.right ?? "", row),
    ),
    footer,
  ];
}

function printPanel(rows, options = {}) {
  console.log("");
  console.log(panelLines(rows, options).join("\n"));
}

function renderConnectionPanel(host) {
  printPanel(
    [
      {
        left: host,
        right: `● ${message("connected")}`,
        leftColor: cliPalette.ivory,
        rightColor: cliPalette.lime,
      },
    ],
    { title: message("uploadEndpoint") },
  );
}

function formatProgressElapsed(milliseconds) {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }

  const seconds = milliseconds / 1000;
  if (seconds < 60) {
    return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
}

function progressColor(value, foreground) {
  if (!useProgressColor) {
    return value;
  }

  return `\x1b[38;2;${foreground.join(";")}m${value}\x1b[0m`;
}

function createProgressReporter() {
  const frames = ["◐", "◓", "◑", "◒"];
  let frameIndex = 0;
  let startedAt = 0;
  let currentMessage = "";
  let timer = null;
  let lastRenderedAt = 0;

  function render() {
    if (!progressEnabled || !currentMessage) {
      return;
    }

    const elapsed = formatProgressElapsed(Date.now() - startedAt);
    const frame = useProgressAnimation ? frames[frameIndex % frames.length] : "●";
    frameIndex += 1;
    const plain = fitLine(`  ${frame}  ${currentMessage} · ${elapsed}`, uiWidth());
    process.stderr.write(`\r${progressColor(plain, cliPalette.lime)}`);
    lastRenderedAt = Date.now();
  }

  function stopTimer() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function clear() {
    if (!progressEnabled || !startedAt) {
      return;
    }

    stopTimer();
    process.stderr.write(`\r${" ".repeat(uiWidth())}\r`);
    currentMessage = "";
    startedAt = 0;
  }

  return {
    start(label) {
      if (!progressEnabled) {
        return;
      }

      stopTimer();
      startedAt = Date.now();
      currentMessage = label;
      frameIndex = 0;
      lastRenderedAt = 0;
      render();
      if (useProgressAnimation) {
        timer = setInterval(render, 120);
        timer.unref?.();
      }
    },
    update(label) {
      if (!progressEnabled) {
        return;
      }

      currentMessage = label;
      if (!useProgressAnimation && Date.now() - lastRenderedAt >= 120) {
        render();
      }
    },
    finish(label) {
      if (!progressEnabled || !startedAt) {
        return;
      }

      stopTimer();
      const elapsed = formatProgressElapsed(Date.now() - startedAt);
      const plain = fitLine(`  ✓  ${label} · ${elapsed}`, uiWidth());
      process.stderr.write(`\r${progressColor(plain, cliPalette.lime)}\n`);
      currentMessage = "";
      startedAt = 0;
    },
    clear,
  };
}

function renderSourcesPanel(sourceStats) {
  const active = sourceStats.filter((source) => source.entryCount > 0);
  const skipped = sourceStats.length - active.length;
  const rows = active.slice(0, 6).map((source) => ({
    left: `● ${source.label}`,
    leftSegments: [
      { value: "● ", color: cliPalette.lime },
      { value: source.label, color: cliPalette.ivory },
    ],
    right: `${source.fileCount} ${message("files")} · ${source.entryCount} ${rowLabel(source.entryCount)}`,
    rightColor: cliPalette.muted,
  }));

  if (rows.length === 0) {
    rows.push({ left: message("noLocalUsage"), leftColor: cliPalette.muted });
  }

  rows.push(
    { divider: true },
    {
      left: `${sourceStats.length} ${cliLocale === "zh" ? "个来源已检查" : "sources checked"}`,
      right: `${active.length} ${message("active")} · ${skipped} ${message("skipped")}`,
      leftColor: cliPalette.muted,
      rightColor: active.length ? cliPalette.lime : cliPalette.muted,
    },
  );
  printPanel(rows, { title: message("localSources") });
}

function renderPrivacyPanel() {
  console.log("");
  console.log(`${trueColor("◆", cliPalette.orange)} ${trueColor(message("privacy"), cliPalette.muted)}`);
}

function logo() {
  const privacyRows =
    uiWidth() < 56
      ? [
          {
            left: `● ${message("aggregatesOnly")}`,
            leftSegments: [
              { value: "● ", color: cliPalette.lime },
              { value: message("aggregatesOnly"), color: cliPalette.lime },
            ],
          },
          {
            left: message("contentStaysLocal"),
            leftColor: cliPalette.muted,
          },
        ]
      : [
          {
            left: `● ${message("aggregatesOnly")}`,
            leftSegments: [
              { value: "● ", color: cliPalette.lime },
              { value: message("aggregatesOnly"), color: cliPalette.lime },
            ],
            right: message("contentStaysLocal"),
            rightColor: cliPalette.muted,
          },
        ];

  return panelLines(
    [
      {
        left: message("collectorSubtitle"),
        right: `v${clientVersion}`,
        leftColor: cliPalette.ivory,
        rightColor: cliPalette.orange,
      },
      ...privacyRows,
    ],
    { title: "TokenRank" },
  ).join("\n");
}

async function printLogo() {
  if (process.env.TOKENRANK_NO_LOGO === "1" || !useColor) {
    return;
  }

  console.log(logo());
}

function printSection(title) {
  console.log("");

  if (useColor) {
    console.log(`${trueColor("●", cliPalette.lime)} ${trueColor(title.toUpperCase(), cliPalette.ivory)}`);
  } else {
    console.log(`== ${title.toUpperCase()} ==`);
  }
}

function printStep(label, detail = "") {
  if (useColor) {
    console.log(
      `${trueColor("›", cliPalette.lime)} ${trueColor(label, cliPalette.ivory)}${
        detail ? `  ${trueColor(detail, cliPalette.muted)}` : ""
      }`,
    );
  } else {
    console.log(`-> ${label}${detail ? ` ${detail}` : ""}`);
  }
}

function printSuccess(label, detail = "") {
  if (useColor) {
    console.log(`${trueColor("✓", cliPalette.lime)} ${trueColor(`${label}${detail ? `  ·  ${detail}` : ""}`, cliPalette.ivory)}`);
  } else {
    console.log(`OK ${label}${detail ? ` ${detail}` : ""}`);
  }
}

function printMuted(label) {
  console.log(trueColor(label, cliPalette.muted));
}

function renderToolsPanel() {
  const columns = uiWidth() >= 64 ? 3 : 2;
  const innerWidth = Math.max(1, uiWidth() - 4);
  const gap = 2;
  const cellWidth = Math.floor((innerWidth - gap * (columns - 1)) / columns);
  const rows = [];

  for (let rowIndex = 0; rowIndex < Math.ceil(TOOL_KEYS.length / columns); rowIndex += 1) {
    const leftSegments = [];
    for (let columnIndex = 0; columnIndex < columns; columnIndex += 1) {
      const itemIndex = rowIndex * columns + columnIndex;
      if (columnIndex > 0) {
        leftSegments.push({ value: " ".repeat(gap), color: cliPalette.line });
      }
      if (itemIndex >= TOOL_KEYS.length) {
        leftSegments.push({ value: " ".repeat(cellWidth), color: cliPalette.ivory });
        continue;
      }

      const tool = TOOL_KEYS[itemIndex];
      leftSegments.push(
        { value: `${String(itemIndex + 1).padStart(2, "0")} `, color: cliPalette.orange },
        { value: padCell(tool, Math.max(0, cellWidth - 3)), color: cliPalette.ivory },
      );
    }
    rows.push({ left: "", leftSegments });
  }

  printPanel(rows, { title: `${message("supportedTools")} · ${TOOL_KEYS.length}` });
}

function renderSourceAdaptersPanel() {
  const rows = [];
  for (const [index, source] of sourceDefinitions().entries()) {
    rows.push({
      left: "",
      leftSegments: [
        { value: `${String(index + 1).padStart(2, "0")} `, color: cliPalette.orange },
        { value: `${padCell(source.label, 18)} `, color: cliPalette.ivory },
        { value: source.tool, color: cliPalette.lime },
      ],
      right: `${source.roots.length} ${message("locations")}`,
      rightColor: cliPalette.muted,
    });

    for (const root of source.roots) {
      const localRoot = root.replace(homedir(), "~");
      for (const [lineIndex, line] of wrapDisplayLine(localRoot, Math.max(1, uiWidth() - 9)).entries()) {
        rows.push({
          left: `${lineIndex === 0 ? "›" : " "} ${line}`,
          leftColor: cliPalette.muted,
        });
      }
    }
  }

  printPanel(rows, { title: message("localSourceAdapters") });
}

function helpSectionLines(title, rows) {
  const width = uiWidth();
  const lines = [`${trueColor("●", cliPalette.lime)} ${trueColor(title.toUpperCase(), cliPalette.ivory)}`];

  if (width < 64) {
    for (const [syntax, description] of rows) {
      lines.push(`  ${trueColor(trimLine(syntax, width - 2), cliPalette.orange)}`);
      for (const line of wrapDisplayLine(description, width - 4)) {
        lines.push(`    ${trueColor(line, cliPalette.muted)}`);
      }
    }
    return lines;
  }

  const commandWidth = Math.min(
    28,
    Math.max(...rows.map(([syntax]) => displayWidth(syntax))),
  );
  const descriptionWidth = Math.max(1, width - commandWidth - 4);
  for (const [syntax, description] of rows) {
    lines.push(
      `  ${trueColor(padCell(syntax, commandWidth), cliPalette.orange)}  ${trueColor(trimLine(description, descriptionWidth), cliPalette.muted)}`,
    );
  }

  return lines;
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
  if (useColor) {
    const help = cliHelp[cliLocale];
    const usageLines = [
      `${trueColor("●", cliPalette.lime)} ${trueColor(help.usage.toUpperCase(), cliPalette.ivory)}`,
      `  ${trueColor("tokenrank <command> [options]", cliPalette.orange)}`,
      ...wrapDisplayLine(message("usageDescription"), uiWidth() - 4).map(
        (line) => `  ${trueColor(line, cliPalette.muted)}`,
      ),
    ];
    return [
      logo(),
      "",
      ...usageLines,
      "",
      ...helpSectionLines(help.commands, help.commandRows),
      "",
      ...helpSectionLines(help.options, help.optionRows),
    ].join("\n");
  }

  return [
    message("usageTitle"),
    "",
    message("commands"),
    "  tokenrank tools",
    "  tokenrank sources",
    "  tokenrank status [--json]",
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

function aggregateStatePath() {
  return path.join(homedir(), ".tokenrank", "aggregate-state.json");
}

function pendingSnapshotPath() {
  return path.join(homedir(), ".tokenrank", "pending-snapshot.json");
}

function pendingIncrementalPath() {
  return path.join(homedir(), ".tokenrank", "pending-incremental.json");
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
  boundary.setMinutes(collectorScheduleMinute(), 0, 0);
  if (boundary.getTime() > now.getTime()) {
    boundary.setHours(boundary.getHours() - 1);
  }
  return boundary;
}

function utcCalendarDate(value = currentTime()) {
  return value.toISOString().slice(0, 10);
}

function statefulEventStartDate(now = currentTime()) {
  const date = new Date(`${utcCalendarDate(now)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return utcCalendarDate(date);
}

function collectorScheduleMinute() {
  const configured = Number(process.env.TOKENRANK_SCHEDULE_MINUTE);
  if (Number.isInteger(configured) && configured >= 0 && configured <= 59) {
    return configured;
  }
  const digest = createHash("sha256").update(getDeviceId()).digest("hex").slice(0, 8);
  return Number.parseInt(digest, 16) % 60;
}

async function readJsonState(file, fallback, validator = null) {
  try {
    const value = JSON.parse(await readFile(file, "utf8"));
    return !validator || validator(value) ? value : fallback;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) {
      return fallback;
    }
    throw error;
  }
}

async function writeJsonStateAtomic(file, state) {
  const temporary = `${file}.${process.pid}.tmp`;
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, file);
}

function isAggregateState(value) {
  if (
    !isPlainObject(value) ||
    value.accountingVersion !== accountingVersion ||
    !isDeviceId(value.deviceId) ||
    !isSha256(value.accountId) ||
    !isSha256(value.endpointId) ||
    !isIsoCalendarDate(value.cutoverDate) ||
    !isIsoCalendarDate(value.lastFullSyncDate) ||
    value.lastFullSyncDate < value.cutoverDate ||
    !isIsoTimestamp(value.updatedAt) ||
    (value.revision !== null &&
      (!Number.isSafeInteger(value.revision) || value.revision < 0)) ||
    !isPlainObject(value.aggregates)
  ) {
    return false;
  }

  return Object.entries(value.aggregates).every(([key, row]) =>
    isStoredAggregateRow(key, row, value.cutoverDate),
  );
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isDeviceId(value) {
  return typeof value === "string" && /^tokenrank-[a-f0-9]{32}$/.test(value);
}

function isSha256(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isUuid(value) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function isIsoTimestamp(value) {
  if (typeof value !== "string") {
    return false;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isStoredAggregateRow(key, row, cutoverDate) {
  if (!isPlainObject(row)) {
    return false;
  }

  try {
    const normalized = normalizeEntry(row);
    return (
      normalized.date >= cutoverDate &&
      aggregateKey(normalized) === key &&
      ["date", "tool", "model", ...TOKEN_COUNT_FIELDS].every(
        (field) => row[field] === normalized[field],
      )
    );
  } catch {
    return false;
  }
}

function isPendingSnapshotState(value) {
  if (
    !isPlainObject(value) ||
    value.accountingVersion !== accountingVersion ||
    !isDeviceId(value.deviceId) ||
    !isSha256(value.accountId) ||
    !isSha256(value.endpointId) ||
    !isSha256(value.snapshotDigest) ||
    !isUuid(value.snapshotId) ||
    !isIsoCalendarDate(value.cutoverDate) ||
    !Number.isSafeInteger(value.batchSize) ||
    value.batchSize <= 0 ||
    value.batchSize > uploadBatchSize ||
    !Array.isArray(value.entries) ||
    value.entries.length > value.batchSize * 100 ||
    !isIsoTimestamp(value.createdAt)
  ) {
    return false;
  }

  const keys = new Set();
  for (const row of value.entries) {
    if (!isPlainObject(row)) {
      return false;
    }
    const key = aggregateKey(row);
    if (
      keys.has(key) ||
      !isStoredAggregateRow(key, row, value.cutoverDate)
    ) {
      return false;
    }
    keys.add(key);
  }

  return (
    value.snapshotDigest ===
    snapshotDigestFor(
      { deviceId: value.deviceId },
      {
        cutoverDate: value.cutoverDate,
        entries: value.entries,
        batchSize: value.batchSize,
      },
      value.accountId,
      value.endpointId,
    )
  );
}

function isPendingSnapshotCollection(value) {
  if (
    !isPlainObject(value) ||
    value.accountingVersion !== accountingVersion ||
    !Array.isArray(value.snapshots) ||
    value.snapshots.length === 0 ||
    !value.snapshots.every(isPendingSnapshotState)
  ) {
    return false;
  }

  const snapshotIds = new Set();
  const endpointDevices = new Set();
  for (const snapshot of value.snapshots) {
    const endpointDevice = `${snapshot.endpointId}\0${snapshot.deviceId}`;
    if (snapshotIds.has(snapshot.snapshotId) || endpointDevices.has(endpointDevice)) {
      return false;
    }
    snapshotIds.add(snapshot.snapshotId);
    endpointDevices.add(endpointDevice);
  }
  return true;
}

function isPendingIncrementalState(value) {
  if (
    !isPlainObject(value) ||
    value.accountingVersion !== accountingVersion ||
    !isDeviceId(value.deviceId) ||
    !isSha256(value.accountId) ||
    !isSha256(value.endpointId) ||
    !isIsoCalendarDate(value.cutoverDate) ||
    !isSha256(value.digest) ||
    !Array.isArray(value.entries) ||
    value.entries.length === 0 ||
    value.entries.length > uploadBatchSize * 100 ||
    !isIsoTimestamp(value.createdAt)
  ) {
    return false;
  }

  const keys = new Set();
  for (const row of value.entries) {
    if (!isPlainObject(row)) {
      return false;
    }
    const key = aggregateKey(row);
    if (keys.has(key) || !isStoredAggregateRow(key, row, value.cutoverDate)) {
      return false;
    }
    keys.add(key);
  }

  return value.digest === incrementalDigestFor(value);
}

async function readAggregateState() {
  return readJsonState(aggregateStatePath(), null, isAggregateState);
}

async function writeAggregateState(state) {
  return writeJsonStateAtomic(aggregateStatePath(), state);
}

async function readPendingSnapshots() {
  const value = await readJsonState(
    pendingSnapshotPath(),
    null,
    (candidate) =>
      isPendingSnapshotState(candidate) || isPendingSnapshotCollection(candidate),
  );
  if (!value) {
    return [];
  }
  return isPendingSnapshotState(value) ? [value] : value.snapshots;
}

async function writePendingSnapshots(snapshots) {
  if (snapshots.length === 0) {
    await rm(pendingSnapshotPath(), { force: true });
    return;
  }
  await writeJsonStateAtomic(
    pendingSnapshotPath(),
    snapshots.length === 1
      ? snapshots[0]
      : { accountingVersion, snapshots },
  );
}

async function upsertPendingSnapshot(state) {
  const snapshots = (await readPendingSnapshots()).filter(
    (snapshot) =>
      snapshot.endpointId !== state.endpointId || snapshot.deviceId !== state.deviceId,
  );
  snapshots.push(state);
  await writePendingSnapshots(snapshots);
}

async function removePendingSnapshots(predicate) {
  const snapshots = await readPendingSnapshots();
  await writePendingSnapshots(snapshots.filter((snapshot) => !predicate(snapshot)));
}

async function readPendingIncremental() {
  return readJsonState(
    pendingIncrementalPath(),
    null,
    isPendingIncrementalState,
  );
}

async function writePendingIncremental(state) {
  await writeJsonStateAtomic(pendingIncrementalPath(), state);
}

async function clearPendingIncremental() {
  await rm(pendingIncrementalPath(), { force: true });
}

async function readServiceState() {
  return readJsonState(serviceStatePath(), {});
}

async function writeServiceState(state) {
  return writeJsonStateAtomic(serviceStatePath(), state);
}

async function recordStartedLocalUpload(accountId, endpointId, now = currentTime()) {
  const state = await readServiceState();
  await writeServiceState({
    ...state,
    lastAttemptAt: now.toISOString(),
    lastAttemptAccountId: accountId,
    lastAttemptEndpointId: endpointId,
    lastErrorCode: "UPLOAD_IN_PROGRESS",
  });
}

async function recordSuccessfulLocalUpload(accountId, endpointId, now = currentTime()) {
  const state = await readServiceState();
  await writeServiceState({
    ...state,
    lastAttemptAt: now.toISOString(),
    lastSuccessfulAt: now.toISOString(),
    lastSuccessfulAccountId: accountId,
    lastSuccessfulEndpointId: endpointId,
    lastScheduledBoundary: latestScheduleBoundary(now).toISOString(),
    lastErrorCode: null,
  });
}

async function recordFailedLocalUpload(now = currentTime()) {
  const state = await readServiceState();
  await writeServiceState({
    ...state,
    lastAttemptAt: now.toISOString(),
    lastErrorCode: "UPLOAD_FAILED",
  });
}

async function inspectCollectorLock(file) {
  let raw = null;
  try {
    raw = await readFile(file, "utf8");
    const lock = JSON.parse(raw);

    if (!Number.isSafeInteger(lock.pid) || lock.pid <= 0) {
      return { stale: true, raw };
    }

    try {
      process.kill(lock.pid, 0);
      return { stale: false, raw };
    } catch (error) {
      return { stale: error?.code === "ESRCH", raw };
    }
  } catch {
    return { stale: true, raw };
  }
}

async function takeOverStaleCollectorLock(file, observed) {
  const tombstone = `${file}.stale.${randomUUID()}`;
  try {
    await rename(file, tombstone);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }
    throw error;
  }

  let movedRaw = null;
  try {
    movedRaw = await readFile(tombstone, "utf8");
  } catch {
    // A malformed stale lock is still safe to quarantine.
  }
  if (observed.raw !== null && movedRaw !== observed.raw) {
    try {
      if (!(await pathExists(file))) {
        await rename(tombstone, file);
      }
    } catch {
      // Keep the mismatched owner quarantined instead of deleting it.
    }
    return false;
  }
  await rm(tombstone, { force: true });
  return true;
}

async function withCollectorLock(operation, options = {}) {
  const file = collectorLockPath();
  const nonce = randomUUID();
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });

  for (;;) {
    try {
      await writeFile(
        file,
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), nonce })}\n`,
        { flag: "wx", mode: 0o600 },
      );
      break;
    } catch (error) {
      if (error?.code === "EEXIST") {
        const observed = await inspectCollectorLock(file);
        if (observed.stale && (await takeOverStaleCollectorLock(file, observed))) {
          continue;
        }

        if (options.failWhenLocked) {
          throw new Error(message("collectorLocked"));
        }
        return { skipped: true, reason: "locked" };
      }

      throw error;
    }
  }

  try {
    return await operation();
  } finally {
    try {
      const current = JSON.parse(await readFile(file, "utf8"));
      if (current.nonce === nonce) {
        await rm(file, { force: true });
      }
    } catch {
      // A missing or replaced lock is never deleted blindly.
    }
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
  printSuccess(message("removedWebhook"));
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

function dateFromValue(value) {
  if (typeof value === "string") {
    if (isIsoCalendarDate(value)) {
      return value;
    }

    const parsed = new Date(value);

    if (Number.isFinite(parsed.getTime())) {
      return utcCalendarDate(parsed);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);

    if (Number.isFinite(parsed.getTime())) {
      return utcCalendarDate(parsed);
    }
  }

  return null;
}

function pickDate(record, fallbackDate) {
  for (const key of ["timestamp", "createdAt", "created_at", "startedAt", "started_at", "date", "current_date"]) {
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
    return Number.isFinite(parsed.getTime()) ? utcCalendarDate(parsed) : fallbackDate;
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

function sourceFileLimit() {
  const configured = Number(process.env.TOKENRANK_MAX_SOURCE_FILES ?? 100_000);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : 100_000;
}

async function collectFiles(root, maxFiles = sourceFileLimit(), options = {}) {
  const health = options.health ?? {};
  const rootStat = await pathExists(root);

  if (!rootStat) {
    return [];
  }

  if (rootStat.isFile()) {
    return isScannableFile(root, options) && (!options.includeFile || options.includeFile(root))
      ? [root]
      : [];
  }

  const files = [];
  const queue = [root];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex];
    queueIndex += 1;
    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      health.readErrors = (health.readErrors ?? 0) + 1;
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        queue.push(fullPath);
      } else if (
        entry.isFile() &&
        isScannableFile(fullPath, options) &&
        (!options.includeFile || options.includeFile(fullPath))
      ) {
        if (files.length >= maxFiles) {
          health.truncated = true;
          return files;
        }
        files.push(fullPath);
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

async function* readBoundedLines(file, health = {}) {
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
          health.skippedOversize = (health.skippedOversize ?? 0) + 1;
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
    for (const entry of await readSqliteUsage(file, tool, fallbackDate, source.health)) {
      yield sourceEntry(entry, file, source, recordIndex);
      recordIndex += 1;
    }
    return;
  }

  if (file.endsWith(".jsonl")) {
    let context = { date: fallbackDate, model: null };

    for await (const line of readBoundedLines(file, source.health)) {
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
    if (source.health) {
      source.health.skippedOversize = (source.health.skippedOversize ?? 0) + 1;
    }
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

async function readSqliteUsage(file, tool, fallbackDate, health = {}) {
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
      "timestamp",
      "createdAt",
      "created_at",
      "startedAt",
      "started_at",
      "date",
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
        "limit 10001",
      ].join(" "),
    );

    if (rows.length > 10000) {
      health.truncated = true;
    }
    for (const row of rows.slice(0, 10000)) {
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

    for (const key of TOKEN_COUNT_FIELDS) {
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

async function collectSourceFiles(source, options = {}) {
  const files = [];

  for (const root of source.roots) {
    const rootFiles = await collectFiles(root, sourceFileLimit(), {
      includeLogs: source.includeLogs,
      includeFile: source.includeFile,
      health: options.health,
    });
    files.push(...rootFiles);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function scanLocalUsage(args, options = {}) {
  const scanOptions = getScanOptions(args);
  const tool = scanOptions.tool;
  const since = options.sinceOverride ?? scanOptions.since;
  const health = options.health ?? { truncated: false, readErrors: 0, skippedOversize: 0 };
  const accumulator = createUsageAccumulator();
  const showProgress = Boolean(options.progress);
  const showPanels = Boolean(options.panels);
  const sources = sourceDefinitions().filter((source) => !tool || source.tool === tool);
  const sourceStats = [];
  const discoveredSources = [];
  const reporter = createProgressReporter();
  let discoveredFileCount = 0;
  let scannedFileCount = 0;
  let scannedRowCount = 0;

  if (showPanels && !useColor) {
    printSection(message("scanLocalUsage"));
    printMuted(
      `${message("scope", { scope: tool || message("allTools") })}${since ? ` · ${since}` : ""}`,
    );
  }

  try {
    if (showProgress && sources.length > 0) {
      reporter.start(
        message("discoveringSourceProgress", {
          source: sources[0].label,
          current: 1,
          total: sources.length,
          files: 0,
        }),
      );
    }

    for (const [sourceIndex, source] of sources.entries()) {
      const files = await collectSourceFiles(source, {
        health,
      });
      discoveredFileCount += files.length;
      discoveredSources.push({ source, files });
      if (showProgress) {
        reporter.update(
          message("discoveringSourceProgress", {
            source: source.label,
            current: sourceIndex + 1,
            total: sources.length,
            files: discoveredFileCount,
          }),
        );
      }
    }

    for (const [sourceIndex, { source, files }] of discoveredSources.entries()) {
      let sourceEntryCount = 0;

      if (showPanels && !useColor) {
        printStep(message("scanning", { source: source.label }), source.tool);
      }

      for (const file of files) {
        if (showProgress) {
          reporter.update(
            message("scanningSourceProgress", {
              source: source.label,
              current: sourceIndex + 1,
              total: sources.length,
              fileCurrent: scannedFileCount,
              fileTotal: discoveredFileCount,
              rows: scannedRowCount,
            }),
          );
        }

        for await (const entry of readUsageFile(file, source.tool, {
          id: source.id ?? `${source.tool}-local`,
          priority: source.priority ?? 100,
          health,
        })) {
          sourceEntryCount += 1;
          scannedRowCount += 1;

          if (!since || entry.date >= since) {
            accumulator.add(entry);
          }

          if (showProgress && scannedRowCount % 100 === 0) {
            reporter.update(
              message("scanningSourceProgress", {
                source: source.label,
                current: sourceIndex + 1,
                total: sources.length,
                fileCurrent: scannedFileCount,
                fileTotal: discoveredFileCount,
                rows: scannedRowCount,
              }),
            );
          }
        }

        scannedFileCount += 1;
      }

      sourceStats.push({
        label: source.label,
        tool: source.tool,
        fileCount: files.length,
        entryCount: sourceEntryCount,
      });

      if (showPanels && !useColor) {
        printMuted(
          `   ${source.tool}: ${files.length} ${message("files")}, ${sourceEntryCount} ${rowLabel(sourceEntryCount)}`,
        );
      }
    }

    const aggregatedEntries = accumulator.values();

    if (showProgress) {
      reporter.finish(
        message("scanProgressSummary", {
          sources: sources.length,
          files: discoveredFileCount,
          rows: scannedRowCount,
          aggregates: aggregatedEntries.length,
        }),
      );
    }

    if (showPanels) {
      if (useColor) {
        renderSourcesPanel(sourceStats);
        renderPrivacyPanel();
      } else {
        printSuccess(
          message("scanComplete"),
          `${accumulator.filteredCount} ${rowLabel(accumulator.filteredCount)} -> ${accumulator.uniqueCount} ${message("uniqueRows")} -> ${aggregatedEntries.length} ${message("aggregateRows")}`,
        );
      }
    }

    return options.returnMeta ? { entries: aggregatedEntries, health } : aggregatedEntries;
  } catch (error) {
    reporter.clear();
    throw error;
  }
}

function printSources() {
  if (useColor) {
    renderSourceAdaptersPanel();
    return;
  }

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
    accountingVersion,
    deviceId: typeof source.deviceId === "string" && source.deviceId.trim() ? source.deviceId.trim() : getDeviceId(),
    clientVersion: typeof source.clientVersion === "string" && source.clientVersion.trim() ? source.clientVersion.trim() : clientVersion,
    timezone: typeof source.timezone === "string" && source.timezone.trim() ? source.timezone.trim() : getTimezone(),
    generatedAt: typeof source.generatedAt === "string" && source.generatedAt.trim() ? source.generatedAt.trim() : currentTime().toISOString(),
    entries,
  };
}

function aggregateKey(entry) {
  return JSON.stringify([entry.date, entry.tool, entry.model]);
}

function snapshotDigestFor(payload, plan, accountId, endpointId) {
  return createHash("sha256")
    .update(`${accountingVersion}\0${payload.deviceId}\0${accountId}\0${endpointId}\0`)
    .update(`${plan.cutoverDate}\0${plan.batchSize ?? uploadBatchSize}\0`)
    .update(JSON.stringify(plan.entries))
    .digest("hex");
}

function incrementalDigestFor(state) {
  return createHash("sha256")
    .update(
      `${accountingVersion}\0${state.deviceId}\0${state.accountId}\0${state.endpointId}\0`,
    )
    .update(`${state.cutoverDate}\0${JSON.stringify(state.entries)}`)
    .digest("hex");
}

function mergeHighWaterEntries(...groups) {
  const rows = new Map();
  for (const group of groups) {
    for (const rawEntry of group ?? []) {
      const entry = normalizeEntry(rawEntry);
      const key = aggregateKey(entry);
      const previous = rows.get(key);
      if (!previous || aggregateIsNonDecreasing(entry, previous)) {
        rows.set(key, entry);
        continue;
      }
      if (aggregateIsNonDecreasing(previous, entry)) {
        continue;
      }
      const input = Math.max(previous.input, entry.input);
      const output = Math.max(previous.output, entry.output);
      const cacheRead = Math.max(previous.cacheRead, entry.cacheRead);
      const cacheWrite = Math.max(previous.cacheWrite, entry.cacheWrite);
      rows.set(key, {
        ...entry,
        input,
        output,
        cacheRead,
        cacheWrite,
        total: canonicalTotalFor(entry.tool, input, output, cacheRead, cacheWrite),
      });
    }
  }
  return sortedAggregateRows(rows);
}

function aggregateStateFromEntries(entries) {
  return Object.fromEntries(entries.map((entry) => [aggregateKey(entry), entry]));
}

async function stabilizeFullSnapshotPlan(
  payload,
  plan,
  accountId,
  endpointId,
  pending = undefined,
) {
  if (pending === undefined) {
    pending = (await readPendingSnapshots()).find(
      (snapshot) =>
        snapshot.accountId === accountId &&
        snapshot.endpointId === endpointId &&
        snapshot.deviceId === payload.deviceId,
    );
  }
  if (
    pending?.endpointId === endpointId &&
    pending.deviceId === payload.deviceId
  ) {
    return {
      ...plan,
      entries: pending.entries,
      aggregates: aggregateStateFromEntries(pending.entries),
      snapshotId: pending.snapshotId,
      cutoverDate: pending.cutoverDate,
      batchSize: pending.batchSize,
    };
  }

  const batchSize = uploadBatchSize;
  const stablePlan = { ...plan, batchSize };
  const snapshotDigest = snapshotDigestFor(payload, stablePlan, accountId, endpointId);
  const snapshotId = randomUUID();
  await upsertPendingSnapshot({
    accountingVersion,
    deviceId: payload.deviceId,
    accountId,
    endpointId,
    snapshotDigest,
    snapshotId,
    cutoverDate: stablePlan.cutoverDate,
    batchSize,
    entries: stablePlan.entries,
    createdAt: currentTime().toISOString(),
  });
  return { ...stablePlan, snapshotId };
}

function aggregateIsNonDecreasing(next, previous) {
  return TOKEN_COUNT_FIELDS.every((field) => next[field] >= previous[field]);
}

function aggregateCountsEqual(next, previous) {
  return TOKEN_COUNT_FIELDS.every((field) => next[field] === previous[field]);
}

function reconciliationDate(cutoverDate, now = currentTime()) {
  return cutoverDate > utcCalendarDate(now) ? cutoverDate : utcCalendarDate(now);
}

function planStatefulSync(
  payload,
  previousState,
  accountId,
  endpointId,
  now = currentTime(),
  forcedCutoverDate = null,
) {
  const deviceStateMatches =
    previousState?.deviceId === payload.deviceId && previousState.accountId === accountId;
  const endpointStateMatches = deviceStateMatches && previousState.endpointId === endpointId;
  const cutoverDate =
    forcedCutoverDate ?? (deviceStateMatches ? previousState.cutoverDate : utcCalendarDate(now));
  const aggregates = deviceStateMatches
    ? Object.fromEntries(
        Object.entries(previousState.aggregates).filter(([, entry]) => entry.date >= cutoverDate),
      )
    : {};
  const changedEntries = [];

  for (const entry of payload.entries) {
    if (entry.date < cutoverDate) {
      continue;
    }
    const key = aggregateKey(entry);
    const previous = aggregates[key];
    if (
      !previous ||
      (aggregateIsNonDecreasing(entry, previous) && !aggregateCountsEqual(entry, previous))
    ) {
      aggregates[key] = entry;
      changedEntries.push(entry);
    }
  }

  const highWaterEntries = sortedAggregateRows(new Map(Object.entries(aggregates)));
  const full =
    forcedCutoverDate !== null ||
    !deviceStateMatches ||
    !endpointStateMatches ||
    previousState.lastFullSyncDate !== reconciliationDate(cutoverDate, now);

  if (full) {
    return {
      syncMode: "full",
      entries: highWaterEntries,
      aggregates,
      snapshotId: null,
      cutoverDate,
    };
  }

  return {
    syncMode: "incremental",
    entries: changedEntries,
    aggregates,
    snapshotId: null,
    cutoverDate,
  };
}

function buildProtocolBatches(payload, plan) {
  const base = {
    accountingVersion,
    deviceId: payload.deviceId,
    clientVersion: payload.clientVersion,
    timezone: payload.timezone,
    generatedAt: payload.generatedAt,
    syncMode: plan.syncMode,
  };

  if (plan.syncMode === "full") {
    const batchSize = plan.batchSize ?? uploadBatchSize;
    const batchCount = Math.max(1, Math.ceil(plan.entries.length / batchSize));
    if (batchCount > 100) {
      throw new Error(message("snapshotTooLarge"));
    }
    return Array.from({ length: batchCount }, (_, batchIndex) => {
      const entries = plan.entries.slice(
        batchIndex * batchSize,
        (batchIndex + 1) * batchSize,
      );
      return {
        ...base,
        snapshotId: plan.snapshotId,
        cutoverDate: plan.cutoverDate,
        batchIndex,
        batchCount,
        batchHash: createHash("sha256").update(JSON.stringify(entries)).digest("hex"),
        entries,
      };
    });
  }

  return Array.from(
    { length: Math.ceil(plan.entries.length / uploadBatchSize) },
    (_, batchIndex) => ({
      ...base,
      entries: plan.entries.slice(
        batchIndex * uploadBatchSize,
        (batchIndex + 1) * uploadBatchSize,
      ),
    }),
  );
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

async function systemProxyFor(targetUrl, signal) {
  if (process.env.TOKENRANK_TEST_SYSTEM_PROXY) {
    return normalizeProxyUrl(process.env.TOKENRANK_TEST_SYSTEM_PROXY);
  }

  if (process.env.TOKENRANK_DISABLE_SYSTEM_PROXY === "1" || process.platform !== "darwin") {
    return null;
  }

  try {
    const { stdout } = await execFileAsync("scutil", ["--proxy"], { signal });
    return parseMacSystemProxy(stdout, targetUrl);
  } catch {
    return null;
  }
}

async function proxyFor(targetUrl, signal) {
  if (shouldBypassProxy(targetUrl.hostname)) {
    return null;
  }

  return explicitProxyFor(targetUrl) ?? (await systemProxyFor(targetUrl, signal));
}

function responseFromNode(res) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const fail = (error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    res.on("end", () => {
      if (settled) {
        return;
      }
      settled = true;
      const status = res.statusCode ?? 0;

      resolve({
        ok: status >= 200 && status < 300,
        status,
        headers: {
          get(name) {
            const value = res.headers[String(name).toLowerCase()];
            return Array.isArray(value) ? value.join(", ") : value ?? null;
          },
        },
        text: async () => Buffer.concat(chunks).toString("utf8"),
      });
    });
    res.on("aborted", () => fail(new Error(message("proxyResponseInvalid"))));
    res.on("close", () => {
      if (!res.complete) {
        fail(new Error(message("proxyResponseInvalid")));
      }
    });
    res.on("error", fail);
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
  const headers = Object.fromEntries(
    headerText
      .split("\r\n")
      .slice(1)
      .map((line) => line.match(/^([^:]+):\s*(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1].toLowerCase(), match[2]]),
  );
  const isChunked = /\r\ntransfer-encoding:\s*chunked\b/i.test(headerText);
  const body = buffer.subarray(headerEnd + 4);
  const responseBody = isChunked ? decodeChunkedBody(body) : body;

  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers[String(name).toLowerCase()] ?? null },
    text: async () => responseBody.toString("utf8"),
  };
}

function requestViaHttpProxy(targetUrl, proxyUrl, { method, body, headers, signal }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", abortRequest);
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback(value);
    };
    const fail = (error) => finish(reject, error);
    const abortRequest = () => {
      const error = signal?.reason instanceof Error
        ? signal.reason
        : new Error(message("requestTimedOut"));
      request.destroy(error);
      fail(error);
    };
    const request = (proxyUrl.protocol === "https:" ? httpsRequest : httpRequest)(
      {
        protocol: proxyUrl.protocol,
        hostname: proxyUrl.hostname,
        port: proxyPort(proxyUrl),
        method,
        path: targetUrl.href,
        headers: {
          ...headers,
          host: targetUrl.host,
        },
      },
      (res) => {
        responseFromNode(res).then(
          (response) => finish(resolve, response),
          fail,
        );
      },
    );

    if (signal?.aborted) {
      abortRequest();
      return;
    }
    signal?.addEventListener("abort", abortRequest, { once: true });
    request.on("error", fail);
    request.end(body || undefined);
  });
}

function requestViaHttpsProxy(targetUrl, proxyUrl, { method, body, headers, signal }) {
  return new Promise((resolve, reject) => {
    const targetPort = Number(targetUrl.port || 443);
    let tunnelSocket = null;
    let tlsSocket = null;
    let settled = false;
    const cleanup = () => signal?.removeEventListener("abort", abortRequest);
    const finish = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };
    const fail = (error) => finish(reject, error);
    const abortRequest = () => {
      const error = signal?.reason instanceof Error
        ? signal.reason
        : new Error(message("requestTimedOut"));
      proxyRequest.destroy(error);
      tunnelSocket?.destroy(error);
      tlsSocket?.destroy(error);
      fail(error);
    };
    const proxyRequest = (proxyUrl.protocol === "https:" ? httpsRequest : httpRequest)({
      protocol: proxyUrl.protocol,
      hostname: proxyUrl.hostname,
      port: proxyPort(proxyUrl),
      method: "CONNECT",
      path: `${targetUrl.hostname}:${targetPort}`,
      headers: {
        host: `${targetUrl.hostname}:${targetPort}`,
      },
      signal,
    });

    if (signal?.aborted) {
      abortRequest();
      return;
    }
    signal?.addEventListener("abort", abortRequest, { once: true });

    proxyRequest.on("connect", (res, socket) => {
      tunnelSocket = socket;
      if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
        socket.destroy();
        fail(new Error(message("proxyConnectionFailed", { status: res.statusCode ?? 0 })));
        return;
      }

      tlsSocket = tlsConnect({
        socket,
        servername: targetUrl.hostname,
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED === "0" ? false : undefined,
      });
      tlsSocket.once("error", fail);
      tlsSocket.once("secureConnect", () => {
        const responseChunks = [];
        const settleResponse = () => {
          try {
            finish(resolve, responseFromRawHttp(Buffer.concat(responseChunks)));
          } catch (error) {
            fail(error);
          }
        };

        tlsSocket.on("data", (chunk) => responseChunks.push(Buffer.from(chunk)));
        tlsSocket.once("end", settleResponse);
        tlsSocket.once("close", settleResponse);
        const requestHeaders = Object.entries(headers)
          .filter(([name]) => name.toLowerCase() !== "host")
          .map(([name, value]) => `${name}: ${value}`);
        tlsSocket.write(
          [
            `${method} ${targetUrl.pathname}${targetUrl.search} HTTP/1.1`,
            `Host: ${targetUrl.host}`,
            ...requestHeaders,
            "",
            body,
          ].join("\r\n"),
        );
      });
    });
    proxyRequest.on("error", fail);
    proxyRequest.end();
  });
}

async function requestWebhook(webhookUrl, { method, body = "", signal }) {
  const targetUrl = new URL(webhookUrl);
  const headers = { connection: "close" };
  if (body) {
    headers["content-type"] = "application/json";
    headers["content-length"] = String(Buffer.byteLength(body));
  }
  const proxyUrl = await proxyFor(targetUrl, signal);

  if (!proxyUrl) {
    return fetch(webhookUrl, {
      method,
      headers,
      body: body || undefined,
      signal,
    });
  }

  if (targetUrl.protocol === "http:") {
    return requestViaHttpProxy(targetUrl, proxyUrl, { method, body, headers, signal });
  }

  if (targetUrl.protocol === "https:") {
    return requestViaHttpsProxy(targetUrl, proxyUrl, { method, body, headers, signal });
  }

  throw new Error(message("unsupportedWebhookProtocol", { protocol: targetUrl.protocol }));
}

async function postJson(webhookUrl, payload, signal) {
  return requestWebhook(webhookUrl, {
    method: "POST",
    body: JSON.stringify(payload),
    signal,
  });
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

function isRetryableHttpStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

function retryAfterMilliseconds(response) {
  const value = response?.headers?.get?.("retry-after");
  if (!value) {
    return null;
  }
  const seconds = Number(value);
  const milliseconds = Number.isFinite(seconds)
    ? seconds * 1000
    : new Date(value).getTime() - Date.now();
  return Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 5 * 60 * 1000
    ? milliseconds
    : null;
}

function exponentialRetryDelay(attempt, response = null) {
  const configured = Number(process.env.TOKENRANK_RETRY_BASE_MS ?? 1000);
  const base = Number.isFinite(configured) && configured >= 0 ? configured : 1000;
  const retryAfter = retryAfterMilliseconds(response);
  if (retryAfter !== null) {
    return retryAfter;
  }
  const jitter = process.env.TOKENRANK_TEST_NO_RETRY_JITTER === "1" ? 1 : 0.75 + Math.random() * 0.5;
  return Math.min(30_000, Math.round(base * 2 ** attempt * jitter));
}

function webhookRequestTimeoutMilliseconds() {
  const configured = Number(process.env.TOKENRANK_REQUEST_TIMEOUT_MS ?? 30_000);
  return Number.isSafeInteger(configured) && configured > 0 && configured <= 5 * 60 * 1000
    ? configured
    : 30_000;
}

async function webhookRequestWithDeadline(webhookUrl, { method, payload = null }) {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(message("requestTimedOut"))),
    webhookRequestTimeoutMilliseconds(),
  );
  try {
    const response = payload === null
      ? await requestWebhook(webhookUrl, { method, signal: controller.signal })
      : await postJson(webhookUrl, payload, controller.signal);
    const responseText = await response.text();
    return { response, responseText };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWebhookAccountId(webhookUrl) {
  for (let attempt = 0; attempt < maxUploadAttempts; attempt += 1) {
    let response;
    let responseText;
    try {
      ({ response, responseText } = await webhookRequestWithDeadline(webhookUrl, {
        method: "GET",
      }));
    } catch (error) {
      if (attempt + 1 >= maxUploadAttempts) {
        throw error;
      }
      await sleep(exponentialRetryDelay(attempt));
      continue;
    }

    let responseJson = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }
    if (
      response.ok &&
      responseJson?.status === 0 &&
      isSha256(responseJson.accountId)
    ) {
      return responseJson.accountId;
    }
    if (isRetryableHttpStatus(response.status) && attempt + 1 < maxUploadAttempts) {
      await sleep(exponentialRetryDelay(attempt, response));
      continue;
    }
    const error = responseJson?.error || responseText || `HTTP ${response.status}`;
    throw new Error(message("uploadFailed", { error }));
  }
  throw new Error(message("uploadFailed", { error: "identity retry limit reached" }));
}

class CutoverDateConflictError extends Error {
  constructor(expectedCutoverDate, revision) {
    super(message("uploadFailed", { error: "CUTOVER_DATE_CONFLICT" }));
    this.name = "CutoverDateConflictError";
    this.expectedCutoverDate = expectedCutoverDate;
    this.revision = revision;
  }
}

class ActiveSnapshotConflictError extends Error {
  constructor(activeSnapshotId, expectedCutoverDate, revision) {
    super(message("uploadFailed", { error: "ACTIVE_SNAPSHOT_CONFLICT" }));
    this.name = "ActiveSnapshotConflictError";
    this.activeSnapshotId = activeSnapshotId;
    this.expectedCutoverDate = expectedCutoverDate;
    this.revision = revision;
  }
}

function parseActiveSnapshotConflict(response, responseJson) {
  if (
    response.status !== 409 ||
    !isPlainObject(responseJson) ||
    responseJson.status !== -1 ||
    responseJson.error !== "ACTIVE_SNAPSHOT_CONFLICT" ||
    !isUuid(responseJson.activeSnapshotId) ||
    !isIsoCalendarDate(responseJson.expectedCutoverDate) ||
    !Number.isSafeInteger(responseJson.revision) ||
    responseJson.revision < 0
  ) {
    return null;
  }

  return new ActiveSnapshotConflictError(
    responseJson.activeSnapshotId,
    responseJson.expectedCutoverDate,
    responseJson.revision,
  );
}

function parseCutoverDateConflict(response, responseJson) {
  if (
    response.status !== 409 ||
    !isPlainObject(responseJson) ||
    responseJson.status !== -1 ||
    responseJson.error !== "CUTOVER_DATE_CONFLICT" ||
    !isIsoCalendarDate(responseJson.expectedCutoverDate) ||
    !Number.isSafeInteger(responseJson.revision) ||
    responseJson.revision < 0
  ) {
    return null;
  }

  return new CutoverDateConflictError(
    responseJson.expectedCutoverDate,
    responseJson.revision,
  );
}

function isValidUploadSuccess(responseJson, batch) {
  return (
    isPlainObject(responseJson) &&
    responseJson.status === 0 &&
    Number.isSafeInteger(responseJson.uploaded) &&
    responseJson.uploaded === batch.entries.length &&
    Number.isSafeInteger(responseJson.revision) &&
    responseJson.revision >= 0 &&
    (batch.syncMode !== "full" || typeof responseJson.committed === "boolean")
  );
}

async function sendUploadBatch(webhookUrl, batch) {
  for (let attempt = 0; attempt < maxUploadAttempts; attempt += 1) {
    let response;
    let responseText;
    try {
      ({ response, responseText } = await webhookRequestWithDeadline(webhookUrl, {
        method: "POST",
        payload: batch,
      }));
    } catch (error) {
      if (attempt + 1 >= maxUploadAttempts) {
        throw error;
      }
      await sleep(exponentialRetryDelay(attempt));
      continue;
    }

    let responseJson = null;
    try {
      responseJson = responseText ? JSON.parse(responseText) : null;
    } catch {
      responseJson = null;
    }

    if (response.ok && isValidUploadSuccess(responseJson, batch)) {
      return responseJson;
    }

    const activeSnapshotConflict = parseActiveSnapshotConflict(response, responseJson);
    if (activeSnapshotConflict) {
      throw activeSnapshotConflict;
    }

    const cutoverConflict = parseCutoverDateConflict(response, responseJson);
    if (cutoverConflict) {
      throw cutoverConflict;
    }

    if (isRetryableHttpStatus(response.status) && attempt + 1 < maxUploadAttempts) {
      await sleep(exponentialRetryDelay(attempt, response));
      continue;
    }

    const error = responseJson?.error || responseText || `HTTP ${response.status}`;
    throw new Error(message("uploadFailed", { error }));
  }
  throw new Error(message("uploadFailed", { error: "retry limit reached" }));
}

async function upload(args, options = {}) {
  const file = getFileArg(args);
  const stateful = isFullLocalUpload(args, file);
  try {
    if (stateful && options.collectorLock !== false) {
      return await withCollectorLock(
        () => uploadUnlocked(args, { ...options, collectorLock: false }, file),
        { failWhenLocked: true },
      );
    }
    return await uploadUnlocked(args, options, file);
  } catch (error) {
    if (stateful && options.trackState !== false) {
      try {
        await recordFailedLocalUpload();
      } catch {
        // Preserve the actionable upload error if local health-state persistence also fails.
      }
    }
    throw error;
  }
}

async function scanUploadInput(args, { quiet, sinceOverride, requireComplete }) {
  const scanHealth = { truncated: false, readErrors: 0, skippedOversize: 0 };
  const scanResult = await scanLocalUsage(args, {
    progress: !quiet,
    panels: !quiet,
    sinceOverride,
    health: scanHealth,
    returnMeta: true,
  });
  if (
    requireComplete &&
    (scanResult.health.truncated ||
      scanResult.health.readErrors > 0 ||
      scanResult.health.skippedOversize > 0)
  ) {
    throw new Error(message("incompleteCutover"));
  }
  return { entries: scanResult.entries };
}

async function uploadUnlocked(args, options = {}, file = getFileArg(args)) {
  const quiet = Boolean(options.quiet);
  if (!quiet) {
    await printLogo();
  }
  const config = await readConfig();
  const webhookUrl = requireWebhookUrl(config.webhookUrl);
  const stateful = isFullLocalUpload(args, file);
  const endpointId = createHash("sha256").update(webhookUrl).digest("hex");
  const deviceId = getDeviceId();
  let previousAggregateState = await readAggregateState();
  let pendingSnapshots = stateful ? await readPendingSnapshots() : [];
  let pendingIncremental = stateful ? await readPendingIncremental() : null;
  const cachedAccountIds = new Set(
    [
      previousAggregateState,
      ...pendingSnapshots,
      pendingIncremental,
    ]
      .filter(
        (state) =>
          state?.endpointId === endpointId && state.deviceId === deviceId,
      )
      .map((state) => state.accountId),
  );
  const accountId =
    cachedAccountIds.size === 1
      ? [...cachedAccountIds][0]
      : await fetchWebhookAccountId(webhookUrl);
  const stateIdentityChanged =
    (previousAggregateState &&
      (previousAggregateState.accountId !== accountId ||
        previousAggregateState.deviceId !== deviceId)) ||
    pendingSnapshots.some(
      (snapshot) => snapshot.accountId !== accountId || snapshot.deviceId !== deviceId,
    ) ||
    (pendingIncremental &&
      (pendingIncremental.accountId !== accountId ||
        pendingIncremental.deviceId !== deviceId));
  if (stateIdentityChanged) {
    await rm(aggregateStatePath(), { force: true });
    await writePendingSnapshots([]);
    await clearPendingIncremental();
    previousAggregateState = null;
    pendingSnapshots = [];
    pendingIncremental = null;
  }
  const replayablePendingSnapshot =
    pendingSnapshots.find(
      (snapshot) =>
        snapshot.accountId === accountId &&
        snapshot.endpointId === endpointId &&
        snapshot.deviceId === deviceId,
    ) ?? null;
  const retainedIncremental =
    pendingIncremental?.accountId === accountId && pendingIncremental.deviceId === deviceId
      ? pendingIncremental
      : null;
  if (stateful && options.trackState !== false) {
    await recordStartedLocalUpload(accountId, endpointId);
  }
  if (!quiet) {
    if (useColor) {
      renderConnectionPanel(new URL(webhookUrl).host);
    } else {
      printSection(message("upload"));
      printStep(message("webhookReady"), new URL(webhookUrl).origin);
    }
  }
  let raw;
  if (file) {
    const fileReporter = createProgressReporter();
    if (!quiet) {
      fileReporter.start(message("loadingUsageFileProgress", { file }));
    }
    try {
      raw = JSON.parse(await readFile(file, "utf8"));
      fileReporter.clear();
    } catch (error) {
      fileReporter.clear();
      throw error;
    }
  } else if (replayablePendingSnapshot) {
    raw = { entries: replayablePendingSnapshot.entries };
  } else {
    const eventStartDate = stateful ? statefulEventStartDate() : null;
    raw = await scanUploadInput(args, {
      quiet,
      sinceOverride: eventStartDate,
      requireComplete: stateful,
    });
  }
  if (file && !quiet) {
    printStep(message("loadedUsageFile"), file);
  }
  if (!quiet && !useColor) {
    printStep(message("buildPayload"));
  }
  const uploadReporter = createProgressReporter();
  if (!quiet) {
    uploadReporter.start(message("buildPayload"));
  }

  let payload;
  try {
    payload = buildUploadPayload(raw);
    if (stateful && retainedIncremental) {
      payload.entries = mergeHighWaterEntries(
        payload.entries,
        retainedIncremental.entries,
      );
    }
  } catch (error) {
    uploadReporter.clear();
    throw error;
  }
  if (
    !stateful &&
    (previousAggregateState?.deviceId !== payload.deviceId ||
      previousAggregateState.endpointId !== endpointId)
  ) {
    uploadReporter.clear();
    throw new Error(message("filteredUploadRequiresFullSync"));
  }
  let plan = stateful
    ? replayablePendingSnapshot
      ? {
          syncMode: "full",
          entries: replayablePendingSnapshot.entries,
          aggregates: aggregateStateFromEntries(replayablePendingSnapshot.entries),
          snapshotId: null,
          cutoverDate: replayablePendingSnapshot.cutoverDate,
          batchSize: replayablePendingSnapshot.batchSize,
        }
      : planStatefulSync(payload, previousAggregateState, accountId, endpointId)
    : {
        syncMode: "incremental",
        entries: payload.entries,
        snapshotId: null,
      };
  if (plan.syncMode === "full") {
    plan = await stabilizeFullSnapshotPlan(
      payload,
      plan,
      accountId,
      endpointId,
      replayablePendingSnapshot,
    );
  }
  if (stateful && plan.syncMode === "incremental" && plan.entries.length > 0) {
    const incrementalState = {
      accountingVersion,
      deviceId: payload.deviceId,
      accountId,
      endpointId,
      cutoverDate: plan.cutoverDate,
      entries: plan.entries,
      createdAt: currentTime().toISOString(),
    };
    await writePendingIncremental({
      ...incrementalState,
      digest: incrementalDigestFor(incrementalState),
    });
  }
  let batches = buildProtocolBatches(payload, plan);

  if (!quiet && !useColor) {
    printStep(
      message("uploading", {
        count: plan.entries.length,
        rows: rowLabel(plan.entries.length),
        batches: batches.length,
      }),
    );
  }

  let finalResponse = null;
  let cutoverRecoveryRevision = null;
  let cutoverRecoveryAttempted = false;
  let activeSnapshotRecoveryAttempted = false;
  let replayedActiveSnapshot = false;
  let deferredSnapshotId = null;
  while (true) {
    try {
      finalResponse = null;
      for (const [index, batch] of batches.entries()) {
        if (!quiet) {
          uploadReporter.update(
            message("uploadBatchProgress", {
              current: index + 1,
              total: batches.length,
              count: batch.entries.length,
              rows: rowLabel(batch.entries.length),
            }),
          );
        }
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
        finalResponse = await sendUploadBatch(webhookUrl, batch);
      }
      if (
        replayedActiveSnapshot &&
        finalResponse?.committed === true &&
        deferredSnapshotId
      ) {
        const completedSnapshotId = plan.snapshotId;
        await removePendingSnapshots(
          (snapshot) => snapshot.snapshotId === completedSnapshotId,
        );
        const deferredSnapshot = (await readPendingSnapshots()).find(
          (snapshot) =>
            snapshot.accountId === accountId &&
            snapshot.deviceId === payload.deviceId &&
            snapshot.endpointId === endpointId &&
            snapshot.snapshotId === deferredSnapshotId,
        );
        if (deferredSnapshot) {
          payload = buildUploadPayload({ entries: deferredSnapshot.entries });
          plan = {
            syncMode: "full",
            entries: deferredSnapshot.entries,
            aggregates: aggregateStateFromEntries(deferredSnapshot.entries),
            snapshotId: deferredSnapshot.snapshotId,
            cutoverDate: deferredSnapshot.cutoverDate,
            batchSize: deferredSnapshot.batchSize,
          };
          batches = buildProtocolBatches(payload, plan);
          replayedActiveSnapshot = false;
          deferredSnapshotId = null;
          continue;
        }
      }
      break;
    } catch (error) {
      const activePending =
        stateful &&
        plan.syncMode === "full" &&
        !activeSnapshotRecoveryAttempted &&
        error instanceof ActiveSnapshotConflictError
          ? (await readPendingSnapshots()).find(
              (snapshot) =>
                snapshot.accountId === accountId &&
                snapshot.deviceId === payload.deviceId &&
                snapshot.snapshotId === error.activeSnapshotId &&
                snapshot.cutoverDate === error.expectedCutoverDate,
            )
          : null;
      const revisionMatches =
        previousAggregateState?.revision === null ||
        previousAggregateState?.revision === undefined ||
        (error instanceof ActiveSnapshotConflictError &&
          error.revision >= previousAggregateState.revision);
      if (activePending && revisionMatches) {
        activeSnapshotRecoveryAttempted = true;
        deferredSnapshotId = plan.snapshotId;
        replayedActiveSnapshot = true;
        cutoverRecoveryRevision = error.revision;
        uploadReporter.clear();
        payload = buildUploadPayload({ entries: activePending.entries });
        plan = {
          syncMode: "full",
          entries: activePending.entries,
          aggregates: aggregateStateFromEntries(activePending.entries),
          snapshotId: activePending.snapshotId,
          cutoverDate: activePending.cutoverDate,
          batchSize: activePending.batchSize,
        };
        batches = buildProtocolBatches(payload, plan);
        if (!quiet) {
          uploadReporter.start(message("buildPayload"));
        }
        continue;
      }

      const canRecoverCutover =
        stateful &&
        plan.syncMode === "full" &&
        !cutoverRecoveryAttempted &&
        error instanceof CutoverDateConflictError &&
        error.expectedCutoverDate !== plan.cutoverDate;
      if (!canRecoverCutover) {
        uploadReporter.clear();
        throw error;
      }

      cutoverRecoveryAttempted = true;
      cutoverRecoveryRevision = error.revision;
      uploadReporter.clear();
      await removePendingSnapshots(
        (snapshot) =>
          snapshot.accountId === accountId &&
          snapshot.deviceId === payload.deviceId &&
          snapshot.snapshotId === plan.snapshotId,
      );
      raw = await scanUploadInput(args, {
        quiet,
        sinceOverride: error.expectedCutoverDate,
        requireComplete: true,
      });
      payload = buildUploadPayload(raw);
      if (retainedIncremental) {
        payload.entries = mergeHighWaterEntries(
          payload.entries,
          retainedIncremental.entries,
        );
      }
      plan = planStatefulSync(
        payload,
        previousAggregateState,
        accountId,
        endpointId,
        currentTime(),
        error.expectedCutoverDate,
      );
      plan = await stabilizeFullSnapshotPlan(
        payload,
        plan,
        accountId,
        endpointId,
        null,
      );
      batches = buildProtocolBatches(payload, plan);
      if (!quiet) {
        uploadReporter.start(message("buildPayload"));
      }
    }
  }

  if (plan.syncMode === "full" && finalResponse?.committed !== true) {
    uploadReporter.clear();
    throw new Error(message("snapshotNotCommitted"));
  }

  if (stateful && batches.length > 0) {
    await writeAggregateState({
      accountingVersion,
      deviceId: payload.deviceId,
      accountId,
      endpointId,
      lastFullSyncDate:
        plan.syncMode === "full"
          ? reconciliationDate(plan.cutoverDate)
          : previousAggregateState.lastFullSyncDate,
      aggregates: plan.aggregates,
      cutoverDate: plan.cutoverDate,
      revision:
        finalResponse?.revision ??
        cutoverRecoveryRevision ??
        previousAggregateState?.revision ??
        null,
      updatedAt: currentTime().toISOString(),
    });
    if (plan.syncMode === "full") {
      await removePendingSnapshots(
        (snapshot) =>
          snapshot.accountId === accountId &&
          snapshot.deviceId === payload.deviceId &&
          (snapshot.snapshotId === plan.snapshotId ||
            (!replayedActiveSnapshot && snapshot.endpointId === endpointId)),
      );
      if (!replayedActiveSnapshot) {
        await clearPendingIncremental();
      }
    } else {
      await clearPendingIncremental();
    }
  }

  if (!quiet) {
    uploadReporter.finish(
      message("uploadProgressSummary", {
        count: plan.entries.length,
        rows: rowLabel(plan.entries.length),
        batches: batches.length,
      }),
    );
    if (useColor || terminalIsTty) {
      printSuccess(message("uploadComplete"), `${plan.entries.length} ${rowLabel(plan.entries.length)}`);
    } else {
      printSuccess(
        message("uploadSuccess", {
          count: plan.entries.length,
          rows: rowLabel(plan.entries.length),
        }),
      );
    }
  }

  if (stateful && options.trackState !== false) {
    await recordSuccessfulLocalUpload(accountId, endpointId);
  }

  return {
    uploaded: plan.entries.length,
    syncMode: plan.syncMode,
    accountId,
    endpointId,
  };
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
  const minute = collectorScheduleMinute();

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
  <dict>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
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
  const minute = String(collectorScheduleMinute()).padStart(2, "0");
  return `[Unit]
Description=Run TokenRank collector hourly at a stable device-specific minute

[Timer]
OnCalendar=*-*-* *:${minute}:00
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
  const minute = String(collectorScheduleMinute()).padStart(2, "0");

  return `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>TokenRank collector hourly at a stable device-specific minute and after missed runs.</Description></RegistrationInfo>
  <Triggers>
    <CalendarTrigger><StartBoundary>2020-01-01T00:${minute}:00</StartBoundary><Enabled>true</Enabled><Repetition><Interval>PT1H</Interval><Duration>P1D</Duration><StopAtDurationEnd>false</StopAtDurationEnd></Repetition><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger>
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
  const reporter = createProgressReporter();
  reporter.start(message("installingBackgroundSync"));

  try {
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
  } catch (error) {
    reporter.clear();
    throw error;
  }
  reporter.clear();

  if (hasLegacyIntervalArg) {
    console.log(message("ignoredInterval", { schedule: message("dailySchedule", { minute: collectorScheduleMinute() }) }));
  }
  printSuccess(message("installedBackgroundService", { file }));
  printMuted(message("collectionSchedule", { schedule: message("dailySchedule", { minute: collectorScheduleMinute() }) }));
}

async function serviceStatus() {
  const { file } = servicePaths();
  const reporter = createProgressReporter();
  reporter.start(message("checkingBackgroundSync"));
  let installed;
  try {
    installed = await serviceInstalled();
  } finally {
    reporter.clear();
  }
  if (useColor) {
    printPanel(
      [
        {
          left: file,
          right: `● ${installed ? message("serviceInstalled") : message("serviceNotInstalled")}`,
          leftColor: cliPalette.muted,
          rightColor: installed ? cliPalette.lime : cliPalette.orange,
        },
      ],
      { title: cliLocale === "zh" ? "后台同步" : "BACKGROUND SYNC" },
    );
  } else {
    console.log(installed ? message("installed", { file }) : message("notInstalled"));
  }
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
  const reporter = createProgressReporter();
  reporter.start(message("removingBackgroundSync"));

  try {
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
  } catch (error) {
    reporter.clear();
    throw error;
  }
  reporter.clear();
  printSuccess(message("uninstallService", { file }));
}

function nextScheduleBoundary(now = currentTime()) {
  const next = latestScheduleBoundary(now);
  next.setHours(next.getHours() + 1);
  return next;
}

async function statusCommand(args = []) {
  const json = args.includes("--json");
  const reporter = createProgressReporter();
  if (!json) {
    reporter.start(message("checkingCollectorStatus"));
  }
  let connected = false;
  let configuredEndpointId = null;
  let state;
  let aggregateState;
  let installed;

  try {
    try {
      const config = await readConfig();
      const webhookUrl = requireWebhookUrl(config.webhookUrl);
      configuredEndpointId = createHash("sha256").update(webhookUrl).digest("hex");
      connected = true;
    } catch {
      connected = false;
    }

    state = await readServiceState();
    aggregateState = await readAggregateState();
    installed = await serviceInstalled();
  } finally {
    reporter.clear();
  }

  const lastSuccessfulAt = isIsoTimestamp(state.lastSuccessfulAt)
    ? state.lastSuccessfulAt
    : null;
  const lastErrorCode =
    typeof state.lastErrorCode === "string" && state.lastErrorCode
      ? state.lastErrorCode
      : null;
  const verified =
    connected &&
    Boolean(lastSuccessfulAt) &&
    isSha256(state.lastSuccessfulAccountId) &&
    state.lastSuccessfulEndpointId === configuredEndpointId &&
    aggregateState?.accountId === state.lastSuccessfulAccountId &&
    aggregateState.endpointId === configuredEndpointId;
  const healthy = verified && lastErrorCode === null;
  const status = !connected
    ? "UNCONFIGURED"
    : healthy
      ? "HEALTHY"
      : verified
        ? "VERIFIED"
        : "CONFIGURED";
  const result = {
    status,
    configured: connected,
    verified,
    healthy,
    serviceInstalled: installed,
    lastAttemptAt: isIsoTimestamp(state.lastAttemptAt) ? state.lastAttemptAt : null,
    lastSuccessfulAt,
    lastErrorCode,
    nextScheduledAt: nextScheduleBoundary().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(result, null, 2));
    if (!healthy) {
      process.exitCode = 1;
    }
    return;
  }

  if (useColor) {
    printPanel(
      [
        {
          left: "STATUS",
          right: status,
          leftColor: cliPalette.muted,
          rightColor: healthy ? cliPalette.lime : cliPalette.orange,
        },
        {
          left: message("uploadEndpoint"),
          right: `● ${connected ? message("connected") : message("notConnected")}`,
          leftColor: cliPalette.muted,
          rightColor: connected ? cliPalette.lime : cliPalette.orange,
        },
        {
          left: cliLocale === "zh" ? "后台同步" : "BACKGROUND SYNC",
          right: `● ${installed ? message("serviceInstalled") : message("serviceNotInstalled")}`,
          leftColor: cliPalette.muted,
          rightColor: installed ? cliPalette.lime : cliPalette.orange,
        },
        { divider: true },
        {
          left: message("lastSuccess"),
          right: lastSuccessfulAt ?? message("never"),
          leftColor: cliPalette.muted,
          rightColor: cliPalette.ivory,
        },
        {
          left: message("lastError"),
          right: lastErrorCode ?? message("none"),
          leftColor: cliPalette.muted,
          rightColor: lastErrorCode ? cliPalette.orange : cliPalette.ivory,
        },
        {
          left: message("nextBoundary"),
          right: result.nextScheduledAt,
          leftColor: cliPalette.muted,
          rightColor: cliPalette.ivory,
        },
      ],
      { title: message("gridStatus") },
    );
  } else {
    console.log(`STATUS\t${status}`);
    console.log(connected ? message("connected") : message("notConnected"));
    console.log(installed ? message("serviceInstalled") : message("serviceNotInstalled"));
    console.log(`${message("lastSuccess")}\t${lastSuccessfulAt ?? message("never")}`);
    console.log(`${message("lastError")}\t${lastErrorCode ?? message("none")}`);
    console.log(`${message("nextBoundary")}\t${result.nextScheduledAt}`);
  }

  if (!healthy) {
    process.exitCode = 1;
  }
}

async function doctorCommand() {
  const sources = sourceDefinitions();
  const results = [];
  const discoveredSources = [];
  const reporter = createProgressReporter();
  let totalFiles = 0;
  let scannedFiles = 0;
  let totalRows = 0;

  try {
    if (sources.length > 0) {
      reporter.start(
        message("discoveringSourceProgress", {
          source: sources[0].label,
          current: 1,
          total: sources.length,
          files: 0,
        }),
      );
    }

    for (const [sourceIndex, source] of sources.entries()) {
      const files = await collectSourceFiles(source);
      totalFiles += files.length;
      discoveredSources.push({ source, files });
      reporter.update(
        message("discoveringSourceProgress", {
          source: source.label,
          current: sourceIndex + 1,
          total: sources.length,
          files: totalFiles,
        }),
      );
    }

    for (const [sourceIndex, { source, files }] of discoveredSources.entries()) {
      let rows = 0;
      let failed = false;

      reporter.update(
        message("scanningSourceProgress", {
          source: source.label,
          current: sourceIndex + 1,
          total: sources.length,
          fileCurrent: scannedFiles,
          fileTotal: totalFiles,
          rows: totalRows,
        }),
      );

      for (const file of files) {
        try {
          for await (const _entry of readUsageFile(file, source.tool, {
            id: source.id ?? `${source.tool}-local`,
            priority: source.priority ?? 100,
          })) {
            void _entry;
            rows += 1;
            totalRows += 1;
            if (totalRows % 100 === 0) {
              reporter.update(
                message("scanningSourceProgress", {
                  source: source.label,
                  current: sourceIndex + 1,
                  total: sources.length,
                  fileCurrent: scannedFiles,
                  fileTotal: totalFiles,
                  rows: totalRows,
                }),
              );
            }
          }
        } catch {
          failed = true;
        }

        scannedFiles += 1;
        reporter.update(
          message("scanningSourceProgress", {
            source: source.label,
            current: sourceIndex + 1,
            total: sources.length,
            fileCurrent: scannedFiles,
            fileTotal: totalFiles,
            rows: totalRows,
          }),
        );
      }

      const status = failed
        ? message("error")
        : rows > 0
          ? message("ready")
          : source.tool === "cursor"
            ? message("exactSourceRequired")
            : files.length > 0
              ? message("detectedNoRows")
              : message("unavailable");
      results.push({ source, status, files: files.length, rows, failed });
    }

    reporter.finish(
      message("doctorProgressSummary", {
        sources: sources.length,
        files: totalFiles,
        rows: totalRows,
        ready: results.filter((result) => result.rows > 0 && !result.failed).length,
      }),
    );
  } catch (error) {
    reporter.clear();
    throw error;
  }

  if (useColor) {
    const rows = [
      {
        left: cliLocale === "zh" ? "工具 / 状态" : "TOOL / STATUS",
        right: cliLocale === "zh" ? "文件 · 记录" : "FILES · ROWS",
        leftColor: cliPalette.muted,
        rightColor: cliPalette.muted,
      },
      { divider: true },
      ...results.map((result) => {
        const ready = result.rows > 0 && !result.failed;
        const statusColor = result.failed
          ? cliPalette.orange
          : ready
            ? cliPalette.lime
            : cliPalette.muted;
        return {
          left: `${padCell(result.source.tool, uiWidth() >= 64 ? 22 : 14)} ${result.status}`,
          leftSegments: [
            {
              value: padCell(result.source.tool, uiWidth() >= 64 ? 22 : 14),
              color: cliPalette.ivory,
            },
            { value: ` ${result.status}`, color: statusColor },
          ],
          right: `${result.files} · ${result.rows}`,
          rightColor: cliPalette.muted,
        };
      }),
    ];
    printPanel(rows, { title: message("sourceDiagnostics") });
    return;
  }

  for (const result of results) {
    console.log(
      `${result.source.tool}\t${result.status}\t${result.files} ${message("files")}\t${result.rows} ${rowLabel(result.rows)}`,
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
    const config = await readConfig();
    const webhookUrl = requireWebhookUrl(config.webhookUrl);
    const attemptEndpointId = createHash("sha256").update(webhookUrl).digest("hex");

    if (
      state.lastScheduledBoundary &&
      new Date(state.lastScheduledBoundary).getTime() >= boundary.getTime()
    ) {
      return { skipped: true, reason: "already-synced" };
    }

    await writeServiceState({
      ...state,
      lastAttemptAt: now.toISOString(),
      lastAttemptEndpointId: attemptEndpointId,
      lastErrorCode: "UPLOAD_IN_PROGRESS",
    });

    try {
      const result = await upload(
        args.filter((arg) => arg !== "--scheduled"),
        { quiet: true, trackState: false, collectorLock: false },
      );
      await writeServiceState({
        ...state,
        lastAttemptAt: now.toISOString(),
        lastAttemptAccountId: result.accountId,
        lastAttemptEndpointId: result.endpointId,
        lastSuccessfulAt: now.toISOString(),
        lastSuccessfulAccountId: result.accountId,
        lastSuccessfulEndpointId: result.endpointId,
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

const previewWordmark = {
  token: [
    "█████  ███  █  ██ █████ █   █",
    "  █   █   █ █ █   █     ██  █",
    "  █   █   █ ██    ████  █ █ █",
    "  █   █   █ █ █   █     █  ██",
    "  █    ███  █  ██ █████ █   █",
  ],
  rank: [
    "████   ███  █   █ █  ██",
    "█   █ █   █ ██  █ █ █  ",
    "████  █████ █ █ █ ██   ",
    "█ █   █   █ █  ██ █ █  ",
    "█  ██ █   █ █   █ █  ██",
  ],
};

function centerDisplayLine(value, width = uiWidth()) {
  return `${" ".repeat(Math.max(0, Math.floor((width - displayWidth(value)) / 2)))}${value}`;
}

async function renderPreviewLogoLine(line, color) {
  const centered = centerDisplayLine(line);
  if (process.env.TOKENRANK_NO_ANIMATION === "1") {
    console.log(trueColor(centered, color));
    return;
  }

  const leadingSpace = centered.slice(0, centered.length - line.length);
  process.stdout.write(leadingSpace);
  if (useColor) {
    process.stdout.write(`\x1b[38;2;${color.join(";")}m`);
  }

  const characters = [...line];
  for (let index = 0; index < characters.length; index += 3) {
    process.stdout.write(characters.slice(index, index + 3).join(""));
    await sleep(4);
  }

  process.stdout.write(`${useColor ? "\x1b[0m" : ""}\n`);
}

async function renderPreviewHero() {
  if (!terminalIsTty || process.env.TOKENRANK_NO_LOGO === "1") {
    return;
  }

  console.log("");
  for (const line of previewWordmark.token) {
    await renderPreviewLogoLine(line, cliPalette.ivory);
  }
  for (const line of previewWordmark.rank) {
    await renderPreviewLogoLine(line, cliPalette.lime);
  }
  console.log("");
  console.log(trueColor(centerDisplayLine(message("previewHeroTagline")), cliPalette.ivory));
  console.log(trueColor(centerDisplayLine(message("previewHeroPrivacy")), cliPalette.muted));
  console.log("");
}

function addPreviewBreakdownValue(target, key, value) {
  target.set(key, safeTokenSum(target.get(key) ?? 0, value));
}

function summarizePreview(entries) {
  const byTool = new Map();
  const byModel = new Map();
  const byDate = new Map();
  let totalTokens = 0;

  for (const entry of entries) {
    totalTokens = safeTokenSum(totalTokens, entry.total);
    addPreviewBreakdownValue(byTool, entry.tool, entry.total);
    addPreviewBreakdownValue(byModel, entry.model || message("unattributedEmpty"), entry.total);
    addPreviewBreakdownValue(byDate, entry.date, entry.total);
  }

  const descendingTotals = ([leftLabel, leftTotal], [rightLabel, rightTotal]) =>
    rightTotal - leftTotal || leftLabel.localeCompare(rightLabel);
  const tools = [...byTool.entries()].sort(descendingTotals).map(([label, total]) => ({
    label,
    total,
  }));
  const models = [...byModel.entries()].sort(descendingTotals).map(([label, total]) => ({
    label,
    total,
  }));
  const dates = [...byDate.keys()].sort();
  const days = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right));
  const peakDay = [...days].sort(descendingTotals)[0] ?? ["-", 0];

  return {
    totalTokens,
    tools,
    models,
    dates,
    days,
    activeDays: dates.length,
    firstDate: dates[0] ?? "-",
    lastDate: dates.at(-1) ?? "-",
    peakDay: { date: peakDay[0], total: peakDay[1] },
    dailyAverage: dates.length ? Math.round(totalTokens / dates.length) : 0,
  };
}

function previewActivityRows(summary, compactFormatter) {
  const limit = uiWidth() >= 64 ? 7 : 5;
  const days = [...summary.days].reverse().slice(0, limit);
  const maximum = Math.max(...days.map(([, total]) => total), 0);
  const barWidth = uiWidth() >= 64 ? 18 : 8;
  const formattedValues = days.map(([, total]) => compactFormatter.format(total));
  const valueWidth = Math.max(...formattedValues.map(displayWidth), 1);
  const rows = days.map(([date, total], index) => {
    const filled = maximum
      ? Math.max(1, Math.min(barWidth, Math.round((total / maximum) * barWidth)))
      : 0;
    return {
      left: date,
      right: `${"█".repeat(filled).padEnd(barWidth, " ")} ${padCell(formattedValues[index], valueWidth, "right")}`,
      leftColor: cliPalette.muted,
      rightColor: cliPalette.lime,
    };
  });

  rows.push(
    { divider: true },
    {
      left: message("previewDailyAverage"),
      right: compactFormatter.format(summary.dailyAverage),
      leftColor: cliPalette.muted,
      rightColor: cliPalette.ivory,
    },
  );

  return { days, rows };
}

function previewBreakdownRows(items, totalTokens, compactFormatter) {
  const limit = uiWidth() >= 64 ? 5 : 4;
  const visible = items.slice(0, items.length > limit ? limit - 1 : limit);
  if (items.length > limit) {
    visible.push({
      label: cliLocale === "zh" ? "其他" : "Other",
      total: items.slice(limit - 1).reduce((total, item) => safeTokenSum(total, item.total), 0),
    });
  }

  const barWidth = uiWidth() >= 64 ? 12 : 5;
  const formattedValues = visible.map((item) => compactFormatter.format(item.total));
  const valueWidth = Math.max(...formattedValues.map(displayWidth), 1);
  return visible.map((item, index) => {
    const rawPercentage = totalTokens ? (item.total / totalTokens) * 100 : 0;
    const percentage = rawPercentage > 0 && rawPercentage < 1
      ? "<1%"
      : `${Math.round(rawPercentage)}%`;
    const filled = item.total
      ? Math.max(1, Math.min(barWidth, Math.round((item.total / totalTokens) * barWidth)))
      : 0;
    const bar = "█".repeat(filled).padEnd(barWidth, " ");
    return {
      left: "",
      leftSegments: [
        { value: `${String(index + 1).padStart(2, "0")} `, color: cliPalette.orange },
        { value: item.label, color: cliPalette.ivory },
      ],
      right: `${bar} ${percentage.padStart(4, " ")} · ${padCell(formattedValues[index], valueWidth, "right")}`,
      rightColor: cliPalette.lime,
    };
  });
}

function printWrappedPreviewText(value, options = {}) {
  const prefix = options.prefix ?? "  ";
  const width = Math.max(1, uiWidth() - displayWidth(prefix));
  for (const [index, line] of wrapDisplayLine(value, width).entries()) {
    const renderedPrefix = index === 0 ? prefix : " ".repeat(displayWidth(prefix));
    console.log(`${trueColor(renderedPrefix, options.prefixColor ?? cliPalette.lime)}${trueColor(line, options.color ?? cliPalette.muted)}`);
  }
}

function renderPreviewRecent(entries, formatter) {
  const limit = uiWidth() >= 64 ? 8 : 4;
  const recent = [...entries]
    .sort((left, right) => right.date.localeCompare(left.date) || right.total - left.total)
    .slice(0, limit);
  const rows = [];

  for (const entry of recent) {
    if (uiWidth() < 56) {
      rows.push(
        {
          left: "",
          leftSegments: [
            { value: `${entry.date} `, color: cliPalette.muted },
            { value: entry.tool, color: cliPalette.lime },
          ],
          right: formatter.format(entry.total),
          rightColor: cliPalette.orange,
        },
        { left: `  ${entry.model}`, leftColor: cliPalette.ivory },
      );
    } else {
      rows.push({
        left: "",
        leftSegments: [
          { value: `${entry.date} `, color: cliPalette.muted },
          { value: `${padCell(entry.tool, 16)} `, color: cliPalette.lime },
          { value: entry.model, color: cliPalette.ivory },
        ],
        right: formatter.format(entry.total),
        rightColor: cliPalette.orange,
      });
    }
  }

  if (entries.length > recent.length) {
    rows.push(
      { divider: true },
      {
        left: message("previewMoreRows", { count: entries.length - recent.length }),
        right: uiWidth() >= 64 ? message("previewViewJson") : "--json",
        leftColor: cliPalette.muted,
        rightColor: cliPalette.muted,
      },
    );
  }

  printPanel(rows, {
    title: message("previewRecent", { shown: recent.length, total: entries.length }),
  });
}

async function previewIsConnected() {
  try {
    const config = await readConfig();
    requireWebhookUrl(config.webhookUrl);
    return true;
  } catch {
    return false;
  }
}

function previewNextStepRows(steps) {
  const rows = [];
  for (const [index, step] of steps.entries()) {
    const leftSegments = [
      { value: `${String(index + 1).padStart(2, "0")}  `, color: cliPalette.orange },
      { value: step.label, color: cliPalette.ivory },
    ];
    if (uiWidth() >= 64) {
      rows.push({ left: "", leftSegments, right: step.action, rightColor: cliPalette.orange });
    } else {
      rows.push(
        { left: "", leftSegments },
        { left: `    ${step.action}`, leftColor: cliPalette.orange },
      );
    }
  }
  return rows;
}

function renderPreviewNextSteps(connected) {
  const steps = connected
    ? [
      { label: message("previewUploadAggregates"), action: "tokenrank upload" },
      { label: message("previewOpenRanking"), action: "tokenrank.org" },
    ]
    : [
      { label: message("previewSignInWithX"), action: "tokenrank.org/onboard" },
      { label: message("previewCopyConnectCommand"), action: message("previewCopyConnectHint") },
      { label: message("previewUploadAggregates"), action: "tokenrank upload" },
    ];
  const rows = [];

  if (connected) {
    rows.push({
      left: "",
      leftSegments: [
        { value: "✓  ", color: cliPalette.lime },
        { value: message("previewConnectReady"), color: cliPalette.ivory },
      ],
    });
    rows.push({ divider: true });
  }

  rows.push(
    ...previewNextStepRows(steps),
    { divider: true },
    { left: message("previewNothingUploaded"), leftColor: cliPalette.lime },
    { left: message("previewUploadPrivacy"), leftColor: cliPalette.muted },
  );

  printPanel(rows, {
    title: connected ? message("previewNextConnectedTitle") : message("previewNextClaimTitle"),
  });
}

async function renderPreviewDashboard(entries) {
  const locale = cliLocale === "zh" ? "zh-CN" : "en-US";
  const formatter = new Intl.NumberFormat(locale);
  const compactFormatter = new Intl.NumberFormat(locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const summary = summarizePreview(entries);
  const activity = previewActivityRows(summary, compactFormatter);

  printWrappedPreviewText(
    message("previewTokensFound", { total: formatter.format(summary.totalTokens) }),
    { prefix: "◆ ", prefixColor: cliPalette.orange, color: cliPalette.ivory },
  );

  printPanel(
    [
      {
        left: message("previewTotalTokens"),
        right: formatter.format(summary.totalTokens),
        leftColor: cliPalette.muted,
        rightColor: cliPalette.lime,
      },
      {
        left: message("previewActiveDays"),
        right: formatter.format(summary.activeDays),
        leftColor: cliPalette.muted,
        rightColor: cliPalette.ivory,
      },
      {
        left: message("previewAiTools"),
        right: formatter.format(summary.tools.length),
        leftColor: cliPalette.muted,
        rightColor: cliPalette.ivory,
      },
      {
        left: message("previewModels"),
        right: formatter.format(summary.models.length),
        leftColor: cliPalette.muted,
        rightColor: cliPalette.ivory,
      },
      { divider: true },
      {
        left: message("previewDateRange"),
        right: `${summary.firstDate} → ${summary.lastDate}`,
        leftColor: cliPalette.muted,
        rightColor: cliPalette.ivory,
      },
      {
        left: message("previewPeakDay"),
        right: `${summary.peakDay.date} · ${formatter.format(summary.peakDay.total)}`,
        leftColor: cliPalette.muted,
        rightColor: cliPalette.orange,
      },
    ],
    { title: message("previewFootprint") },
  );

  printPanel(activity.rows, {
    title: activity.days.length === 1
      ? message("previewActivitySingle")
      : message("previewActivity", { days: activity.days.length }),
  });

  printPanel(previewBreakdownRows(summary.tools, summary.totalTokens, compactFormatter), {
    title: message("previewToolBreakdown"),
  });
  printPanel(previewBreakdownRows(summary.models, summary.totalTokens, compactFormatter), {
    title: message("previewModelBreakdown"),
  });
  renderPreviewRecent(entries, formatter);

  const connected = await previewIsConnected();
  renderPreviewNextSteps(connected);
}

async function preview(args) {
  const json = args.includes("--json");
  if (!json) {
    await renderPreviewHero();
  }
  const entries = await scanLocalUsage(args, { progress: true, panels: false });
  const payload = buildUploadPayload({ entries });

  if (json) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  if (!entries.length) {
    if (terminalIsTty) {
      printPanel(
        [{ left: message("noLocalUsage"), leftColor: cliPalette.muted }],
        { title: message("scanLocalUsage") },
      );
    } else {
      console.log(message("noLocalUsage"));
    }
    return;
  }

  if (terminalIsTty) {
    await renderPreviewDashboard(entries);
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
      if (useColor) {
        renderToolsPanel();
      } else {
        printSection(message("supportedTools"));
        for (const tool of TOOL_KEYS) {
          console.log(`• ${tool}`);
        }
      }
      return;
    case "sources":
      await printLogo();
      if (!useColor) {
        printSection(message("localSourceAdapters"));
      }
      printSources();
      return;
    case "status":
      if (!args.includes("--json")) {
        await printLogo();
      }
      if (!useColor && !args.includes("--json")) {
        printSection(message("gridStatus"));
      }
      await statusCommand(args);
      return;
    case "doctor":
      await printLogo();
      if (!useColor) {
        printSection(message("sourceDiagnostics"));
      }
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
      await printLogo();
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
