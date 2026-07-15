import { createServer as createHttpsServer } from "node:https";
import { createServer, type IncomingMessage } from "node:http";
import { connect as connectSocket } from "node:net";
import { access, copyFile, mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

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
] as const;

const execFileAsync = promisify(execFile);
const cliPath = path.resolve("bin/tokenrank.mjs");

type NodeSqliteModule = {
  DatabaseSync: new (file: string, options?: { readOnly?: boolean }) => {
    close: () => void;
    exec: (sql: string) => void;
  };
};

async function importNodeSqlite(): Promise<NodeSqliteModule> {
  const moduleName = "node:sqlite";
  const originalEmitWarning = process.emitWarning;
  process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
    if (args[0] === "ExperimentalWarning" || String(warning).includes("SQLite")) {
      return;
    }

    Reflect.apply(originalEmitWarning, process, [warning, ...args]);
  }) as typeof process.emitWarning;

  try {
    return (await import(moduleName)) as NodeSqliteModule;
  } finally {
    process.emitWarning = originalEmitWarning;
  }
}

const testTlsKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDaeBTn/zCdHU6x
leTb1PXLXQLZ5Xs1kgMam+L7wQneoYR7Jkcls84WyC1zTWk0wGFKujgMmZjtpcC/
PbIZ05/U437IOgvNH4WrRlcMcX6358CZiHYDbq65EJNFJ9FbWViW6Yq9GviG0bTD
e6i2/AZsu9WuskH3NxuvKUr8Fp/0MFgmRXQZ2HGkSgaSOD9npCNNS263vnE+VOle
IkFwOAgU6fAIXL8xyxr11oNQ1q5goihT0x4lhVSUnrwUgR5W1PvBlqUubscJkxXq
Tx/yQwq0pacyh0PLVy1opu2vfxQevkBfXvQM1N1gPOljlyJ1g38Llp7dxqepj6Ix
LHOne6FtAgMBAAECggEANGttsMDlfD1k/W1W7XxqwbH+liPe7VqsjfzreLa31Ihy
zk2/8obzIzpC1ZC0dqjWb2TBQBy2ugb0ea6nBlVl22H+sLJk1IIEw7Tr/BtbaWsd
Jnm8v1QWbmdQvt4v+Lg2bnd5B6jqCwdUVTddoxJTxFFJk1JIS7YYWW4SBOy00pU5
hAWQB9Lrf2+U6ZmDjIc5zy9VCZlUsebhSh9XXVsYx7TFK3pbP7UlLP2gOKu7AEXD
pCTYqeAFgM4hdClR0y+q8othDejPb12lk8vfmtPVRM5MNG9zY0WiJNHNF8D27fYX
uQ3Wy/KZlgn7SpwdWORTAqWF5C76do0CqZ+gHT3zAQKBgQDtF4Cgnry+/Vh7r2Vx
M5iRKIVPoxsKWsEzQjPvUfp6z+A+CBtmf0OyO9eQgPjVArAZyPFTEYmCfzXh6Jdv
PrRlPj5PiUeiFDu6HwGsa9JTtOe7NcPuBAcckv2ll6Msfiy8snkW/CdajFMuW83z
kIPq+suoskrkdZLO9w8C7P4vQQKBgQDr5F/89J8abhwCyKvQG3uN3ySSv/HZepAY
GOSDLJNPyLdezqA2n2j3vhGu3xrz2qtB385LDuSqIsPV+51ESlvYIi6NAhBhLKzL
wmw2rRTYp72DwIiJCCvR9GHUubZBN1oFiXrshKYP/vKU2DnXFMTG/UO/wFDKITFn
yUZjaeuTLQKBgCGkCxE/VMK4ydxK59bnHkfCex/wob6XYAB47UuQ0zyn0Eac+d5S
QnXAvfZ4BlabGgeelndV7rAAgtG6Ifqb6BbRfR/l968MtejTy3X+mopcCeFrYJCe
K7AnPyxG1tVSVeC0ZjAXuTHE5WyXhCKCJ+WojksyeSPvdtQ9A/lDTVHBAoGAYy5D
WZT0rGUta9I5wyc6/LycoQMJSdppaWhV8/0y9vG6f6c635yIwtlsj+0IZQ1Ewk66
av6ZEBvL4VWImyT0ltxQXENI5cKl6IoXe6msQSfN2+6AubTwz7cDxzBKPANs2zUh
tP5U4BbeocyEDTWTQuNLr/zJOyNXpX6QFM59GQUCgYEAssSokP7Qu1L9aWSdH3zm
2oy++tpPzzRss1cHsD17zHLqqF7MyvEyxo976UYWHt4TCIVbDUsEkXoUhPv3MaeU
r+J8ZeVLT+HU9g8fCw8n3Ps3f3sJ4lDFzCllj0cR8jig5fXajzpbsaai4QY8wwEP
lgy92ktjMh5UrTe8P+ZRq3A=
-----END PRIVATE KEY-----
`;

const testTlsCert = `-----BEGIN CERTIFICATE-----
MIIDPTCCAiWgAwIBAgIUK6OkpFUSLKgQN9yk2qHy1RyMc+8wDQYJKoZIhvcNAQEL
BQAwHDEaMBgGA1UEAwwRdG9rZW5yYW5rLmludmFsaWQwHhcNMjYwNjI3MTcwOTUx
WhcNMjcwNjI3MTcwOTUxWjAcMRowGAYDVQQDDBF0b2tlbnJhbmsuaW52YWxpZDCC
ASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBANp4FOf/MJ0dTrGV5NvU9ctd
AtnlezWSAxqb4vvBCd6hhHsmRyWzzhbILXNNaTTAYUq6OAyZmO2lwL89shnTn9Tj
fsg6C80fhatGVwxxfrfnwJmIdgNurrkQk0Un0VtZWJbpir0a+IbRtMN7qLb8Bmy7
1a6yQfc3G68pSvwWn/QwWCZFdBnYcaRKBpI4P2ekI01Lbre+cT5U6V4iQXA4CBTp
8AhcvzHLGvXWg1DWrmCiKFPTHiWFVJSevBSBHlbU+8GWpS5uxwmTFepPH/JDCrSl
pzKHQ8tXLWim7a9/FB6+QF9e9AzU3WA86WOXInWDfwuWnt3Gp6mPojEsc6d7oW0C
AwEAAaN3MHUwHQYDVR0OBBYEFO/YubzfI6AnYGJs+rTN9Up5vQU4MB8GA1UdIwQY
MBaAFO/YubzfI6AnYGJs+rTN9Up5vQU4MA8GA1UdEwEB/wQFMAMBAf8wIgYDVR0R
BBswGYIRdG9rZW5yYW5rLmludmFsaWSHBH8AAAEwDQYJKoZIhvcNAQELBQADggEB
AAXDIfGPOSGHn20t066+Ct4PQrvRr8obAAdpAkCei1ZEmmJIkEEtR72jF0IRwI9R
QICJMc8MT4TElB8I6Rti9njRCbNHxa8JuXElCVAThGfueeVndDp9oSb7/02i2A4t
HkQFBHxJcmSLmTcxf2nj77Hot4XvOHQhj7fDpi5DOwhXnX615pVi8mUrlaVHWFVt
YbO4Aqmi25Bfw7TBErKNfabfNnUja4cMDFgLjyicgwYuMD83Ni9QRBjArBfMImw8
XjlkFumwUO6xw2p68m15FPI0u+lPMyucEK34qQhhyhgDZhXA3LePg10hocK0l6Mz
mWdPBHAaoVtKmAJPHv7llu4=
-----END CERTIFICATE-----
`;

function cliEnv(home: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    LOCALAPPDATA: path.join(home, "AppData", "Local"),
    XDG_DATA_HOME: path.join(home, ".local", "share"),
    CODEX_HOME: path.join(home, ".codex"),
    GEMINI_CLI_HOME: path.join(home, ".gemini"),
    TOKENRANK_TEST_PLATFORM: "win32",
    TOKENRANK_SERVICE_NO_REGISTER: "1",
    TOKENRANK_LANG: "en",
    TZ: "Asia/Shanghai",
    ...extraEnv,
  };
}

async function runCli(args: string[], home: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    env: cliEnv(home, extraEnv),
  });
}

async function runInstalledCli(args: string[], home: string) {
  const installDir = path.join(home, ".tokenrank");
  const installedCliPath = path.join(installDir, "tokenrank.mjs");

  await mkdir(installDir, { recursive: true });
  await copyFile(cliPath, installedCliPath);
  await copyFile(path.resolve("package.json"), path.join(installDir, "package.json"));

  return execFileAsync(process.execPath, [installedCliPath, ...args], {
    env: cliEnv(home),
  });
}

async function tempHome() {
  return mkdtemp(path.join(tmpdir(), "tokenrank-cli-"));
}

const sourceFixturePaths = {
  codex: ".codex/archived_sessions/codex.jsonl",
  "claude-code": ".claude/projects/demo/claude.jsonl",
  hermes: ".hermes/sessions/hermes.jsonl",
  openclaw: ".openclaw/agents/openclaw.jsonl",
  cline: "AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/cline.json",
  opencode: ".local/share/opencode/sessions/opencode.jsonl",
  workbuddy: ".workbuddy/traces/workbuddy.jsonl",
  gemini: ".gemini/tmp/boss/chats/gemini.json",
  zcode: ".zcode/sessions/zcode.jsonl",
  kimi: ".kimi/sessions/kimi.jsonl",
  "kilo-code": "AppData/Roaming/Code/User/globalStorage/kilocode.kilo-code/tasks/kilo.json",
  "codex-vps": ".codex-vps/sessions/codex-vps.jsonl",
  "roo-code": "AppData/Roaming/Code/User/globalStorage/rooveterinaryinc.roo-cline/tasks/roo.json",
  qwen: ".qwen/sessions/qwen.jsonl",
  "codex-cache": ".codex/cache/session/codex-cache.jsonl",
  cursor: ".tokenrank/imports/cursor-usage.json",
  "github-copilot": ".copilot/logs/copilot-usage.jsonl",
  continue: ".continue/sessions/continue-usage.json",
} as const satisfies Record<(typeof TOOL_KEYS)[number], string>;

function expectedFixtureTotal(tool: (typeof TOOL_KEYS)[number]) {
  return tool === "codex" ? 3 : 10;
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

async function withUploadServer<T>(
  handler: (payload: unknown) => void | Promise<void>,
  callback: (webhookUrl: string) => Promise<T>,
) {
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    await handler(JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: 0, uploaded: 1 }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("test server did not bind to a TCP port");
    }

    return await callback(`http://127.0.0.1:${address.port}/api/collector/upload/test-token`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function withProxyUploadServer<T>(
  handler: (payload: unknown, requestUrl: string | undefined) => void | Promise<void>,
  callback: (proxyUrl: string) => Promise<T>,
) {
  const server = createServer(async (request, response) => {
    const body = await readRequestBody(request);
    await handler(JSON.parse(body), request.url);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: 0, uploaded: 1 }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();

    if (!address || typeof address === "string") {
      throw new Error("test proxy did not bind to a TCP port");
    }

    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function createSelfSignedCertificate() {
  return {
    key: Buffer.from(testTlsKey),
    cert: Buffer.from(testTlsCert),
  };
}

async function withHttpsUploadProxy<T>(
  home: string,
  handler: (payload: unknown) => void | Promise<void>,
  callback: (proxyUrl: string, getTunnelTarget: () => string | undefined) => Promise<T>,
) {
  const cert = await createSelfSignedCertificate();
  const uploadServer = createHttpsServer(cert, async (request, response) => {
    const body = await readRequestBody(request);
    await handler(JSON.parse(body));
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: 0, uploaded: 1 }));
  });

  await new Promise<void>((resolve) => uploadServer.listen(0, "127.0.0.1", resolve));

  const uploadAddress = uploadServer.address();

  if (!uploadAddress || typeof uploadAddress === "string") {
    throw new Error("test HTTPS server did not bind to a TCP port");
  }

  let tunnelTarget: string | undefined;
  const proxyServer = createServer();
  proxyServer.on("connect", (request, clientSocket, head) => {
    tunnelTarget = request.url;
    const upstream = connectSocket(uploadAddress.port, "127.0.0.1", () => {
      clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (head.length) {
        upstream.write(head);
      }
      upstream.pipe(clientSocket);
      clientSocket.pipe(upstream);
    });
    upstream.on("error", () => clientSocket.destroy());
    upstream.on("close", () => clientSocket.destroy());
    clientSocket.on("error", () => upstream.destroy());
    clientSocket.on("close", () => upstream.destroy());
  });

  await new Promise<void>((resolve) => proxyServer.listen(0, "127.0.0.1", resolve));

  try {
    const proxyAddress = proxyServer.address();

    if (!proxyAddress || typeof proxyAddress === "string") {
      throw new Error("test proxy did not bind to a TCP port");
    }

    return await callback(
      `http://127.0.0.1:${proxyAddress.port}`,
      () => tunnelTarget,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      proxyServer.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise<void>((resolve, reject) =>
      uploadServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function writeJsonLog(home: string, relativePath: string, value: unknown) {
  const file = path.join(home, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  const body = relativePath.endsWith(".jsonl") ? `${JSON.stringify(value)}\n` : JSON.stringify(value);
  await writeFile(file, body);
}

async function writeJsonLines(home: string, relativePath: string, values: unknown[]) {
  const file = path.join(home, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${values.map((value) => JSON.stringify(value)).join("\n")}\n`);
}

async function writeSqliteUsage(home: string, relativePath: string) {
  const file = path.join(home, relativePath);
  await mkdir(path.dirname(file), { recursive: true });
  const { DatabaseSync } = await importNodeSqlite();
  const db = new DatabaseSync(file);

  try {
    db.exec(
      [
        "create table sessions (id text, model text, started_at integer, input_tokens integer, output_tokens integer, cache_read_tokens integer, cache_write_tokens integer);",
        "insert into sessions values ('row-1', 'sqlite-model', 1782201600, 7, 8, 9, 10);",
      ].join(" "),
    );
  } finally {
    db.close();
  }
}

async function withSequencedUploadServer<T>(
  statuses: number[],
  callback: (webhookUrl: string, requestCount: () => number) => Promise<T>,
) {
  let requests = 0;
  const server = createServer(async (request, response) => {
    await readRequestBody(request);
    const status = statuses[Math.min(requests, statuses.length - 1)] ?? 200;
    requests += 1;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify(status >= 200 && status < 300 ? { status: 0, uploaded: 1 } : { status: 1, error: "temporary" }),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    return await callback(
      `http://127.0.0.1:${address.port}/api/collector/upload/test-token`,
      () => requests,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

async function exists(file: string) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function stripAnsi(value: string) {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function terminalDisplayWidth(value: string) {
  return [...stripAnsi(value)].reduce((width, character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    const isWide =
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
        (codePoint >= 0xffe0 && codePoint <= 0xffe6));

    return width + (isWide ? 2 : 1);
  }, 0);
}

async function writeAllToolFixtures(home: string) {
  await Promise.all(
    TOOL_KEYS.map((tool) =>
      writeJsonLog(home, sourceFixturePaths[tool], {
        timestamp: "2026-06-23T08:00:00.000Z",
        model: `${tool}-model`,
        message: {
          usage: {
            input_tokens: 1,
            output_tokens: 2,
            cache_read_input_tokens: 3,
            cache_creation_input_tokens: 4,
          },
        },
        prompt: "must not appear in preview",
        content: "must not appear in preview",
      }),
    ),
  );
}

describe("tokenrank collector CLI", () => {
  it("defaults to English for non-Chinese system locales", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["help"], home, {
      TOKENRANK_LANG: "auto",
      LANG: "en_US.UTF-8",
      LC_ALL: "",
      LC_MESSAGES: "",
    });

    expect(stdout).toContain("Commands:");
    expect(stdout).toContain("Language: auto");
    expect(stdout).not.toContain("命令：");
  });

  it("detects Chinese from the system locale", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["help"], home, {
      TOKENRANK_LANG: "auto",
      LANG: "zh_CN.UTF-8",
      LC_ALL: "",
      LC_MESSAGES: "",
    });

    expect(stdout).toContain("命令：");
    expect(stdout).toContain("语言：自动");
    expect(stdout).not.toContain("Commands:");
  });

  it("lets --lang override the environment and renders the complete Chinese scoreboard", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["tools", "--lang", "zh"], home, {
      TOKENRANK_LANG: "en",
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "120",
    });

    expect(stdout).toContain("公开排名信号");
    expect(stdout).toContain("TOKEN 燃烧。");
    expect(stdout).toContain("RANKING 狂飙。");
    expect(stdout).toContain("支持的工具");
    expect(stdout).not.toContain("PUBLIC RANK SIGNAL");
    expect(stripAnsi(stdout).split("\n").every((line) => terminalDisplayWidth(line) <= 50)).toBe(true);
  });

  it("rejects unsupported explicit languages", async () => {
    const home = await tempHome();

    await expect(runCli(["tools", "--lang", "ja"], home)).rejects.toMatchObject({
      stderr: expect.stringContaining("Unsupported language: ja"),
    });
  });

  it("rejects an empty --lang value", async () => {
    const home = await tempHome();

    await expect(runCli(["tools", "--lang="], home)).rejects.toMatchObject({
      stderr: expect.stringContaining("Missing a value for --lang"),
    });
  });

  it("lists every supported leaderboard tool", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["tools"], home);

    for (const tool of TOOL_KEYS) {
      expect(stdout).toContain(tool);
    }
  });

  it("runs from the installer layout with package metadata beside the CLI", async () => {
    const home = await tempHome();
    const { stdout } = await runInstalledCli(["tools"], home);

    expect(stdout).toContain("codex");
  });

  it("stores the webhook URL in a private config file", async () => {
    const home = await tempHome();
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home);

    const configPath = path.join(home, ".tokenrank", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as { webhookUrl: string };
    const mode = (await stat(configPath)).mode & 0o777;

    expect(config.webhookUrl).toBe("https://tokenrank.test/api/collector/upload/secret");
    if (process.platform !== "win32") {
      expect(mode).toBe(0o600);
    }
  });

  it("can suppress the logo for chained installer steps", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(
      ["connect", "https://tokenrank.test/api/collector/upload/secret"],
      home,
      { TOKENRANK_NO_LOGO: "1" },
    );

    expect(stdout).toContain("Saved webhook");
    expect(stdout).not.toMatch(/[一-龥]/);
    expect(stdout).not.toContain("TOKENRANK");
    expect(stdout).not.toContain("AI coding usage collector");
    expect(stdout).not.toContain("next: tokenrank upload");
  });

  it("renders the selected B Scoreboard Panels composition in a wide TTY", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["tools"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "120",
    });

    const visibleLines = stripAnsi(stdout).split("\n");

    expect(visibleLines[0]).toMatch(/^TOKEN\/RANK \/\/ LIVE\s+01$/);
    expect(stdout).toContain("TOKEN/RANK // LIVE");
    expect(stdout).toContain("PUBLIC RANK SIGNAL");
    expect(stdout).toContain("BURN TOKENS.");
    expect(stdout).toContain("ASCEND RANKS.");
    expect(stdout).toContain("SUPPORTED TOOLS");
    expect(stdout).toContain("\u001b[48;2;214;255;63m");
    expect(stdout).toContain("\u001b[38;2;255;91;53m");
    expect(stdout).not.toContain("TOKEN/RANK // COLLECTOR");
    expect(stdout).not.toContain("STATUS / 001");
    expect(stdout).not.toContain("\u001b[38;5;");
    expect(stdout).not.toMatch(/48;2;(36;255;184|0;218;255|105;48;255|255;37;141)m/);
    expect(stdout).not.toContain("████████╗");
    expect(stdout).toContain("github-copilot");
  });

  it("uses a compact layout without overflowing a narrow terminal", async () => {
    const home = await tempHome();

    for (const columns of [40, 71]) {
      const { stdout } = await runCli(["tools"], home, {
        TOKENRANK_TEST_TTY: "1",
        TOKENRANK_NO_ANIMATION: "1",
        COLUMNS: String(columns),
      });
      const visibleLines = stripAnsi(stdout).split("\n");

      expect(visibleLines.every((line) => [...line].length <= columns)).toBe(true);
      expect(stdout).toContain("TOKEN/RANK // LIVE");
      expect(stdout).not.toContain("BURN TOKENS.");
    }
  });

  it("keeps NO_COLOR output free of ANSI control sequences", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["tools"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      NO_COLOR: "1",
      COLUMNS: "120",
    });

    expect(stdout).not.toContain("\u001b[");
    expect(stdout).not.toContain("TOKEN/RANK // COLLECTOR");
    expect(stdout).toContain("SUPPORTED TOOLS");
  });

  it("reports connection, service, and next boundary from tokenrank status", async () => {
    const home = await tempHome();
    const env = {
      TOKENRANK_TEST_PLATFORM: "darwin",
      TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
      TOKENRANK_NO_LOGO: "1",
    };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, env);
    await runCli(["service", "install"], home, env);

    const { stdout } = await runCli(["status"], home, env);

    expect(stdout).toContain("CONNECTED");
    expect(stdout).toContain("SERVICE INSTALLED");
    expect(stdout).toContain("NEXT BOUNDARY");
    expect(stdout).not.toContain("/secret");
  });

  it("diagnoses exact tool sources without exposing local paths", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "doctor-codex-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 9, output_tokens: 3 },
    });

    const { stdout } = await runCli(["doctor"], home, { TOKENRANK_NO_LOGO: "1" });

    expect(stdout).toContain("codex\tREADY");
    expect(stdout).toContain("cursor\tEXACT SOURCE REQUIRED");
    expect(stdout).toContain("github-copilot");
    expect(stdout).toContain("continue");
    expect(stdout).not.toContain(home);
  });

  it("removes the saved webhook config on logout", async () => {
    const home = await tempHome();
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home);

    const configPath = path.join(home, ".tokenrank", "config.json");
    expect(await exists(configPath)).toBe(true);

    const { stdout } = await runCli(["logout"], home);

    expect(stdout).toContain("Removed local webhook configuration");
    expect(await exists(configPath)).toBe(false);
  });

  it("lists local source adapters for every supported tool", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["sources"], home);

    for (const tool of TOOL_KEYS) {
      expect(stdout).toContain(tool);
    }
  });

  it("keeps Codex usage attributed to Codex when Cursor is the editor host", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/cursor-hosted-codex.jsonl", {
      id: "codex-event-in-cursor",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 11, output_tokens: 7 },
    });

    const cursor = JSON.parse((await runCli(["preview", "--json", "--tool", "cursor"], home)).stdout) as {
      entries: Array<{ tool: string }>;
    };
    const codex = JSON.parse((await runCli(["preview", "--json", "--tool", "codex"], home)).stdout) as {
      entries: Array<{ tool: string; total: number }>;
    };

    expect(cursor.entries).toEqual([]);
    expect(codex.entries).toEqual([expect.objectContaining({ tool: "codex", total: 18 })]);
  });

  it("finds VS Code extension tools under Windows APPDATA", async () => {
    const home = await tempHome();
    await writeJsonLog(
      home,
      "AppData/Roaming/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/cline.json",
      {
        id: "windows-cline-event",
        timestamp: "2026-07-12T05:00:00.000Z",
        model: "claude-sonnet-4",
        usage: { input_tokens: 6, output_tokens: 4 },
      },
    );

    const payload = JSON.parse(
      (
        await runCli(["preview", "--json", "--tool", "cline"], home, {
          TOKENRANK_TEST_PLATFORM: "win32",
        })
      ).stdout,
    ) as { entries: Array<{ tool: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({ tool: "cline", total: 10 }),
    ]);
  });

  it("deduplicates the same provider event before daily aggregation", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.cursor, [
      {
        id: "cursor-request-1",
        timestamp: "2026-07-12T05:00:00.000Z",
        model: "claude-sonnet-4",
        tokenUsage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, cacheWriteTokens: 5 },
      },
      {
        id: "cursor-request-1",
        timestamp: "2026-07-12T05:00:00.000Z",
        model: "claude-sonnet-4",
        tokenUsage: { inputTokens: 100, outputTokens: 20, cacheReadTokens: 10, cacheWriteTokens: 5 },
      },
    ]);

    const payload = JSON.parse(
      (await runCli(["preview", "--json", "--tool", "cursor"], home)).stdout,
    ) as { entries: Array<{ tool: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({ tool: "cursor", total: 135 }),
    ]);
  });

  it("reads GitHub Copilot OpenTelemetry token usage metrics", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".copilot/logs/github-copilot-otel.log", {
      resourceMetrics: [
        {
          scopeMetrics: [
            {
              metrics: [
                {
                  name: "gen_ai.client.token.usage",
                  data: {
                    dataPoints: [
                      {
                        timeUnixNano: "1783828800000000000",
                        sum: 30,
                        attributes: [
                          { key: "gen_ai.token.type", value: { stringValue: "input" } },
                          { key: "gen_ai.request.model", value: { stringValue: "gpt-5" } },
                        ],
                      },
                      {
                        timeUnixNano: "1783828800000000000",
                        sum: 12,
                        attributes: [
                          { key: "gen_ai.token.type", value: { stringValue: "output" } },
                          { key: "gen_ai.request.model", value: { stringValue: "gpt-5" } },
                        ],
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    });

    const payload = JSON.parse(
      (await runCli(["preview", "--json", "--tool", "github-copilot"], home)).stdout,
    ) as { entries: Array<{ input: number; output: number; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({ input: 30, output: 12, total: 42 }),
    ]);
  });

  it(
    "previews aggregate rows scanned from local tool logs without raw content",
    async () => {
      const home = await tempHome();
      await writeAllToolFixtures(home);

      const { stdout } = await runCli(["preview", "--json"], home);
      const payload = JSON.parse(stdout) as { entries: Array<{ tool: string; total: number }> };

      expect(payload.entries).toHaveLength(TOOL_KEYS.length);
      expect(payload.entries).toEqual(
        TOOL_KEYS.map((tool) =>
          expect.objectContaining({
            date: "2026-06-23",
            tool,
            model: `${tool}-model`,
            total: expectedFixtureTotal(tool),
          }),
        ),
      );
      expect(stdout).not.toContain("must not appear");
    },
    15_000,
  );

  it("scores Claude Code rows as raw input, output, and cache tokens", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths["claude-code"], {
      timestamp: "2026-07-01T00:00:00.000Z",
      type: "assistant",
      message: {
        model: "claude-fixture",
        usage: {
          input_tokens: 1_000,
          cache_read_input_tokens: 800,
          cache_creation_input_tokens: 50,
          output_tokens: 200,
        },
      },
    });

    const { stdout } = await runCli(["preview", "--json", "--tool", "claude-code"], home);
    const payload = JSON.parse(stdout) as {
      entries: Array<{
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
      }>;
    };

    expect(payload.entries).toEqual([
      expect.objectContaining({
        input: 1_000,
        output: 200,
        cacheRead: 800,
        cacheWrite: 50,
        total: 2_050,
      }),
    ]);
  });

  it("uses a tool-specific model bucket when local logs do not expose model names", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/codex.jsonl", {
      timestamp: "2026-06-23T08:00:00.000Z",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
      },
    });

    const { stdout } = await runCli(["preview", "--json", "--tool", "codex"], home);
    const payload = JSON.parse(stdout) as { entries: Array<{ model: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({
        model: "codex-unattributed",
        total: 15,
      }),
    ]);
  });

  it("carries Codex JSONL model context into later usage rows", async () => {
    const home = await tempHome();
    await writeJsonLines(home, ".codex/sessions/codex.jsonl", [
      {
        timestamp: "2026-06-23T08:00:00.000Z",
        type: "turn_context",
        payload: {
          model: "gpt-5.2-codex",
        },
      },
      {
        timestamp: "2026-06-23T08:01:00.000Z",
        type: "response_item",
        payload: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        },
      },
    ]);

    const { stdout } = await runCli(["preview", "--json", "--tool", "codex"], home);
    const payload = JSON.parse(stdout) as { entries: Array<{ model: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({
        model: "gpt-5.2-codex",
        total: 15,
      }),
    ]);
  });

  it("does not carry a JSONL event id into later usage rows", async () => {
    const home = await tempHome();
    await writeJsonLines(home, ".codex/sessions/codex.jsonl", [
      {
        type: "session_meta",
        payload: {
          id: "codex-session-id",
          model: "gpt-5.2-codex",
        },
      },
      {
        timestamp: "2026-06-23T08:01:00.000Z",
        type: "response_item",
        payload: {
          usage: {
            input_tokens: 10,
            output_tokens: 5,
          },
        },
      },
      {
        timestamp: "2026-06-23T08:02:00.000Z",
        type: "response_item",
        payload: {
          usage: {
            input_tokens: 12,
            output_tokens: 7,
          },
        },
      },
    ]);

    const { stdout } = await runCli(["preview", "--json", "--tool", "codex"], home);
    const payload = JSON.parse(stdout) as { entries: Array<{ model: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({
        model: "gpt-5.2-codex",
        total: 34,
      }),
    ]);
  });

  it("does not double-count Codex cached and reasoning token detail fields", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/codex.jsonl", {
      timestamp: "2026-06-23T08:00:00.000Z",
      model: "gpt-5.5",
      usage: {
        input_tokens: 1_000,
        output_tokens: 200,
        cached_input_tokens: 800,
        reasoning_output_tokens: 50,
        total_tokens: 1_200,
      },
    });

    const { stdout } = await runCli(["preview", "--json", "--tool", "codex"], home);
    const payload = JSON.parse(stdout) as {
      entries: Array<{
        input: number;
        output: number;
        cacheRead: number;
        total: number;
      }>;
    };

    expect(payload.entries).toEqual([
      expect.objectContaining({
        input: 1_000,
        output: 200,
        cacheRead: 800,
        total: 1_200,
      }),
    ]);
  });

  it("ignores mismatched source totals while scanning local tool logs", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.openclaw, {
      timestamp: "2026-06-23T08:00:00.000Z",
      model: "openclaw-total-mismatch",
      usage: {
        input_tokens: 7,
        output_tokens: 8,
        total_tokens: 999,
      },
    });

    const { stdout } = await runCli(["preview", "--json", "--tool", "openclaw"], home);
    const payload = JSON.parse(stdout) as { entries: Array<{ model: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({
        model: "openclaw-total-mismatch",
        total: 15,
      }),
    ]);
  });

  it("uploads aggregate rows for all supported tools", async () => {
    const home = await tempHome();
    const usagePath = path.join(home, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        entries: TOOL_KEYS.map((tool) => ({
          date: "2026-06-23",
          tool,
          model: `${tool}-demo`,
          input: 1,
          output: 2,
          cacheRead: 3,
          cacheWrite: 4,
        })),
      }),
    );

    await withUploadServer(
      (payload) => {
        expect(payload).toMatchObject({
          clientVersion: expect.any(String),
          deviceId: expect.stringMatching(/^tokenrank-/),
          timezone: expect.any(String),
          generatedAt: expect.any(String),
        });
        expect((payload as { entries: unknown[] }).entries).toHaveLength(TOOL_KEYS.length);
        expect((payload as { entries: Array<{ tool: string; total: number }> }).entries).toEqual(
          TOOL_KEYS.map((tool) =>
            expect.objectContaining({
              tool,
              total: expectedFixtureTotal(tool),
            }),
          ),
        );
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        const { stdout } = await runCli(["upload", "--file", usagePath], home);

        expect(stdout).toContain(`${TOOL_KEYS.length} rows`);
      },
    );
  });

  it("splits uploads into server-sized batches", async () => {
    const home = await tempHome();
    const usagePath = path.join(home, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        entries: Array.from({ length: 501 }, (_, index) => ({
          date: "2026-06-23",
          tool: "codex",
          model: `batch-${index}`,
          input: 1,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
        })),
      }),
    );

    const batchSizes: number[] = [];

    await withUploadServer(
      (payload) => {
        batchSizes.push((payload as { entries: unknown[] }).entries.length);
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        const { stdout } = await runCli(["upload", "--file", usagePath], home);

        expect(stdout).toContain("501 rows");
      },
    );

    expect(batchSizes).toEqual([500, 1]);
  });

  it("uploads through a configured HTTP proxy when the webhook host is unreachable", async () => {
    const home = await tempHome();
    const usagePath = path.join(home, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        entries: [
          {
            date: "2026-06-23",
            tool: "codex",
            model: "proxy-demo",
            input: 1,
            output: 2,
            cacheRead: 0,
            cacheWrite: 0,
          },
        ],
      }),
    );

    let proxiedUrl: string | undefined;

    await withProxyUploadServer(
      (payload, requestUrl) => {
        proxiedUrl = requestUrl;
        expect((payload as { entries: Array<{ model: string; total: number }> }).entries).toEqual([
          expect.objectContaining({ model: "proxy-demo", total: 3 }),
        ]);
      },
      async (proxyUrl) => {
        await runCli(["connect", "http://tokenrank.invalid/api/collector/upload/test-token"], home);
        const { stdout } = await runCli(["upload", "--file", usagePath], home, {
          TOKENRANK_PROXY: proxyUrl,
        });

        expect(stdout).toMatch(/1 row(?:\r?\n|$)/);
      },
    );

    expect(proxiedUrl).toBe("http://tokenrank.invalid/api/collector/upload/test-token");
  });

  it("uploads HTTPS webhooks through a configured proxy tunnel", async () => {
    const home = await tempHome();
    const usagePath = path.join(home, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        entries: [
          {
            date: "2026-06-23",
            tool: "codex",
            model: "https-proxy-demo",
            input: 2,
            output: 3,
            cacheRead: 0,
            cacheWrite: 0,
          },
        ],
      }),
    );

    await withHttpsUploadProxy(
      home,
      (payload) => {
        expect((payload as { entries: Array<{ model: string; total: number }> }).entries).toEqual([
          expect.objectContaining({ model: "https-proxy-demo", total: 5 }),
        ]);
      },
      async (proxyUrl, getTunnelTarget) => {
        await runCli(["connect", "https://tokenrank.invalid/api/collector/upload/test-token"], home);
        const { stdout } = await runCli(["upload", "--file", usagePath], home, {
          NODE_TLS_REJECT_UNAUTHORIZED: "0",
          TOKENRANK_PROXY: proxyUrl,
        });

        expect(stdout).toMatch(/1 row(?:\r?\n|$)/);
        expect(getTunnelTarget()).toBe("tokenrank.invalid:443");
      },
    );
  });

  it("rejects mismatched totals before uploading", async () => {
    const home = await tempHome();
    const usagePath = path.join(home, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        entries: [
          {
            date: "2026-06-23",
            tool: "codex",
            model: "gpt-5.5",
            input: 1,
            output: 2,
            cacheRead: 3,
            cacheWrite: 4,
            total: 0,
          },
        ],
      }),
    );

    let requested = false;

    await withUploadServer(
      () => {
        requested = true;
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        await expect(runCli(["upload", "--file", usagePath], home)).rejects.toMatchObject({
          stderr: expect.stringContaining("total"),
        });
        expect(requested).toBe(false);
      },
    );
  });

  it("supports the reference connect-and-upload flow before adapters exist", async () => {
    const home = await tempHome();

    await withUploadServer(
      (payload) => {
        expect((payload as { entries: unknown[] }).entries).toEqual([]);
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        const { stdout } = await runCli(["upload"], home);

        expect(stdout).toContain("0 rows");
      },
    );
  });

  it("scans local logs when upload is called without a file", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      timestamp: "2026-06-23T08:00:00.000Z",
      model: "gpt-5.5",
      usage: {
        input_tokens: 5,
        output_tokens: 6,
      },
    });

    await withUploadServer(
      (payload) => {
        expect((payload as { entries: Array<{ tool: string; total: number }> }).entries).toEqual([
          expect.objectContaining({ tool: "codex", total: 11 }),
        ]);
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        const { stdout } = await runCli(["upload"], home);

        expect(stdout).toMatch(/1 row(?:\r?\n|$)/);
        expect(stdout).toContain("SCAN LOCAL USAGE");
        expect(stdout).toContain("codex");
        expect(stdout).toContain("Uploading");
      },
    );
  });

  it("renders a real upload as compact Scoreboard Panels without a scan log wall", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "visual-upload-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 5, output_tokens: 6 },
    });

    await withUploadServer(
      () => undefined,
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home, { TOKENRANK_NO_LOGO: "1" });
        const { stdout } = await runCli(["upload"], home, {
          TOKENRANK_TEST_TTY: "1",
          TOKENRANK_NO_ANIMATION: "1",
          COLUMNS: "96",
        });

        const plain = stripAnsi(stdout);

        expect(stdout).toContain("TOKEN/RANK // LIVE");
        expect(stdout).toContain("PUBLIC RANK SIGNAL");
        expect(stdout).toContain("UPLOAD ENDPOINT");
        expect(stdout).toContain("CONNECTED");
        expect(stdout).toContain("LOCAL SOURCES");
        expect(stdout).toContain("Codex");
        expect(stdout).toContain(
          "\u001b[38;2;214;255;63m██████████\u001b[0m\u001b[38;2;133;139;128m░░░░",
        );
        expect(stdout).toContain("DONE");
        expect(stdout).toContain("SKIPPED");
        expect(stdout).toContain("RANK SIGNAL");
        expect(stdout).toContain("PRIVATE CONTENT NEVER LEAVES THIS MACHINE");
        expect(stdout).toContain("UPLOAD COMPLETE");
        expect(plain).not.toContain("Scanning Codex");
        expect(plain).not.toContain("scope: all tools");
        expect(plain).not.toContain("Build payload");
        expect(plain).not.toContain("batch 1/1");
        expect(plain.split("\n").every((line) => [...line].length <= 50)).toBe(true);
        expect(stdout).not.toContain("BOOTING TOKEN GRID");
        expect(stdout).not.toContain("GRID SYNCHRONIZED");
        expect(stdout).not.toMatch(/48;2;(105;48;255|255;37;141)m/);
      },
    );
  });

  it("scans SQLite usage databases without reading conversation content", async () => {
    const home = await tempHome();
    await writeSqliteUsage(home, ".openclaw/agents/state.db");

    const { stdout } = await runCli(["preview", "--json", "--tool", "openclaw"], home);
    const payload = JSON.parse(stdout) as { entries: Array<{ tool: string; model: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({
        date: "2026-06-23",
        tool: "openclaw",
        model: "sqlite-model",
        total: 34,
      }),
    ]);
  });

  it("uploads a missed scheduled boundary once and skips duplicate triggers", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "scheduled-codex-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withSequencedUploadServer([200], async (webhookUrl, requestCount) => {
      const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" };
      await runCli(["connect", webhookUrl], home);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(1);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string; lastSuccessfulAt: string };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T04:00:00.000Z");
      expect(state.lastSuccessfulAt).toBe("2026-07-12T05:00:00.000Z");
    });
  });

  it("lets a successful manual local upload satisfy the current schedule boundary", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "manual-boundary-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withSequencedUploadServer([200], async (webhookUrl, requestCount) => {
      const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" };
      await runCli(["connect", webhookUrl], home);
      await runCli(["upload"], home, clock);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(1);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T04:00:00.000Z");
    });
  });

  it("does not let a filtered manual upload satisfy the current schedule boundary", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "filtered-manual-codex-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });
    await writeJsonLog(home, sourceFixturePaths["claude-code"], {
      id: "scheduled-claude-event",
      timestamp: "2026-07-12T04:35:00.000Z",
      model: "claude-sonnet-4",
      usage: { input_tokens: 6, output_tokens: 3 },
    });

    await withSequencedUploadServer([200, 200], async (webhookUrl, requestCount) => {
      const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" };
      await runCli(["connect", webhookUrl], home);
      await runCli(["upload", "--tool", "codex"], home, clock);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(2);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T04:00:00.000Z");
    });
  });

  it("retries a scheduled boundary after a failed upload", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "retry-codex-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withSequencedUploadServer([500, 200], async (webhookUrl, requestCount) => {
      const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" };
      await runCli(["connect", webhookUrl], home);
      await expect(
        runCli(["daemon", "--once", "--scheduled"], home, clock),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("temporary") });
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(2);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string; lastErrorCode: string | null };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T04:00:00.000Z");
      expect(state.lastErrorCode).toBeNull();
    });
  });

  it("recovers a stale collector lock instead of skipping forever", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "stale-lock-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });
    await mkdir(path.join(home, ".tokenrank"), { recursive: true });
    await writeFile(
      path.join(home, ".tokenrank", "collector.lock"),
      JSON.stringify({ pid: 999_999_999, createdAt: "2026-07-11T00:00:00.000Z" }),
    );

    await withSequencedUploadServer([200], async (webhookUrl, requestCount) => {
      await runCli(["connect", webhookUrl], home);
      await runCli(["daemon", "--once", "--scheduled"], home, {
        TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
      });

      expect(requestCount()).toBe(1);
      expect(await exists(path.join(home, ".tokenrank", "collector.lock"))).toBe(false);
    });
  });

  it("installs, reports, and uninstalls the background service config", async () => {
    const home = await tempHome();
    const darwinEnv = { TOKENRANK_TEST_PLATFORM: "darwin" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, darwinEnv);

    const install = await runCli(["service", "install", "--interval", "120"], home, darwinEnv);
    const plistPath = path.join(home, "Library", "LaunchAgents", "com.tokenrank.collector.plist");
    const plist = await readFile(plistPath, "utf8");

    expect(install.stdout).toContain("Ignored --interval");
    expect(install.stdout).toContain("daily at 12:00 and 24:00");
    expect(plist).toContain("daemon");
    expect(plist).toContain("<key>StartCalendarInterval</key>");
    expect(plist).toContain("<integer>0</integer>");
    expect(plist).toContain("<integer>12</integer>");
    expect(plist).not.toContain("StartInterval");
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<true/>");
    expect(plist).toContain("--scheduled");

    const status = await runCli(["service", "status"], home, darwinEnv);
    expect(status.stdout).toContain("Installed");

    const uninstall = await runCli(["service", "uninstall"], home, darwinEnv);
    expect(uninstall.stdout).toContain("Uninstalled");
    expect(await exists(plistPath)).toBe(false);
  });

  it("propagates service registration failures and does not report config files as registered", async () => {
    const home = await tempHome();
    const systemdEnv = { TOKENRANK_TEST_PLATFORM: "linux" };
    await runCli(
      ["connect", "https://tokenrank.test/api/collector/upload/secret"],
      home,
      systemdEnv,
    );
    await runCli(["service", "install"], home, systemdEnv);

    const missingCommandEnv = {
      ...systemdEnv,
      PATH: path.join(home, "empty-bin"),
      TOKENRANK_SERVICE_NO_REGISTER: "",
    };
    const status = await runCli(["service", "status"], home, missingCommandEnv);
    expect(status.stdout).toContain("Not installed");

    await expect(runCli(["service", "install"], home, missingCommandEnv)).rejects.toMatchObject({
      stderr: expect.stringContaining("systemctl"),
    });
  });

  it("defaults the background service to fixed 00:00 and 12:00 collection times", async () => {
    const home = await tempHome();
    const darwinEnv = { TOKENRANK_TEST_PLATFORM: "darwin" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, darwinEnv);

    await runCli(["service", "install"], home, darwinEnv);
    const plistPath = path.join(home, "Library", "LaunchAgents", "com.tokenrank.collector.plist");
    const plist = await readFile(plistPath, "utf8");

    expect(plist).toContain("<key>Hour</key>\n      <integer>0</integer>");
    expect(plist).toContain("<key>Hour</key>\n      <integer>12</integer>");
    expect(plist).toContain("<key>Minute</key>\n      <integer>0</integer>");
  });

  it("installs a systemd user timer for fixed 00:00 and 12:00 collection times", async () => {
    const home = await tempHome();
    const linuxEnv = { TOKENRANK_TEST_PLATFORM: "linux" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, linuxEnv);

    const install = await runCli(["service", "install"], home, linuxEnv);
    const servicePath = path.join(home, ".config", "systemd", "user", "tokenrank-collector.service");
    const timerPath = path.join(home, ".config", "systemd", "user", "tokenrank-collector.timer");
    const service = await readFile(servicePath, "utf8");
    const timer = await readFile(timerPath, "utf8");

    expect(install.stdout).toContain("daily at 12:00 and 24:00");
    expect(service).toContain("daemon --once");
    expect(service).toContain("--scheduled");
    expect(service).not.toContain("--interval");
    expect(timer).toContain("OnCalendar=*-*-* 00:00:00");
    expect(timer).toContain("OnCalendar=*-*-* 12:00:00");

    const status = await runCli(["service", "status"], home, linuxEnv);
    expect(status.stdout).toContain("Installed");

    const uninstall = await runCli(["service", "uninstall"], home, linuxEnv);
    expect(uninstall.stdout).toContain("Uninstalled");
    expect(await exists(servicePath)).toBe(false);
    expect(await exists(timerPath)).toBe(false);
  });

  it("installs a hidden Windows task with missed-run and logon recovery", async () => {
    const home = await tempHome();
    const windowsEnv = { TOKENRANK_TEST_PLATFORM: "win32" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, windowsEnv);

    const install = await runCli(["service", "install"], home, windowsEnv);
    const runnerPath = path.join(home, ".tokenrank", "tokenrank-collector.ps1");
    const taskPath = path.join(home, ".tokenrank", "tokenrank-collector.xml");
    const runner = await readFile(runnerPath, "utf8");
    const taskBytes = await readFile(taskPath);
    expect([...taskBytes.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    const task = taskBytes.subarray(2).toString("utf16le");

    expect(install.stdout).toContain("daily at 12:00 and 24:00");
    expect(runner).toContain("daemon --once");
    expect(runner).toContain("--scheduled");
    expect(runner).toContain("tokenrank.mjs");
    expect(runner).toContain("TOKENRANK_NO_ANIMATION");
    expect(runner).not.toContain("tokenrank.cmd");
    expect(task).toContain('<?xml version="1.0" encoding="UTF-16"?>');
    expect(task).toContain("<LogonTrigger>");
    expect(task.match(/<CalendarTrigger>/g)).toHaveLength(2);
    expect(task).toContain("<StartWhenAvailable>true</StartWhenAvailable>");
    expect(task).toContain("<Hidden>true</Hidden>");
    expect(task).toContain("<MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>");
    expect(task).toContain("-NoProfile -NonInteractive -WindowStyle Hidden");

    const status = await runCli(["service", "status"], home, windowsEnv);
    expect(status.stdout).toContain("Installed");

    const uninstall = await runCli(["service", "uninstall"], home, windowsEnv);
    expect(uninstall.stdout).toContain("Uninstalled");
    expect(await exists(runnerPath)).toBe(false);
    expect(await exists(taskPath)).toBe(false);
  });
});
