#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { chmod, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { homedir, hostname } from "node:os";
import path from "node:path";
import { connect as tlsConnect } from "node:tls";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

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
];
const CACHE_INCLUDED_INPUT_TOOLS = new Set(["codex"]);

const cliDir = path.dirname(fileURLToPath(import.meta.url));
const packageJson = await readCliPackageJson([
  path.join(cliDir, "package.json"),
  path.resolve(cliDir, "..", "package.json"),
  path.join(process.env.TOKENRANK_HOME ?? path.join(homedir(), ".tokenrank"), "package.json"),
]);
const clientVersion = String(packageJson.version ?? "0.0.0");
const defaultCollectorIntervalSeconds = 12 * 60 * 60;
const collectorScheduleHours = [0, 12];

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
    "TokenRank collector",
    "",
    "Commands:",
    "  tokenrank tools",
    "  tokenrank sources",
    "  tokenrank preview [--json] [--tool tool-id] [--since YYYY-MM-DD]",
    "  tokenrank connect <webhook-url>",
    "  tokenrank logout",
    "  tokenrank upload [--file usage.json] [--tool tool-id] [--since YYYY-MM-DD]",
    "  tokenrank daemon [--interval seconds] [--once]",
    "  tokenrank service install",
    "  tokenrank service status",
    "  tokenrank service uninstall",
    "",
    "usage.json can be either { entries: [...] } or an array of aggregate entries.",
  ].join("\n");
}

function sourceDefinitions() {
  const home = homedir();
  const appSupport = path.join(home, "Library", "Application Support");
  const codeStorage = path.join(appSupport, "Code", "User", "globalStorage");
  const cursorStorage = path.join(appSupport, "Cursor", "User", "globalStorage");
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
  ];
}

function configPath() {
  return process.env.TOKENRANK_CONFIG ?? path.join(homedir(), ".tokenrank", "config.json");
}

async function readConfig() {
  const file = configPath();

  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    throw new Error("请先运行 tokenrank connect <webhook-url>");
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
  console.log("已移除本机 webhook 配置。");
}

function requireWebhookUrl(value) {
  if (!value) {
    throw new Error("缺少 webhook URL。请先在 TokenRank 仪表盘生成 webhook。");
  }

  let url;

  try {
    url = new URL(value);
  } catch {
    throw new Error("webhook URL 格式不正确。");
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("webhook URL 必须是 http 或 https。");
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
        throw new Error(`${key} 必须是非负整数。`);
      }

      return value;
    }
  }

  return null;
}

function sumNumbers(record, keys) {
  let total = 0;

  for (const key of keys) {
    const value = record[key];

    if (value === undefined) {
      continue;
    }

    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${key} 必须是非负整数。`);
    }

    total += value;
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
    return input + output;
  }

  return input + output + cacheRead + cacheWrite;
}

function legacySummedTotal(input, output, cacheRead, cacheWrite) {
  return input + output + cacheRead + cacheWrite;
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
    throw new Error("每条 usage entry 必须是对象。");
  }

  const entry = rawEntry;
  const date = typeof entry.date === "string" ? entry.date : "";

  if (!isIsoCalendarDate(date)) {
    throw new Error("entry.date 必须是 YYYY-MM-DD 格式的真实日期。");
  }

  const tool = typeof entry.tool === "string" ? entry.tool : "";

  if (!TOOL_KEYS.includes(tool)) {
    throw new Error(`不支持的工具: ${tool || "(empty)"}`);
  }

  const model = typeof entry.model === "string" && entry.model.trim() ? entry.model.trim() : "unknown";
  const input = readNumber(entry, ["input", "inputTokens"]);
  const output = readNumber(entry, ["output", "outputTokens"]);
  const cacheRead = readNumber(entry, ["cacheRead", "cacheReadTokens"]);
  const cacheWrite = readNumber(entry, ["cacheWrite", "cacheWriteTokens"]);
  const inferredTotal = canonicalTotalFor(tool, input, output, cacheRead, cacheWrite);
  const legacyTotal = legacySummedTotal(input, output, cacheRead, cacheWrite);
  const providedTotal = readOptionalNumber(entry, ["total", "totalTokens"]);
  const total = providedTotal ?? inferredTotal;

  if (total !== inferredTotal && total !== legacyTotal) {
    throw new Error("total 必须匹配该工具的 Token 统计口径。");
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
      return parsed.toISOString().slice(0, 10);
    }
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const millis = value > 10_000_000_000 ? value : value * 1000;
    const parsed = new Date(millis);

    if (Number.isFinite(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
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
  const total =
    readOptionalNumber(record, ["total", "totalTokens", "total_tokens"]) ??
    canonicalTotalFor(tool, input, output, cacheRead, cacheWrite);

  const observedTokens = input + output + cacheRead + cacheWrite;

  return total > 0 && observedTokens > 0 ? { input, output, cacheRead, cacheWrite, total } : null;
}

function extractEntriesFromValue(value, tool, fallbackDate) {
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
          model: nextContext.model || "unknown",
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

  walk(value, { date: fallbackDate, model: null }, []);

  return entries;
}

async function pathExists(file) {
  try {
    return await stat(file);
  } catch {
    return null;
  }
}

function isScannableFile(file) {
  return (
    file.endsWith(".json") ||
    file.endsWith(".jsonl") ||
    file.endsWith(".db") ||
    file.endsWith(".sqlite")
  );
}

async function collectFiles(root, maxFiles = 1000) {
  const rootStat = await pathExists(root);

  if (!rootStat) {
    return [];
  }

  if (rootStat.isFile()) {
    return isScannableFile(root) ? [root] : [];
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
      } else if (entry.isFile() && isScannableFile(fullPath)) {
        files.push(fullPath);

        if (files.length >= maxFiles) {
          break;
        }
      }
    }
  }

  return files;
}

async function readUsageFile(file, tool) {
  const fileStat = await stat(file);
  const fallbackDate = fileStat.mtime.toISOString().slice(0, 10);

  if (file.endsWith(".db") || file.endsWith(".sqlite")) {
    return readSqliteUsage(file, tool, fallbackDate);
  }

  const text = await readFile(file, "utf8");

  if (file.endsWith(".jsonl")) {
    const entries = [];

    for (const line of text.split("\n")) {
      const trimmed = line.trim();

      if (!trimmed) {
        continue;
      }

      try {
        entries.push(...extractEntriesFromValue(JSON.parse(trimmed), tool, fallbackDate));
      } catch {
        continue;
      }
    }

    return entries;
  }

  try {
    return extractEntriesFromValue(JSON.parse(text), tool, fallbackDate);
  } catch {
    return [];
  }
}

function quoteSqlIdent(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

async function sqliteJson(file, sql) {
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
    const modelSelect = modelColumn ? quoteSqlIdent(modelColumn) : "'unknown'";
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
      const model = pickModel(row, "unknown") || "unknown";
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

function aggregateEntries(entries) {
  const rows = new Map();

  for (const entry of entries.map(normalizeEntry)) {
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

    current.input += entry.input;
    current.output += entry.output;
    current.cacheRead += entry.cacheRead;
    current.cacheWrite += entry.cacheWrite;
    current.total += entry.total;
    rows.set(key, current);
  }

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

function getOption(args, name, shortName = null) {
  const index = args.findIndex((arg) => arg === name || (shortName && arg === shortName));

  if (index === -1) {
    return null;
  }

  const value = args[index + 1];

  if (!value || value.startsWith("-")) {
    throw new Error(`缺少 ${name} 参数值。`);
  }

  return value;
}

function getScanOptions(args) {
  const tool = getOption(args, "--tool");
  const since = getOption(args, "--since");

  if (tool && !TOOL_KEYS.includes(tool)) {
    throw new Error(`不支持的工具: ${tool}`);
  }

  if (since && !isIsoCalendarDate(since)) {
    throw new Error("--since 必须是 YYYY-MM-DD。");
  }

  return { tool, since };
}

async function scanLocalUsage(args) {
  const { tool, since } = getScanOptions(args);
  const entries = [];

  for (const source of sourceDefinitions()) {
    if (tool && source.tool !== tool) {
      continue;
    }

    for (const root of source.roots) {
      const files = await collectFiles(root);

      for (const file of files) {
        entries.push(...(await readUsageFile(file, source.tool)));
      }
    }
  }

  return aggregateEntries(since ? entries.filter((entry) => entry.date >= since) : entries);
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

  throw new Error("usage JSON 必须是数组，或包含 entries 数组。");
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
    throw new Error("代理响应格式不正确。");
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
        reject(new Error(`代理连接失败: HTTP ${res.statusCode ?? 0}`));
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

  throw new Error(`不支持的 webhook 协议: ${targetUrl.protocol}`);
}

function getFileArg(args) {
  const index = args.findIndex((arg) => arg === "--file" || arg === "-f");

  if (index === -1) {
    return null;
  }

  const file = args[index + 1];

  if (!file || file.startsWith("-")) {
    throw new Error("缺少 --file 后面的 usage.json 路径。");
  }

  return file;
}

async function upload(args) {
  const config = await readConfig();
  const webhookUrl = requireWebhookUrl(config.webhookUrl);
  const file = getFileArg(args);
  const raw = file
    ? JSON.parse(await readFile(file, "utf8"))
    : { entries: await scanLocalUsage(args) };
  const payload = buildUploadPayload(raw);
  const batches = payload.entries.length
    ? Array.from({ length: Math.ceil(payload.entries.length / 500) }, (_, index) => ({
        ...payload,
        entries: payload.entries.slice(index * 500, index * 500 + 500),
      }))
    : [payload];

  for (const batch of batches) {
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
      throw new Error(`上传失败: ${error}`);
    }
  }

  console.log(`上传成功: ${payload.entries.length} 条`);
}

function parseInterval(args) {
  const raw = getOption(args, "--interval");

  if (!raw) {
    return defaultCollectorIntervalSeconds;
  }

  const interval = Number(raw);

  if (!Number.isSafeInteger(interval) || interval < 60) {
    throw new Error("--interval 必须是不小于 60 的整数秒。");
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
      file: path.join(homedir(), ".tokenrank", "tokenrank-collector.cmd"),
      taskNames: ["TokenRankCollectorMidnight", "TokenRankCollectorNoon"],
      legacyTaskName: "TokenRankCollector",
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
  const args = [process.execPath, binPath, "daemon", "--once"];
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
ExecStart=${process.execPath} ${binPath} daemon --once
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

function cmdQuote(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function windowsTaskRunner() {
  const binPath = fileURLToPath(import.meta.url);

  return `@echo off\r\n${cmdQuote(process.execPath)} ${cmdQuote(binPath)} daemon --once\r\n`;
}

async function runOptional(command, args) {
  try {
    await execFileAsync(command, args);
  } catch {
    // The service file is still useful even when launchd/systemd registration
    // is unavailable, for example inside CI or restricted shells.
  }
}

async function installService() {
  await readConfig();
  const { kind, file, timerFile, taskNames = [], legacyTaskName } = servicePaths();
  await mkdir(path.dirname(file), { recursive: true });
  await mkdir(path.join(homedir(), ".tokenrank"), { recursive: true, mode: 0o700 });
  await writeFile(
    file,
    kind === "launchd" ? launchdPlist() : kind === "schtasks" ? windowsTaskRunner() : systemdUnit(),
  );
  if (timerFile) {
    await writeFile(timerFile, systemdTimer());
  }

  if (!process.env.TOKENRANK_SERVICE_NO_REGISTER) {
    if (kind === "launchd") {
      await runOptional("launchctl", ["unload", file]);
      await runOptional("launchctl", ["load", file]);
    } else if (kind === "schtasks") {
      if (legacyTaskName) {
        await runOptional("schtasks.exe", ["/Delete", "/TN", legacyTaskName, "/F"]);
      }
      for (const taskName of taskNames) {
        await runOptional("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]);
      }
      await runOptional("schtasks.exe", [
        "/Create",
        "/TN",
        "TokenRankCollectorMidnight",
        "/SC",
        "DAILY",
        "/ST",
        "00:00",
        "/TR",
        file,
        "/F",
      ]);
      await runOptional("schtasks.exe", [
        "/Create",
        "/TN",
        "TokenRankCollectorNoon",
        "/SC",
        "DAILY",
        "/ST",
        "12:00",
        "/TR",
        file,
        "/F",
      ]);
    } else {
      await runOptional("systemctl", ["--user", "daemon-reload"]);
      await runOptional("systemctl", ["--user", "enable", "--now", "tokenrank-collector.timer"]);
    }
  }

  console.log(`已安装后台服务: ${file}`);
}

async function serviceStatus() {
  const { file, timerFile } = servicePaths();
  const installed = Boolean(await pathExists(file)) && (!timerFile || Boolean(await pathExists(timerFile)));
  console.log(installed ? `已安装: ${file}` : "未安装");
}

async function uninstallService() {
  const { kind, file, timerFile, taskNames = [], legacyTaskName } = servicePaths();

  if (!process.env.TOKENRANK_SERVICE_NO_REGISTER) {
    if (kind === "launchd") {
      await runOptional("launchctl", ["unload", file]);
    } else if (kind === "schtasks") {
      if (legacyTaskName) {
        await runOptional("schtasks.exe", ["/Delete", "/TN", legacyTaskName, "/F"]);
      }
      for (const taskName of taskNames) {
        await runOptional("schtasks.exe", ["/Delete", "/TN", taskName, "/F"]);
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
  console.log(`已卸载后台服务: ${file}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function daemon(args) {
  if (args.includes("--once")) {
    await upload(args);
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
    console.log("没有发现可上传的本地 token 统计。");
    return;
  }

  for (const entry of entries) {
    console.log(`${entry.date}\t${entry.tool}\t${entry.model}\t${entry.total}`);
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "tools":
      console.log(TOOL_KEYS.join("\n"));
      return;
    case "sources":
      printSources();
      return;
    case "preview":
      await preview(args);
      return;
    case "connect": {
      const webhookUrl = requireWebhookUrl(args[0]);
      await writeConfig({ webhookUrl, connectedAt: new Date().toISOString() });
      console.log("已保存 webhook。");
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
        await installService(args.slice(1));
        return;
      }

      if (args[0] === "status") {
        await serviceStatus();
        return;
      }

      if (args[0] === "uninstall") {
        await uninstallService();
        return;
      }

      throw new Error("未知 service 命令。");
    case undefined:
    case "-h":
    case "--help":
    case "help":
      console.log(usage());
      return;
    default:
      throw new Error(`未知命令: ${command}\n\n${usage()}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
