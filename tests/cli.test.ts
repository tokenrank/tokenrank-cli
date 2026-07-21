import { createServer as createHttpsServer } from "node:https";
import { createServer, type IncomingMessage } from "node:http";
import { createHash } from "node:crypto";
import { connect as connectSocket } from "node:net";
import { access, copyFile, mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

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
const TEST_ACCOUNT_ID = "a".repeat(64);

function respondToIdentityRequest(
  request: IncomingMessage,
  response: import("node:http").ServerResponse,
  accountId = TEST_ACCOUNT_ID,
) {
  if (request.method !== "GET") {
    return false;
  }
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ status: 0, accountId }));
  return true;
}

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

const temporaryHomes = new Set<string>();

afterEach(async () => {
  await Promise.all(
    [...temporaryHomes].map(async (home) => {
      temporaryHomes.delete(home);
      await rm(home, { recursive: true, force: true });
    }),
  );
});

async function tempHome() {
  const home = await mkdtemp(path.join(tmpdir(), "tokenrank-cli-"));
  temporaryHomes.add(home);
  return home;
}

async function runCliFailure(args: string[], home: string, extraEnv: NodeJS.ProcessEnv = {}) {
  try {
    await runCli(args, home, extraEnv);
    throw new Error("expected CLI command to fail");
  } catch (error) {
    return error as Error & { code: number; stdout: string; stderr: string };
  }
}

function testDeviceId(home: string) {
  const digest = createHash("sha256").update(`${hostname()}:${home}`).digest("hex").slice(0, 32);
  return `tokenrank-${digest}`;
}

function testEndpointId(webhookUrl: string) {
  return createHash("sha256").update(new URL(webhookUrl).toString()).digest("hex");
}

async function seedSuccessfulFullState(
  home: string,
  webhookUrl: string,
  overrides: Record<string, unknown> = {},
) {
  const stateDir = path.join(home, ".tokenrank");
  await mkdir(stateDir, { recursive: true });
  await writeFile(
    path.join(stateDir, "aggregate-state.json"),
    `${JSON.stringify(
      {
        accountingVersion: 2,
        deviceId: testDeviceId(home),
        accountId: TEST_ACCOUNT_ID,
        endpointId: testEndpointId(webhookUrl),
        lastFullSyncDate: "2026-06-23",
        aggregates: {},
        cutoverDate: "2026-06-23",
        revision: 1,
        updatedAt: "2026-06-23T08:00:00.000Z",
        ...overrides,
      },
      null,
      2,
    )}\n`,
  );
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
  accountId = TEST_ACCOUNT_ID,
) {
  const server = createServer(async (request, response) => {
    if (respondToIdentityRequest(request, response, accountId)) return;
    const body = await readRequestBody(request);
    const payload = JSON.parse(body) as { entries?: unknown[] };
    await handler(payload);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: 0,
        uploaded: payload.entries?.length ?? 0,
        committed: true,
        revision: 1,
      }),
    );
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
  accountId = TEST_ACCOUNT_ID,
) {
  const server = createServer(async (request, response) => {
    if (respondToIdentityRequest(request, response, accountId)) return;
    const body = await readRequestBody(request);
    const payload = JSON.parse(body) as { entries?: unknown[] };
    await handler(payload, request.url);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: 0,
        uploaded: payload.entries?.length ?? 0,
        committed: true,
        revision: 1,
      }),
    );
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
  accountId = TEST_ACCOUNT_ID,
) {
  const cert = await createSelfSignedCertificate();
  const uploadServer = createHttpsServer(cert, async (request, response) => {
    if (respondToIdentityRequest(request, response, accountId)) return;
    const body = await readRequestBody(request);
    const payload = JSON.parse(body) as { entries?: unknown[] };
    await handler(payload);
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        status: 0,
        uploaded: payload.entries?.length ?? 0,
        committed: true,
        revision: 1,
      }),
    );
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
  callback: (
    webhookUrl: string,
    requestCount: () => number,
    payloads: unknown[],
    identityRequestCount: () => number,
  ) => Promise<T>,
  accountId = TEST_ACCOUNT_ID,
) {
  let requests = 0;
  let identityRequests = 0;
  const payloads: unknown[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET") identityRequests += 1;
    if (respondToIdentityRequest(request, response, accountId)) return;
    const payload = JSON.parse(await readRequestBody(request)) as { entries?: unknown[] };
    payloads.push(payload);
    const status = statuses[Math.min(requests, statuses.length - 1)] ?? 200;
    requests += 1;
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify(
        status >= 200 && status < 300
          ? { status: 0, uploaded: payload.entries?.length ?? 0, committed: true, revision: requests }
          : { status: 1, error: "temporary" },
      ),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    return await callback(
      `http://127.0.0.1:${address.port}/api/collector/upload/test-token`,
      () => requests,
      payloads,
      () => identityRequests,
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

type ScriptedUploadResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: Record<string, unknown>;
  destroySocket?: boolean;
};

async function withScriptedUploadServer<T>(
  script: ScriptedUploadResponse[],
  callback: (
    webhookUrl: string,
    requestCount: () => number,
    payloads: unknown[],
    identityRequestCount: () => number,
  ) => Promise<T>,
  accountId = TEST_ACCOUNT_ID,
) {
  let requests = 0;
  let identityRequests = 0;
  const payloads: unknown[] = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET") identityRequests += 1;
    if (respondToIdentityRequest(request, response, accountId)) return;
    const payload = JSON.parse(await readRequestBody(request)) as { entries?: unknown[] };
    payloads.push(payload);
    const step = script[Math.min(requests, script.length - 1)] ?? {};
    requests += 1;

    if (step.destroySocket) {
      request.socket.destroy();
      return;
    }

    const status = step.status ?? 200;
    response.writeHead(status, {
      "content-type": "application/json",
      ...step.headers,
    });
    response.end(
      JSON.stringify(
        step.body ??
          (status >= 200 && status < 300
            ? { status: 0, uploaded: payload.entries?.length ?? 0, committed: true, revision: requests }
            : { status: 1, error: "temporary" }),
      ),
    );
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("test server did not bind");
    return await callback(
      `http://127.0.0.1:${address.port}/api/collector/upload/test-token`,
      () => requests,
      payloads,
      () => identityRequests,
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

  it("lets --lang override the environment and renders the complete Chinese brand card", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["tools", "--lang", "zh"], home, {
      TOKENRANK_LANG: "en",
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "120",
    });

    expect(stdout).toContain("本地 AI Token 用量采集器");
    expect(stdout).toContain("仅聚合数据");
    expect(stdout).toContain("内容留在本机");
    expect(stdout).toContain("支持的工具");
    expect(stdout).not.toContain("Local AI usage collector");
    expect(stripAnsi(stdout).split("\n").every((line) => terminalDisplayWidth(line) <= 78)).toBe(true);
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

  it("renders the Gum-inspired TokenRank cards in a wide TTY", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["tools"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "120",
    });

    const visibleLines = stripAnsi(stdout).split("\n");

    expect(visibleLines[0]).toMatch(/^╭─ TOKENRANK ─+╮$/);
    expect(stdout).toContain("Local AI usage collector");
    expect(stdout).toContain("AGGREGATES ONLY");
    expect(stdout).toContain("CONTENT STAYS LOCAL");
    expect(stdout).toContain("SUPPORTED TOOLS · 18");
    expect(stdout).toContain("\u001b[38;2;214;255;63m");
    expect(stdout).toContain("\u001b[38;2;255;91;53m");
    expect(stdout).not.toContain("\u001b[48;2;214;255;63m");
    expect(stdout).not.toContain("BURN TOKENS.");
    expect(stdout).not.toContain("ASCEND RANKS.");
    expect(stdout).not.toContain("\u001b[38;5;");
    expect(stdout).not.toMatch(/48;2;(36;255;184|0;218;255|105;48;255|255;37;141)m/);
    expect(stdout).not.toContain("████████╗");
    expect(stdout).toContain("github-copilot");
    expect(visibleLines.every((line) => terminalDisplayWidth(line) <= 78)).toBe(true);
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

      expect(visibleLines.every((line) => terminalDisplayWidth(line) <= columns)).toBe(true);
      expect(stdout).toContain("TOKENRANK");
      expect(stdout).toContain("AGGREGATES ONLY");
      expect(stdout).toContain("CONTENT STAYS LOCAL");
    }
  });

  it("renders aligned branded help without overflowing the terminal", async () => {
    const home = await tempHome();
    const { stdout } = await runCli(["--help"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "78",
    });
    const visibleLines = stripAnsi(stdout).split("\n");

    expect(stdout).toContain("TOKENRANK");
    expect(stdout).toContain("USAGE");
    expect(stdout).toContain("tokenrank <command> [options]");
    expect(stdout).toContain("Preview aggregate usage before upload");
    expect(stdout).toContain("GLOBAL OPTIONS");
    expect(visibleLines.every((line) => terminalDisplayWidth(line) <= 78)).toBe(true);

    const { stdout: narrowStdout } = await runCli(["--help"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "40",
    });
    expect(
      stripAnsi(narrowStdout)
        .split("\n")
        .every((line) => terminalDisplayWidth(line) <= 40),
    ).toBe(true);
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
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "78",
    };
    const webhookUrl = "https://tokenrank.test/api/collector/upload/secret";
    await runCli(["connect", webhookUrl], home, env);
    await runCli(["service", "install"], home, env);
    await seedSuccessfulFullState(home, webhookUrl);
    await writeFile(
      path.join(home, ".tokenrank", "service-state.json"),
      JSON.stringify({
        lastAttemptAt: "2026-07-12T05:00:00.000Z",
        lastSuccessfulAt: "2026-07-12T05:00:00.000Z",
        lastSuccessfulAccountId: TEST_ACCOUNT_ID,
        lastSuccessfulEndpointId: testEndpointId(webhookUrl),
        lastErrorCode: null,
      }),
    );

    const { stdout } = await runCli(["status"], home, env);

    expect(stdout).toContain("HEALTHY");
    expect(stdout).toContain("CONNECTED");
    expect(stdout).toContain("SERVICE INSTALLED");
    expect(stdout).toContain("NEXT BOUNDARY");
    expect(stripAnsi(stdout)).toContain("╭─ GRID STATUS");
    expect(stdout).not.toContain("/secret");
  });

  it("reports stable CONFIGURED, VERIFIED, and HEALTHY JSON states with health exit codes", async () => {
    const home = await tempHome();
    const webhookUrl = "https://tokenrank.test/api/collector/upload/secret";
    await runCli(["connect", webhookUrl], home);

    const configured = await runCliFailure(["status", "--json"], home);
    expect(configured.code).toBe(1);
    expect(JSON.parse(configured.stdout)).toEqual(
      expect.objectContaining({
        status: "CONFIGURED",
        configured: true,
        verified: false,
        healthy: false,
        lastSuccessfulAt: null,
        lastErrorCode: null,
      }),
    );
    expect(configured.stdout).not.toContain("TOKEN/RANK");
    expect(configured.stdout).not.toContain("/secret");

    await seedSuccessfulFullState(home, webhookUrl);

    await writeFile(
      path.join(home, ".tokenrank", "service-state.json"),
      JSON.stringify({
        lastAttemptAt: "2026-07-12T06:00:00.000Z",
        lastSuccessfulAt: "2026-07-12T05:00:00.000Z",
        lastSuccessfulAccountId: TEST_ACCOUNT_ID,
        lastSuccessfulEndpointId: testEndpointId(webhookUrl),
        lastErrorCode: "UPLOAD_FAILED",
      }),
    );
    const verified = await runCliFailure(["status", "--json"], home);
    expect(verified.code).toBe(1);
    expect(JSON.parse(verified.stdout)).toEqual(
      expect.objectContaining({
        status: "VERIFIED",
        configured: true,
        verified: true,
        healthy: false,
        lastSuccessfulAt: "2026-07-12T05:00:00.000Z",
        lastErrorCode: "UPLOAD_FAILED",
      }),
    );

    await writeFile(
      path.join(home, ".tokenrank", "service-state.json"),
      JSON.stringify({
        lastAttemptAt: "2026-07-12T07:00:00.000Z",
        lastSuccessfulAt: "2026-07-12T07:00:00.000Z",
        lastSuccessfulAccountId: TEST_ACCOUNT_ID,
        lastSuccessfulEndpointId: testEndpointId(webhookUrl),
        lastErrorCode: null,
      }),
    );
    const healthy = await runCli(["status", "--json"], home);
    expect(JSON.parse(healthy.stdout)).toEqual(
      expect.objectContaining({
        status: "HEALTHY",
        configured: true,
        verified: true,
        healthy: true,
        lastAttemptAt: "2026-07-12T07:00:00.000Z",
        lastSuccessfulAt: "2026-07-12T07:00:00.000Z",
        lastErrorCode: null,
        nextScheduledAt: expect.any(String),
      }),
    );
  });

  it("diagnoses exact tool sources without exposing local paths", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "doctor-codex-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 9, output_tokens: 3 },
    });

    const { stdout, stderr } = await runCli(["doctor"], home, {
      TOKENRANK_NO_LOGO: "1",
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "78",
    });

    expect(stripAnsi(stdout)).toContain("╭─ SOURCE DIAGNOSTICS");
    expect(stdout).toContain("codex");
    expect(stdout).toContain("READY");
    expect(stdout).toContain("cursor");
    expect(stdout).toContain("EXACT SOURCE REQUIRED");
    expect(stdout).toContain("github-copilot");
    expect(stdout).toContain("continue");
    expect(stdout).not.toContain(home);
    expect(stripAnsi(stderr)).toContain("Diagnosis complete");
    expect(stripAnsi(stderr)).toContain("18 sources");
    expect(stripAnsi(stderr)).toContain("1 files");
    expect(stripAnsi(stderr)).toContain("1 rows");
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

    const { stdout: styledStdout } = await runCli(["sources"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "40",
    });
    const styledPlain = stripAnsi(styledStdout);

    expect(styledPlain).toContain("LOCAL SOURCE ADAPTERS");
    expect(styledPlain).toContain("› ~");
    expect(styledPlain.split("\n").every((line) => terminalDisplayWidth(line) <= 40)).toBe(true);
  });

  it("renders preview as a branded first-run AI usage reveal in a TTY", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "preview-card-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 9, output_tokens: 3 },
    });

    const { stdout, stderr } = await runCli(["preview", "--tool", "codex"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "78",
    });
    const plain = stripAnsi(stdout);

    expect(plain.startsWith("\n")).toBe(true);
    expect(plain).toContain("█████  ███  █  ██ █████ █   █");
    expect(plain).toContain("YOUR AI USAGE, MADE VISIBLE");
    expect(plain).toContain("Local scan · Nothing uploaded");
    expect(plain).toContain("YOUR AI FOOTPRINT");
    expect(plain).toContain("TOTAL TOKENS");
    expect(plain).toContain("ACTIVE DAYS");
    expect(plain).toContain("DAILY ACTIVITY · LAST ACTIVE DAY");
    expect(plain).toContain("AI TOOL BREAKDOWN");
    expect(plain).toContain("TOP MODELS");
    expect(plain).toContain("RECENT ACTIVITY · 1/1");
    expect(plain).toContain("NEXT · CLAIM YOUR RANK");
    expect(plain).toContain("SIGN IN WITH X & CREATE PROFILE");
    expect(plain).toContain("tokenrank.org/onboard");
    expect(plain).toContain("COPY PRIVATE CONNECT COMMAND");
    expect(plain).toContain("tokenrank upload");
    expect(plain).toContain("THIS PREVIEW UPLOADED NOTHING");
    expect(plain).toContain("2026-07-12");
    expect(plain).toContain("codex");
    expect(plain).toContain("gpt-5-codex");
    expect(plain).toContain("12");
    expect(plain.indexOf("YOUR AI USAGE, MADE VISIBLE")).toBeLessThan(
      plain.indexOf("YOUR AI FOOTPRINT"),
    );
    expect(plain.split("\n").every((line) => terminalDisplayWidth(line) <= 78)).toBe(true);
    expect(stripAnsi(stderr)).toContain("Scan complete");
    expect(stripAnsi(stderr)).toContain("1 sources");
    expect(stripAnsi(stderr)).toContain("1 files");
    expect(stripAnsi(stderr)).toContain("1 rows");
  });

  it("summarizes multiple tools, models, dates, and the peak day before recent detail", async () => {
    const home = await tempHome();
    await writeJsonLines(home, sourceFixturePaths.codex, [
      {
        id: "preview-summary-codex-a",
        timestamp: "2026-07-10T05:00:00.000Z",
        model: "gpt-5-codex",
        usage: { input_tokens: 100, output_tokens: 20 },
      },
      {
        id: "preview-summary-codex-b",
        timestamp: "2026-07-12T05:00:00.000Z",
        model: "gpt-5.6-codex",
        usage: { input_tokens: 50, output_tokens: 10 },
      },
    ]);
    await writeJsonLog(home, sourceFixturePaths["claude-code"], {
      timestamp: "2026-07-11T05:00:00.000Z",
      type: "assistant",
      message: {
        model: "claude-sonnet-4",
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 30 },
      },
    });

    const { stdout } = await runCli(["preview"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "78",
    });
    const plain = stripAnsi(stdout);

    expect(plain).toContain("225");
    expect(plain).toMatch(/ACTIVE DAYS\s+3/);
    expect(plain).toMatch(/AI TOOLS\s+2/);
    expect(plain).toMatch(/MODELS\s+3/);
    expect(plain).toContain("2026-07-10 → 2026-07-12");
    expect(plain).toContain("2026-07-10 · 120");
    expect(plain).toContain("DAILY ACTIVITY · LAST 3 ACTIVE DAYS");
    expect(plain).toMatch(/2026-07-12\s+█+\s+60/);
    expect(plain).toMatch(/2026-07-11\s+█+\s+45/);
    expect(plain).toMatch(/2026-07-10\s+█+\s+120/);
    expect(plain).not.toContain("░");
    expect(plain).toContain("codex");
    expect(plain).toContain("claude-code");
    expect(plain).toContain("gpt-5-codex");
    expect(plain).toContain("gpt-5.6-codex");
    expect(plain).toContain("claude-sonnet-4");
    expect(plain.indexOf("YOUR AI FOOTPRINT")).toBeLessThan(
      plain.indexOf("RECENT ACTIVITY"),
    );
  });

  it("keeps the rich preview readable in a narrow colorless terminal", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "preview-narrow-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex-with-a-long-model-name",
      usage: { input_tokens: 9, output_tokens: 3 },
    });

    const { stdout } = await runCli(["preview", "--tool", "codex"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      NO_COLOR: "1",
      COLUMNS: "40",
    });

    expect(stdout).toContain("YOUR AI FOOTPRINT");
    expect(stdout).toContain("NEXT · CLAIM YOUR RANK");
    expect(stdout).toContain("SIGN IN WITH X");
    expect(stdout).not.toContain("\u001b[");
    expect(stdout.split("\n").every((line) => terminalDisplayWidth(line) <= 40)).toBe(true);
  });

  it("changes the preview call to action after a private webhook is connected", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "preview-connected-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 9, output_tokens: 3 },
    });
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home);

    const { stdout } = await runCli(["preview", "--tool", "codex"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      COLUMNS: "78",
    });
    const plain = stripAnsi(stdout);

    expect(plain).toContain("NEXT · UPDATE YOUR RANK");
    expect(plain).toContain("PRIVATE UPLOAD LINK CONNECTED");
    expect(plain).toContain("tokenrank upload");
    expect(plain).toContain("tokenrank.org");
    expect(plain).not.toContain("SIGN IN WITH X");
  });

  it("keeps TTY preview JSON parseable while progress stays on stderr", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "preview-json-progress-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 9, output_tokens: 3 },
    });

    const { stdout, stderr } = await runCli(["preview", "--json", "--tool", "codex"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_ANIMATION: "1",
      NO_COLOR: "1",
      COLUMNS: "78",
    });

    expect(JSON.parse(stdout)).toMatchObject({
      entries: [expect.objectContaining({ tool: "codex", total: 12 })],
    });
    expect(stderr).toContain("Scan complete");
    expect(stderr).not.toContain("\u001b[");
  });

  it("can disable interactive progress without changing preview output", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "preview-no-progress-event",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 4, output_tokens: 2 },
    });

    const { stdout, stderr } = await runCli(["preview", "--json", "--tool", "codex"], home, {
      TOKENRANK_TEST_TTY: "1",
      TOKENRANK_NO_PROGRESS: "1",
    });

    expect(JSON.parse(stdout)).toMatchObject({
      entries: [expect.objectContaining({ tool: "codex", total: 6 })],
    });
    expect(stderr).toBe("");
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

  it("assigns timezone-bearing events to their UTC calendar day", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "utc-boundary-event",
      date: "2026-07-12",
      timestamp: "2026-07-12T00:30:00+08:00",
      model: "gpt-5-codex",
      usage: { input_tokens: 11, output_tokens: 7 },
    });

    const payload = JSON.parse(
      (await runCli(["preview", "--json", "--tool", "codex"], home)).stdout,
    ) as { entries: Array<{ date: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({ date: "2026-07-11", total: 18 }),
    ]);
  });

  it("assigns Unix second and millisecond epochs to UTC dates", async () => {
    const home = await tempHome();
    await writeJsonLines(home, sourceFixturePaths.codex, [
      {
        id: "epoch-seconds",
        timestamp: 1_783_787_400,
        model: "epoch-seconds-model",
        usage: { input_tokens: 2, output_tokens: 1 },
      },
      {
        id: "epoch-millis",
        timestamp: 1_783_787_400_000,
        model: "epoch-millis-model",
        usage: { input_tokens: 3, output_tokens: 1 },
      },
    ]);

    const payload = JSON.parse(
      (await runCli(["preview", "--json", "--tool", "codex"], home)).stdout,
    ) as { entries: Array<{ date: string; model: string }> };
    expect(payload.entries).toEqual([
      expect.objectContaining({ date: "2026-07-11", model: "epoch-millis-model" }),
      expect.objectContaining({ date: "2026-07-11", model: "epoch-seconds-model" }),
    ]);
  });

  it("includes observable Codex parent and subagent model calls exactly once in the total", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/parent.jsonl", {
      id: "parent-call",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 10, output_tokens: 5 },
      total_token_usage: { input_tokens: 9999, output_tokens: 9999 },
    });
    await writeJsonLog(home, ".codex/sessions/subagents/child.jsonl", {
      id: "child-call",
      parent_thread_id: "parent-thread",
      timestamp: "2026-07-12T05:01:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 7, output_tokens: 3 },
    });

    const payload = JSON.parse(
      (await runCli(["preview", "--json", "--tool", "codex"], home)).stdout,
    ) as { entries: Array<{ total: number }> };

    expect(payload.entries).toEqual([expect.objectContaining({ total: 25 })]);
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
        tokenUsage: {
          inputTokens: 9_000,
          outputTokens: 2_000,
          cacheReadTokens: 1_000,
          cacheWriteTokens: 500,
        },
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

  it("uploads long model names in distinct schema-safe stable buckets", async () => {
    const home = await tempHome();
    const sharedPrefix = `provider/${"x".repeat(140)}`;
    await writeJsonLines(home, sourceFixturePaths.codex, [
      {
        id: "long-model-a",
        timestamp: "2026-07-12T04:30:00.000Z",
        model: `${sharedPrefix}-a`,
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      {
        id: "long-model-b",
        timestamp: "2026-07-12T04:31:00.000Z",
        model: `${sharedPrefix}-b`,
        usage: { input_tokens: 2, output_tokens: 1 },
      },
    ]);

    await withSequencedUploadServer([200], async (webhookUrl, requestCount, payloads) => {
      await runCli(["connect", webhookUrl], home);
      await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" });

      expect(requestCount()).toBe(1);
      const entries = (payloads[0] as { entries: Array<{ model: string }> }).entries;
      const models = entries.map((entry) => entry.model);
      expect(models).toHaveLength(2);
      expect(new Set(models).size).toBe(2);
      expect(models.every((model) => model.length <= 120)).toBe(true);
      expect(models.every((model) => model.startsWith("provider/"))).toBe(true);
      expect(models.every((model) => /~[0-9a-f]{16}$/.test(model))).toBe(true);
    });
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

  it(
    "streams large Codex JSONL histories under constrained memory",
    async () => {
      const home = await tempHome();
      const file = path.join(home, ".codex", "sessions", "large-codex.jsonl");
      await mkdir(path.dirname(file), { recursive: true });

      const context = JSON.stringify({
        type: "turn_context",
        payload: { model: "gpt-5.2-codex" },
      });
      const filler = `${JSON.stringify({ type: "noop" })}\n`.repeat(1_500_000);
      const usage = JSON.stringify({
        timestamp: "2026-06-23T08:01:00.000Z",
        type: "response_item",
        payload: { usage: { input_tokens: 10, output_tokens: 5 } },
      });
      await writeFile(file, `${context}\n${filler}${usage}\n`);

      const { stdout } = await runCli(["preview", "--json", "--tool", "codex"], home, {
        NODE_OPTIONS: "--max-old-space-size=32",
      });
      const payload = JSON.parse(stdout) as { entries: Array<{ model: string; total: number }> };

      expect(payload.entries).toEqual([
        expect.objectContaining({ model: "gpt-5.2-codex", total: 15 }),
      ]);
    },
    60_000,
  );

  it("skips oversized or malformed JSONL records and continues across CRLF chunks", async () => {
    const home = await tempHome();
    const file = path.join(home, ".codex", "sessions", "bounded-lines.jsonl");
    await mkdir(path.dirname(file), { recursive: true });

    const context = JSON.stringify({
      type: "turn_context",
      payload: { model: "gpt-5.2-codex" },
    });
    const oversized = JSON.stringify({
      timestamp: "2026-06-23T08:00:00.000Z",
      ignoredPrivateContent: "x".repeat(2_000),
      usage: { input_tokens: 1_000, output_tokens: 500 },
    });
    const usage = JSON.stringify({
      timestamp: "2026-06-23T08:01:00.000Z",
      type: "response_item",
      payload: { usage: { input_tokens: 10, output_tokens: 5 } },
    });
    await writeFile(file, `${context}\r\n${oversized}\r\nnot-json\r\n${usage}`);

    const { stdout } = await runCli(["preview", "--json", "--tool", "codex"], home, {
      TOKENRANK_MAX_JSONL_LINE_BYTES: "512",
    });
    const payload = JSON.parse(stdout) as { entries: Array<{ model: string; total: number }> };

    expect(payload.entries).toEqual([
      expect.objectContaining({ model: "gpt-5.2-codex", total: 15 }),
    ]);
  });

  it(
    "aggregates high-volume Codex usage without retaining every event",
    async () => {
      const home = await tempHome();
      const file = path.join(home, ".codex", "sessions", "high-volume-codex.jsonl");
      await mkdir(path.dirname(file), { recursive: true });

      const usage = `${JSON.stringify({
        timestamp: "2026-06-23T08:01:00.000Z",
        type: "response_item",
        payload: {
          model: "gpt-5.2-codex",
          usage: { input_tokens: 10, output_tokens: 5 },
        },
      })}\n`;
      await writeFile(file, usage.repeat(200_000));

      const { stdout } = await runCli(["preview", "--json", "--tool", "codex"], home);
      const payload = JSON.parse(stdout) as { entries: Array<{ model: string; total: number }> };

      expect(payload.entries).toEqual([
        expect.objectContaining({ model: "gpt-5.2-codex", total: 3_000_000 }),
      ]);
    },
    30_000,
  );

  it("fails safely instead of uploading token totals beyond the safe integer range", async () => {
    const home = await tempHome();
    await writeJsonLines(home, ".codex/sessions/overflow.jsonl", [
      {
        timestamp: "2026-06-23T08:01:00.000Z",
        model: "gpt-5.2-codex",
        usage: { input_tokens: 5_000_000_000_000_000, output_tokens: 0 },
      },
      {
        timestamp: "2026-06-23T08:02:00.000Z",
        model: "gpt-5.2-codex",
        usage: { input_tokens: 5_000_000_000_000_000, output_tokens: 0 },
      },
    ]);

    await expect(runCli(["preview", "--json", "--tool", "codex"], home)).rejects.toMatchObject({
      stderr: expect.stringContaining("safe integer range"),
    });
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
          accountingVersion: 2,
          syncMode: "incremental",
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
        await seedSuccessfulFullState(home, webhookUrl);
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
        await seedSuccessfulFullState(home, webhookUrl);
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
        const webhookUrl = "http://tokenrank.invalid/api/collector/upload/test-token";
        await runCli(["connect", webhookUrl], home);
        await seedSuccessfulFullState(home, webhookUrl);
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
        const webhookUrl = "https://tokenrank.invalid/api/collector/upload/test-token";
        await runCli(["connect", webhookUrl], home);
        await seedSuccessfulFullState(home, webhookUrl);
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
        const { stdout } = await runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-06-23T12:00:00.000Z",
        });

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
        const { stdout } = await runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-06-23T12:00:00.000Z",
        });

        expect(stdout).toMatch(/1 row(?:\r?\n|$)/);
        expect(stdout).toContain("SCAN LOCAL USAGE");
        expect(stdout).toContain("codex");
        expect(stdout).toContain("Uploading");
      },
    );
  });

  it("renders a real upload as compact branded cards without a scan log wall", async () => {
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
        const { stdout, stderr } = await runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-07-12T06:00:00.000Z",
          TOKENRANK_TEST_TTY: "1",
          TOKENRANK_NO_ANIMATION: "1",
          COLUMNS: "96",
        });

        const plain = stripAnsi(stdout);

        expect(stdout).toContain("TOKENRANK");
        expect(stdout).toContain("AGGREGATES ONLY");
        expect(stdout).toContain("UPLOAD ENDPOINT");
        expect(stdout).toContain("CONNECTED");
        expect(stdout).toContain("LOCAL SOURCES");
        expect(stdout).toContain("Codex");
        expect(stdout).toContain("1 files · 1 row");
        expect(stdout).toContain("1 ACTIVE · 17 SKIPPED");
        expect(stdout).toContain("SKIPPED");
        expect(stdout).toContain("PRIVATE CONTENT NEVER LEAVES THIS MACHINE");
        expect(stdout).toContain("UPLOAD COMPLETE");
        expect(plain).not.toContain("Scanning Codex");
        expect(plain).not.toContain("scope: all tools");
        expect(plain).not.toContain("Build payload");
        expect(plain).not.toContain("batch 1/1");
        expect(plain.split("\n").every((line) => terminalDisplayWidth(line) <= 78)).toBe(true);
        expect(stdout).not.toContain("BOOTING TOKEN GRID");
        expect(stdout).not.toContain("GRID SYNCHRONIZED");
        expect(stdout).not.toMatch(/48;2;(105;48;255|255;37;141)m/);
        expect(stripAnsi(stderr)).toContain("Scan complete");
        expect(stripAnsi(stderr)).toContain("Upload complete");
        expect(stripAnsi(stderr)).toContain("1 row");
        expect(stripAnsi(stderr)).toContain("1 batches");
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

  it("scans stale-mtime files before filtering by UTC event date and keeps high-water rows", async () => {
    const home = await tempHome();
    const relativeFile = sourceFixturePaths.codex;
    const steadyFile = ".codex/sessions/steady-contribution.json";
    await writeJsonLog(home, relativeFile, {
      id: "high-water-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });
    await writeJsonLog(home, steadyFile, {
      id: "steady-event",
      timestamp: "2026-07-12T04:45:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });
    const staleMtime = new Date("2026-07-01T00:00:00.000Z");
    await utimes(path.join(home, steadyFile), staleMtime, staleMtime);

    await withSequencedUploadServer([200], async (
      webhookUrl,
      requestCount,
      payloads,
      identityRequestCount,
    ) => {
      await runCli(["connect", webhookUrl], home);
      const firstClock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" };
      await runCli(["upload"], home, firstClock);

      const first = payloads[0] as {
        accountingVersion: number;
        syncMode: string;
        snapshotId: string;
        batchIndex: number;
        batchCount: number;
        batchHash: string;
        entries: unknown[];
      };
      expect(first).toMatchObject({
        accountingVersion: 2,
        syncMode: "full",
        snapshotId: expect.stringMatching(/^[a-f0-9-]{36}$/),
        cutoverDate: "2026-07-12",
        batchIndex: 0,
        batchCount: 1,
        batchHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        entries: [expect.objectContaining({ total: 24 })],
      });
      expect(first.batchHash).toBe(
        createHash("sha256").update(JSON.stringify(first.entries)).digest("hex"),
      );

      await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T06:00:00.000Z" });
      expect(requestCount()).toBe(1);
      expect(identityRequestCount()).toBe(1);

      await writeJsonLog(home, relativeFile, {
        id: "high-water-event",
        timestamp: "2026-07-12T04:30:00.000Z",
        model: "gpt-5-codex",
        usage: { input_tokens: 10, output_tokens: 5 },
      });
      await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T07:00:00.000Z" });
      expect(payloads[1]).toMatchObject({
        accountingVersion: 2,
        syncMode: "incremental",
        entries: [expect.objectContaining({ total: 27 })],
      });

      await writeJsonLog(home, relativeFile, {
        id: "high-water-event",
        timestamp: "2026-07-12T04:30:00.000Z",
        model: "gpt-5-codex",
        usage: { input_tokens: 3, output_tokens: 2 },
      });
      await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T07:30:00.000Z" });
      expect(requestCount()).toBe(2);

      await writeJsonLines(home, relativeFile, []);
      await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T08:00:00.000Z" });
      expect(requestCount()).toBe(2);

      await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-13T00:01:00.000Z" });
      expect(payloads[2]).toMatchObject({
        syncMode: "full",
        cutoverDate: "2026-07-12",
        batchIndex: 0,
        batchCount: 1,
        entries: [expect.objectContaining({ total: 27 })],
      });
      expect(requestCount()).toBe(3);
    });
  });

  it("preserves device cutover and high-water aggregates when the webhook token rotates", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "rotation-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withUploadServer(
      (payload) => {
        expect(payload).toMatchObject({
          syncMode: "full",
          cutoverDate: "2026-07-12",
          entries: [expect.objectContaining({ total: 12 })],
        });
      },
      async (firstWebhookUrl) => {
        await runCli(["connect", firstWebhookUrl], home);
        await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" });

        await withUploadServer(
          (payload) => {
            expect(payload).toMatchObject({
              syncMode: "full",
              cutoverDate: "2026-07-12",
              entries: [expect.objectContaining({ total: 12 })],
            });
          },
          async (rotatedWebhookUrl) => {
            await runCli(["connect", rotatedWebhookUrl], home);
            await runCli(["upload"], home, {
              TOKENRANK_NOW: "2026-07-13T05:00:00.000Z",
            });

            const state = JSON.parse(
              await readFile(path.join(home, ".tokenrank", "aggregate-state.json"), "utf8"),
            ) as {
              endpointId: string;
              cutoverDate: string;
              aggregates: Record<string, { total: number }>;
            };
            expect(state.endpointId).toBe(testEndpointId(rotatedWebhookUrl));
            expect(state.cutoverDate).toBe("2026-07-12");
            expect(Object.values(state.aggregates)).toEqual([
              expect.objectContaining({ total: 12 }),
            ]);
          },
        );
      },
    );
  });

  it("finishes an active full snapshot immediately after a same-account token rotation", async () => {
    const home = await tempHome();
    const sourcePath = ".codex/sessions/rotation-active.json";
    const originalEvents = Array.from({ length: 501 }, (_, index) => ({
      id: `rotation-active-${index}`,
      timestamp: "2026-07-12T05:00:00.000Z",
      model: `rotation-active-${String(index).padStart(3, "0")}`,
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const addedEvent = {
      id: "rotation-active-added",
      timestamp: "2026-07-12T05:30:00.000Z",
      model: "rotation-active-added",
      usage: { input_tokens: 3, output_tokens: 2 },
    };
    await writeJsonLog(home, sourcePath, originalEvents);

    const activeConflict: ScriptedUploadResponse = {
      status: 409,
      body: {
        status: -1,
        error: "ACTIVE_SNAPSHOT_CONFLICT",
        activeSnapshotId: "00000000-0000-4000-8000-000000000000",
        expectedCutoverDate: "2026-07-12",
        revision: 1,
      },
    };
    await withScriptedUploadServer(
      [
        { status: 200, body: { status: 0, uploaded: 500, committed: false, revision: 1 } },
        { status: 400, body: { status: -1, error: "stop-after-first-batch" } },
        activeConflict,
        { status: 200, body: { status: 0, uploaded: 500, committed: false, revision: 1 } },
        { status: 200, body: { status: 0, uploaded: 1, committed: true, revision: 1 } },
        { status: 200, body: { status: 0, uploaded: 500, committed: false, revision: 2 } },
        { status: 200, body: { status: 0, uploaded: 2, committed: true, revision: 2 } },
      ],
      async (webhookUrl, requestCount, payloads, identityRequestCount) => {
        const clock = { TOKENRANK_NOW: "2026-07-12T06:00:00.000Z" };
        await runCli(["connect", webhookUrl], home);
        await expect(runCli(["upload"], home, clock)).rejects.toMatchObject({
          stderr: expect.stringContaining("stop-after-first-batch"),
        });
        const originalPending = JSON.parse(
          await readFile(path.join(home, ".tokenrank", "pending-snapshot.json"), "utf8"),
        ) as { snapshotId: string };
        activeConflict.body!.activeSnapshotId = originalPending.snapshotId;

        await writeJsonLog(home, sourcePath, [...originalEvents, addedEvent]);
        const rotatedWebhookUrl = webhookUrl.replace("test-token", "rotated-token");
        await runCli(["connect", rotatedWebhookUrl], home);
        await runCli(["upload"], home, clock);

        expect(requestCount()).toBe(7);
        expect(identityRequestCount()).toBe(2);
        const originalFirst = payloads[0] as {
          snapshotId: string;
          batchHash: string;
          entries: unknown[];
        };
        const originalSecond = payloads[1] as typeof originalFirst;
        const replayFirst = payloads[3] as typeof originalFirst;
        const replaySecond = payloads[4] as typeof originalFirst;
        expect(replayFirst.snapshotId).toBe(originalFirst.snapshotId);
        expect(replaySecond.snapshotId).toBe(originalSecond.snapshotId);
        expect(replayFirst.batchHash).toBe(originalFirst.batchHash);
        expect(replaySecond.batchHash).toBe(originalSecond.batchHash);
        expect(replayFirst.entries).toEqual(originalFirst.entries);
        expect(replaySecond.entries).toEqual(originalSecond.entries);

        const deferredCandidate = payloads[2] as typeof originalFirst;
        expect((payloads[5] as typeof originalFirst).snapshotId).toBe(
          deferredCandidate.snapshotId,
        );
        expect((payloads[6] as typeof originalFirst).snapshotId).toBe(
          deferredCandidate.snapshotId,
        );
        expect(JSON.stringify(payloads.slice(5, 7))).toContain(addedEvent.model);
        expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(false);

        const state = JSON.parse(
          await readFile(path.join(home, ".tokenrank", "aggregate-state.json"), "utf8"),
        ) as {
          accountId: string;
          endpointId: string;
          aggregates: Record<string, unknown>;
        };
        expect(state.accountId).toBe(TEST_ACCOUNT_ID);
        expect(state.endpointId).toBe(testEndpointId(rotatedWebhookUrl));
        expect(Object.keys(state.aggregates)).toHaveLength(502);
      },
    );
  });

  it("resets local high-water state and health when connecting a different account", async () => {
    const home = await tempHome();
    const firstAccountId = "a".repeat(64);
    const secondAccountId = "b".repeat(64);
    await writeJsonLog(home, ".codex/sessions/account-switch.json", [
      {
        id: "account-a-event",
        timestamp: "2026-07-12T05:00:00.000Z",
        model: "account-a-model",
        usage: { input_tokens: 5, output_tokens: 1 },
      },
    ]);

    await withSequencedUploadServer(
      [200],
      async (firstWebhookUrl) => {
        await runCli(["connect", firstWebhookUrl], home);
        await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T06:00:00.000Z" });

        await writeJsonLog(home, ".codex/sessions/account-switch.json", [
          {
            id: "account-a-event",
            timestamp: "2026-07-12T05:00:00.000Z",
            model: "account-a-model",
            usage: { input_tokens: 5, output_tokens: 1 },
          },
          {
            id: "account-b-event",
            timestamp: "2026-07-13T05:00:00.000Z",
            model: "account-b-model",
            usage: { input_tokens: 2, output_tokens: 1 },
          },
        ]);

        await withSequencedUploadServer(
          [200],
          async (secondWebhookUrl, requestCount, payloads) => {
            await runCli(["connect", secondWebhookUrl], home);
            const beforeUpload = await runCliFailure(["status", "--json"], home);
            expect(JSON.parse(beforeUpload.stdout)).toMatchObject({
              status: "CONFIGURED",
              verified: false,
              healthy: false,
            });

            await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-13T06:00:00.000Z" });
            expect(requestCount()).toBe(1);
            expect(payloads[0]).toMatchObject({
              syncMode: "full",
              cutoverDate: "2026-07-13",
              entries: [expect.objectContaining({ model: "account-b-model" })],
            });
            expect(JSON.stringify(payloads[0])).not.toContain("account-a-model");

            const state = JSON.parse(
              await readFile(path.join(home, ".tokenrank", "aggregate-state.json"), "utf8"),
            ) as { accountId: string; cutoverDate: string };
            expect(state.accountId).toBe(secondAccountId);
            expect(state.cutoverDate).toBe("2026-07-13");
          },
          secondAccountId,
        );
      },
      firstAccountId,
    );
  });

  it("requires a successful full sync for the current endpoint before filtered uploads", async () => {
    const home = await tempHome();
    const usagePath = path.join(home, "usage.json");
    await writeFile(
      usagePath,
      JSON.stringify({
        entries: [
          {
            date: "2026-07-12",
            tool: "codex",
            model: "gpt-5-codex",
            input: 1,
            output: 1,
            cacheRead: 0,
            cacheWrite: 0,
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
        for (const args of [
          ["upload", "--file", usagePath],
          ["upload", "--tool", "codex"],
          ["upload", "--since", "2026-07-12"],
        ]) {
          await expect(runCli(args, home)).rejects.toMatchObject({
            stderr: expect.stringContaining("Run `tokenrank upload` once"),
          });
        }
      },
    );
    expect(requested).toBe(false);
  });

  it("ignores corrupt aggregate rows instead of trusting unsafe high-water state", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "safe-event",
      timestamp: "2026-07-13T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 2, output_tokens: 1 },
    });

    await withUploadServer(
      (payload) => {
        expect(payload).toMatchObject({
          syncMode: "full",
          cutoverDate: "2026-07-13",
          entries: [expect.objectContaining({ total: 3 })],
        });
      },
      async (webhookUrl) => {
        const invalidRow = {
          date: "2026-07-12",
          tool: "codex",
          model: "corrupt",
          input: Number.MAX_SAFE_INTEGER + 1,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: Number.MAX_SAFE_INTEGER + 1,
        };
        await runCli(["connect", webhookUrl], home);
        await seedSuccessfulFullState(home, webhookUrl, {
          aggregates: { '["wrong-key"]': invalidRow },
        });
        await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-13T05:00:00.000Z" });
      },
    );
  });

  it("replaces an invalid pending snapshot hash and UUID before a full retry", async () => {
    const home = await tempHome();
    const aggregate = {
      date: "2026-07-12",
      tool: "codex",
      model: "gpt-5-codex",
      input: 2,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      total: 3,
    };

    await withUploadServer(
      (payload) => {
        expect(payload).toMatchObject({
          syncMode: "full",
          snapshotId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          entries: [aggregate],
        });
        expect((payload as { snapshotId: string }).snapshotId).not.toBe("not-a-uuid");
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        await seedSuccessfulFullState(home, webhookUrl, {
          aggregates: { [JSON.stringify([aggregate.date, aggregate.tool, aggregate.model])]: aggregate },
        });
        await writeFile(
          path.join(home, ".tokenrank", "pending-snapshot.json"),
          JSON.stringify({
            accountingVersion: 2,
            endpointId: "not-a-hash",
            snapshotDigest: "also-not-a-hash",
            snapshotId: "not-a-uuid",
            createdAt: "not-a-timestamp",
          }),
        );
        await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-13T05:00:00.000Z" });
        expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(false);
      },
    );
  });

  it("keeps one stable snapshot id and a verified hash across full snapshot batches", async () => {
    const home = await tempHome();
    await writeJsonLog(
      home,
      ".codex/sessions/full-batches.json",
      Array.from({ length: 501 }, (_, index) => ({
        id: `full-batch-${index}`,
        timestamp: "2026-07-12T05:00:00.000Z",
        model: `gpt-test-${index}`,
        usage: { input_tokens: 1, output_tokens: 1 },
      })),
    );

    await withSequencedUploadServer([200], async (webhookUrl, requestCount, payloads) => {
      await runCli(["connect", webhookUrl], home);
      await runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T06:00:00.000Z" });

      expect(requestCount()).toBe(2);
      const batches = payloads as Array<{
        snapshotId: string;
        batchIndex: number;
        batchCount: number;
        batchHash: string;
        entries: unknown[];
      }>;
      expect(batches.map((batch) => batch.entries.length)).toEqual([500, 1]);
      expect(new Set(batches.map((batch) => batch.snapshotId)).size).toBe(1);
      expect(batches.map((batch) => batch.batchIndex)).toEqual([0, 1]);
      expect(batches.every((batch) => batch.batchCount === 2)).toBe(true);
      for (const batch of batches) {
        expect(batch.batchHash).toBe(
          createHash("sha256").update(JSON.stringify(batch.entries)).digest("hex"),
        );
      }
    });
  });

  it("does not persist aggregate state when a later full snapshot batch fails", async () => {
    const home = await tempHome();
    await writeJsonLog(
      home,
      ".codex/sessions/full-retry.json",
      Array.from({ length: 501 }, (_, index) => ({
        id: `retry-full-${index}`,
        timestamp: "2026-07-12T05:00:00.000Z",
        model: `retry-model-${index}`,
        usage: { input_tokens: 1, output_tokens: 1 },
      })),
    );

    await withSequencedUploadServer([200, 400, 200, 200], async (webhookUrl, requestCount, payloads) => {
      await runCli(["connect", webhookUrl], home);
      const env = { TOKENRANK_NOW: "2026-07-12T06:00:00.000Z", TOKENRANK_RETRY_BASE_MS: "1" };
      await expect(runCli(["upload"], home, env)).rejects.toMatchObject({
        stderr: expect.stringContaining("temporary"),
      });
      expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);

      await runCli(["upload"], home, env);
      expect(requestCount()).toBe(4);
      expect((payloads[0] as { snapshotId: string }).snapshotId).toBe(
        (payloads[2] as { snapshotId: string }).snapshotId,
      );
      expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(true);
    });
  });

  it("replays the exact pending full snapshot before sending usage added after the failure", async () => {
    const home = await tempHome();
    const sourcePath = ".codex/sessions/pending-replay.json";
    const originalEvents = Array.from({ length: 501 }, (_, index) => ({
      id: `pending-replay-${index}`,
      timestamp: "2026-07-12T05:00:00.000Z",
      model: `pending-model-${String(index).padStart(3, "0")}`,
      usage: { input_tokens: 1, output_tokens: 1 },
    }));
    const addedEvent = {
      id: "pending-replay-added",
      timestamp: "2026-07-13T05:30:00.000Z",
      model: "pending-model-added",
      usage: { input_tokens: 3, output_tokens: 2 },
    };
    await writeJsonLog(home, sourcePath, originalEvents);

    await withScriptedUploadServer(
      [
        { status: 200, body: { status: 0, uploaded: 500, committed: false, revision: 1 } },
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 200, body: { status: 0, uploaded: 500, committed: false, revision: 1 } },
        { status: 200, body: { status: 0, uploaded: 1, committed: true, revision: 1 } },
        { status: 200, body: { status: 0, uploaded: 1, committed: true, revision: 2 } },
      ],
      async (webhookUrl, requestCount, payloads) => {
        const initialEnv = {
          TOKENRANK_NOW: "2026-07-12T06:00:00.000Z",
          TOKENRANK_RETRY_BASE_MS: "1",
          TOKENRANK_TEST_NO_RETRY_JITTER: "1",
        };
        const retryEnv = {
          ...initialEnv,
          TOKENRANK_NOW: "2026-07-13T06:00:00.000Z",
        };
        await runCli(["connect", webhookUrl], home);
        await expect(runCli(["upload"], home, initialEnv)).rejects.toMatchObject({
          stderr: expect.stringContaining("temporary"),
        });
        expect(requestCount()).toBe(5);
        expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);

        const pending = JSON.parse(
          await readFile(path.join(home, ".tokenrank", "pending-snapshot.json"), "utf8"),
        ) as {
          snapshotId: string;
          snapshotDigest: string;
          batchSize: number;
          entries: unknown[];
        };
        expect(pending).toMatchObject({
          snapshotId: expect.stringMatching(/^[0-9a-f-]{36}$/),
          snapshotDigest: expect.stringMatching(/^[0-9a-f]{64}$/),
          batchSize: 500,
        });
        expect(pending.entries).toHaveLength(501);

        await writeJsonLog(home, sourcePath, [...originalEvents, addedEvent]);
        await runCli(["upload"], home, retryEnv);
        expect(requestCount()).toBe(7);

        type FullBatch = {
          snapshotId: string;
          batchHash: string;
          entries: unknown[];
        };
        const originalFirst = payloads[0] as FullBatch;
        const originalSecond = payloads[1] as FullBatch;
        const replayFirst = payloads[5] as FullBatch;
        const replaySecond = payloads[6] as FullBatch;
        expect(replayFirst.snapshotId).toBe(originalFirst.snapshotId);
        expect(replaySecond.snapshotId).toBe(originalSecond.snapshotId);
        expect(replayFirst.batchHash).toBe(originalFirst.batchHash);
        expect(replaySecond.batchHash).toBe(originalSecond.batchHash);
        expect(replayFirst.entries).toEqual(originalFirst.entries);
        expect(replaySecond.entries).toEqual(originalSecond.entries);
        expect(JSON.stringify([...replayFirst.entries, ...replaySecond.entries])).not.toContain(
          addedEvent.model,
        );

        const committedState = JSON.parse(
          await readFile(path.join(home, ".tokenrank", "aggregate-state.json"), "utf8"),
        ) as { aggregates: Record<string, unknown> };
        expect(Object.keys(committedState.aggregates)).toHaveLength(501);

        await runCli(["upload"], home, retryEnv);
        expect(requestCount()).toBe(8);
        expect(payloads[7]).toMatchObject({
          syncMode: "incremental",
          entries: [expect.objectContaining({ model: addedEvent.model, input: 3, output: 2, total: 5 })],
        });
        expect(payloads[7]).not.toHaveProperty("snapshotId");
      },
    );
  });

  it.each(["deleted", "corrupt"] as const)(
    "recovers the canonical cutover after local aggregate state is %s",
    async (stateCondition) => {
      const home = await tempHome();
      await writeJsonLog(home, ".codex/sessions/cutover-recovery.json", [
        {
          id: "cutover-recovery-old",
          timestamp: "2026-07-12T05:00:00.000Z",
          model: "cutover-old",
          usage: { input_tokens: 5, output_tokens: 1 },
        },
        {
          id: "cutover-recovery-new",
          timestamp: "2026-07-16T05:00:00.000Z",
          model: "cutover-new",
          usage: { input_tokens: 2, output_tokens: 1 },
        },
      ]);

      await withScriptedUploadServer(
        [
          {
            status: 409,
            body: {
              status: -1,
              error: "CUTOVER_DATE_CONFLICT",
              expectedCutoverDate: "2026-07-12",
              revision: 7,
            },
          },
          { status: 200, body: { status: 0, uploaded: 2, committed: true, revision: 8 } },
        ],
        async (webhookUrl, requestCount, payloads) => {
          await runCli(["connect", webhookUrl], home);
          await seedSuccessfulFullState(home, webhookUrl);
          const aggregateState = path.join(home, ".tokenrank", "aggregate-state.json");
          if (stateCondition === "deleted") {
            await rm(aggregateState, { force: true });
          } else {
            await writeFile(aggregateState, "{not valid json");
          }

          await runCli(["upload"], home, {
            TOKENRANK_NOW: "2026-07-16T06:00:00.000Z",
          });

          expect(requestCount()).toBe(2);
          expect(payloads[0]).toMatchObject({
            syncMode: "full",
            cutoverDate: "2026-07-16",
            entries: [expect.objectContaining({ model: "cutover-new" })],
          });
          expect(payloads[1]).toMatchObject({
            syncMode: "full",
            cutoverDate: "2026-07-12",
            entries: [
              expect.objectContaining({ model: "cutover-old" }),
              expect.objectContaining({ model: "cutover-new" }),
            ],
          });
          expect((payloads[1] as { snapshotId: string }).snapshotId).not.toBe(
            (payloads[0] as { snapshotId: string }).snapshotId,
          );

          const state = JSON.parse(await readFile(aggregateState, "utf8")) as {
            cutoverDate: string;
            revision: number;
            aggregates: Record<string, unknown>;
          };
          expect(state.cutoverDate).toBe("2026-07-12");
          expect(state.revision).toBe(8);
          expect(Object.keys(state.aggregates)).toHaveLength(2);
          expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(false);
        },
      );
    },
  );

  it("accepts a server-authoritative cutover one UTC day ahead of the client clock", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/clock-skew-cutover.json", {
      id: "clock-skew-cutover",
      timestamp: "2026-07-17T05:00:00.000Z",
      model: "clock-skew-cutover",
      usage: { input_tokens: 2, output_tokens: 1 },
    });

    await withScriptedUploadServer(
      [
        {
          status: 409,
          body: {
            status: -1,
            error: "CUTOVER_DATE_CONFLICT",
            expectedCutoverDate: "2026-07-17",
            revision: 4,
          },
        },
        { status: 200, body: { status: 0, uploaded: 1, committed: true, revision: 5 } },
      ],
      async (webhookUrl, requestCount, payloads) => {
        await runCli(["connect", webhookUrl], home);
        await runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-07-16T23:30:00.000Z",
        });
        expect(requestCount()).toBe(2);
        expect(payloads[1]).toMatchObject({
          cutoverDate: "2026-07-17",
          entries: [expect.objectContaining({ model: "clock-skew-cutover" })],
        });
        const state = JSON.parse(
          await readFile(path.join(home, ".tokenrank", "aggregate-state.json"), "utf8"),
        ) as { cutoverDate: string; lastFullSyncDate: string };
        expect(state.cutoverDate).toBe("2026-07-17");
        expect(state.lastFullSyncDate).toBe("2026-07-17");
      },
    );
  });

  it("limits cutover conflict recovery to one rescan per command", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/cutover-loop.json", [
      {
        id: "cutover-loop-old",
        timestamp: "2026-07-12T05:00:00.000Z",
        model: "cutover-loop-old",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      {
        id: "cutover-loop-new",
        timestamp: "2026-07-16T05:00:00.000Z",
        model: "cutover-loop-new",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ]);

    await withScriptedUploadServer(
      [
        {
          status: 409,
          body: {
            status: -1,
            error: "CUTOVER_DATE_CONFLICT",
            expectedCutoverDate: "2026-07-12",
            revision: 7,
          },
        },
        {
          status: 409,
          body: {
            status: -1,
            error: "CUTOVER_DATE_CONFLICT",
            expectedCutoverDate: "2026-07-11",
            revision: 7,
          },
        },
        { status: 200 },
      ],
      async (webhookUrl, requestCount) => {
        await runCli(["connect", webhookUrl], home);
        await expect(
          runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-16T06:00:00.000Z" }),
        ).rejects.toMatchObject({ stderr: expect.stringContaining("CUTOVER_DATE_CONFLICT") });
        expect(requestCount()).toBe(2);
        expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);
        const pending = JSON.parse(
          await readFile(path.join(home, ".tokenrank", "pending-snapshot.json"), "utf8"),
        ) as { cutoverDate: string };
        expect(pending.cutoverDate).toBe("2026-07-12");
      },
    );
  });

  it("does not trust a malformed cutover conflict envelope", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "malformed-cutover-conflict",
      timestamp: "2026-07-16T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await withScriptedUploadServer(
      [
        {
          status: 409,
          body: {
            status: -1,
            error: "CUTOVER_DATE_CONFLICT",
            expectedCutoverDate: "2026-07-12",
            revision: "7",
          },
        },
        { status: 200 },
      ],
      async (webhookUrl, requestCount) => {
        await runCli(["connect", webhookUrl], home);
        await expect(
          runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-16T06:00:00.000Z" }),
        ).rejects.toMatchObject({ stderr: expect.stringContaining("CUTOVER_DATE_CONFLICT") });
        expect(requestCount()).toBe(1);
      },
    );
  });

  it("refuses the initial UTC cutover when a recent source was skipped as oversized", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/oversized.json", {
      id: "oversized-cutover",
      timestamp: "2026-07-12T05:00:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await withSequencedUploadServer([200], async (webhookUrl, requestCount) => {
      await runCli(["connect", webhookUrl], home);
      await expect(
        runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-07-12T06:00:00.000Z",
          TOKENRANK_MAX_JSON_DOCUMENT_BYTES: "10",
        }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("cutover scan was incomplete") });
      expect(requestCount()).toBe(0);
      expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);
    });
  });

  it("fails closed on the source file cap without advancing established state", async () => {
    const home = await tempHome();
    await writeJsonLog(home, ".codex/sessions/cap-a.json", {
      id: "cap-a",
      timestamp: "2026-07-12T04:00:00.000Z",
      model: "cap-a",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await writeJsonLog(home, ".codex/sessions/cap-b.json", {
      id: "cap-b",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "cap-b",
      usage: { input_tokens: 1, output_tokens: 1 },
    });

    await withSequencedUploadServer(
      [200],
      async (webhookUrl, requestCount, _payloads, identityRequestCount) => {
        await runCli(["connect", webhookUrl], home);
        await seedSuccessfulFullState(home, webhookUrl, {
          cutoverDate: "2026-07-12",
          lastFullSyncDate: "2026-07-12",
        });
        const statePath = path.join(home, ".tokenrank", "aggregate-state.json");
        const before = await readFile(statePath, "utf8");
        await expect(
          runCli(["upload"], home, {
            TOKENRANK_NOW: "2026-07-12T06:00:00.000Z",
            TOKENRANK_MAX_SOURCE_FILES: "1",
          }),
        ).rejects.toMatchObject({ stderr: expect.stringContaining("scan was incomplete") });
        expect(requestCount()).toBe(0);
        expect(identityRequestCount()).toBe(0);
        expect(await readFile(statePath, "utf8")).toBe(before);
      },
    );
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
      const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z", TOKENRANK_SCHEDULE_MINUTE: "0" };
      await runCli(["connect", webhookUrl], home);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(1);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string; lastSuccessfulAt: string };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T05:00:00.000Z");
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
      const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z", TOKENRANK_SCHEDULE_MINUTE: "0" };
      await runCli(["connect", webhookUrl], home);
      await runCli(["upload"], home, clock);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(1);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T05:00:00.000Z");
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
      const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z", TOKENRANK_SCHEDULE_MINUTE: "0" };
      await runCli(["connect", webhookUrl], home);
      await seedSuccessfulFullState(home, webhookUrl);
      await runCli(["upload", "--tool", "codex"], home, clock);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(2);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T05:00:00.000Z");
    });
  });

  it("retries retryable server failures within the same scheduled boundary", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "retry-codex-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withSequencedUploadServer([500, 200], async (webhookUrl, requestCount) => {
      const clock = {
        TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
        TOKENRANK_SCHEDULE_MINUTE: "0",
        TOKENRANK_RETRY_BASE_MS: "1",
        TOKENRANK_TEST_NO_RETRY_JITTER: "1",
      };
      await runCli(["connect", webhookUrl], home);
      await runCli(["daemon", "--once", "--scheduled"], home, clock);

      expect(requestCount()).toBe(2);
      const state = JSON.parse(
        await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
      ) as { lastScheduledBoundary: string; lastErrorCode: string | null };
      expect(state.lastScheduledBoundary).toBe("2026-07-12T05:00:00.000Z");
      expect(state.lastErrorCode).toBeNull();
    });
  });

  it("retries 408, 429 Retry-After, and a network disconnect before succeeding", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "mixed-retry-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withScriptedUploadServer(
      [
        { status: 408 },
        { status: 429, headers: { "retry-after": "0" } },
        { destroySocket: true },
        { status: 200 },
      ],
      async (webhookUrl, requestCount) => {
        await runCli(["connect", webhookUrl], home);
        await runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
          TOKENRANK_RETRY_BASE_MS: "1",
          TOKENRANK_TEST_NO_RETRY_JITTER: "1",
        });
        expect(requestCount()).toBe(4);
        expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(true);
      },
    );
  });

  it("applies an absolute deadline to every direct upload attempt", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "deadline-direct",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "deadline-direct",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    let uploadRequests = 0;
    const server = createServer((request, response) => {
      if (respondToIdentityRequest(request, response)) return;
      uploadRequests += 1;
      request.resume();
      // Intentionally never send response headers or a body.
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("deadline server did not bind");
      const webhookUrl = `http://127.0.0.1:${address.port}/api/collector/upload/test-token`;
      await runCli(["connect", webhookUrl], home);
      await expect(
        runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
          TOKENRANK_REQUEST_TIMEOUT_MS: "100",
          TOKENRANK_RETRY_BASE_MS: "1",
          TOKENRANK_TEST_NO_RETRY_JITTER: "1",
        }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("deadline") });
      expect(uploadRequests).toBe(4);
      expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(true);
      expect(await exists(path.join(home, ".tokenrank", "collector.lock"))).toBe(false);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("applies the same absolute deadline through an HTTP proxy", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "deadline-proxy",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "deadline-proxy",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    let uploadRequests = 0;
    const proxy = createServer((request, response) => {
      if (respondToIdentityRequest(request, response)) return;
      uploadRequests += 1;
      request.resume();
      // Keep the proxied POST open until the client aborts at its absolute deadline.
    });
    await new Promise<void>((resolve) => proxy.listen(0, "127.0.0.1", resolve));
    try {
      const address = proxy.address();
      if (!address || typeof address === "string") throw new Error("deadline proxy did not bind");
      await runCli(
        ["connect", "http://tokenrank.invalid/api/collector/upload/test-token"],
        home,
      );
      await expect(
        runCli(["upload"], home, {
          TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
          TOKENRANK_PROXY: `http://127.0.0.1:${address.port}`,
          TOKENRANK_HTTP_PROXY: `http://127.0.0.1:${address.port}`,
          TOKENRANK_DISABLE_SYSTEM_PROXY: "1",
          TOKENRANK_REQUEST_TIMEOUT_MS: "100",
          TOKENRANK_RETRY_BASE_MS: "1",
          TOKENRANK_TEST_NO_RETRY_JITTER: "1",
        }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("deadline") });
      expect(uploadRequests).toBe(4);
    } finally {
      proxy.closeAllConnections();
      await new Promise<void>((resolve) => proxy.close(() => resolve()));
    }
  });

  it("keeps the pending snapshot and leaves aggregate state untouched after retry exhaustion", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "exhausted-retry-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withScriptedUploadServer(
      [{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }],
      async (webhookUrl, requestCount) => {
        await runCli(["connect", webhookUrl], home);
        await expect(
          runCli(["upload"], home, {
            TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
            TOKENRANK_RETRY_BASE_MS: "1",
            TOKENRANK_TEST_NO_RETRY_JITTER: "1",
          }),
        ).rejects.toMatchObject({ stderr: expect.stringContaining("temporary") });
        expect(requestCount()).toBe(4);
        expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);
        expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(true);
      },
    );
  });

  it("replays incremental WAL after retry exhaustion even when the source file disappears", async () => {
    const home = await tempHome();
    const sourcePath = ".codex/sessions/incremental-wal.json";
    const previous = {
      date: "2026-07-12",
      tool: "codex",
      model: "incremental-wal-model",
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      total: 2,
    };
    await writeJsonLog(home, sourcePath, {
      id: "incremental-wal-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: previous.model,
      usage: { input_tokens: 3, output_tokens: 2 },
    });

    await withScriptedUploadServer(
      [
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 500 },
        { status: 200, body: { status: 0, uploaded: 1, committed: true, revision: 2 } },
      ],
      async (webhookUrl, requestCount, payloads) => {
        await runCli(["connect", webhookUrl], home);
        await seedSuccessfulFullState(home, webhookUrl, {
          cutoverDate: "2026-07-12",
          lastFullSyncDate: "2026-07-12",
          aggregates: {
            [JSON.stringify([previous.date, previous.tool, previous.model])]: previous,
          },
        });
        const env = {
          TOKENRANK_NOW: "2026-07-12T06:00:00.000Z",
          TOKENRANK_RETRY_BASE_MS: "1",
          TOKENRANK_TEST_NO_RETRY_JITTER: "1",
        };
        await expect(runCli(["upload"], home, env)).rejects.toMatchObject({
          stderr: expect.stringContaining("temporary"),
        });
        expect(requestCount()).toBe(4);
        const walPath = path.join(home, ".tokenrank", "pending-incremental.json");
        const wal = JSON.parse(await readFile(walPath, "utf8")) as {
          digest: string;
          entries: Array<{ total: number }>;
        };
        expect(wal.digest).toMatch(/^[0-9a-f]{64}$/);
        expect(wal.entries).toEqual([expect.objectContaining({ total: 5 })]);

        await rm(path.join(home, sourcePath), { force: true });
        await runCli(["upload"], home, env);
        expect(requestCount()).toBe(5);
        expect((payloads[4] as { entries: unknown[] }).entries).toEqual(
          (payloads[0] as { entries: unknown[] }).entries,
        );
        expect(await exists(walPath)).toBe(false);

        const state = JSON.parse(
          await readFile(path.join(home, ".tokenrank", "aggregate-state.json"), "utf8"),
        ) as { aggregates: Record<string, { total: number }> };
        expect(Object.values(state.aggregates)).toEqual([
          expect.objectContaining({ total: 5 }),
        ]);
      },
    );
  });

  it("does not commit local state when the final server response is not committed", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "uncommitted-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withScriptedUploadServer(
      [{ status: 200, body: { status: 0, uploaded: 1, committed: false, revision: 1 } }],
      async (webhookUrl, requestCount) => {
        await runCli(["connect", webhookUrl], home);
        await expect(
          runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" }),
        ).rejects.toMatchObject({ stderr: expect.stringContaining("did not commit") });
        expect(requestCount()).toBe(1);
        expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);
        expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(true);
      },
    );
  });

  it("rejects a malformed successful response without corrupting local state", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "malformed-success",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "malformed-success",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await withScriptedUploadServer(
      [
        {
          status: 200,
          body: { status: 0, uploaded: 1, committed: true, revision: "1" },
        },
      ],
      async (webhookUrl, requestCount) => {
        await runCli(["connect", webhookUrl], home);
        await expect(
          runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" }),
        ).rejects.toBeTruthy();
        expect(requestCount()).toBe(1);
        expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);
        expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(true);
      },
    );
  });

  it("does not acknowledge a batch when the success response reports the wrong upload count", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "wrong-upload-count",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "wrong-upload-count",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await withScriptedUploadServer(
      [
        {
          status: 200,
          body: { status: 0, uploaded: 0, committed: true, revision: 1 },
        },
      ],
      async (webhookUrl, requestCount) => {
        await runCli(["connect", webhookUrl], home);
        await expect(
          runCli(["upload"], home, { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" }),
        ).rejects.toBeTruthy();
        expect(requestCount()).toBe(1);
        expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);
        expect(await exists(path.join(home, ".tokenrank", "pending-snapshot.json"))).toBe(true);
      },
    );
  });

  it("does not blindly retry non-retryable 4xx responses", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "bad-request-event",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "gpt-5-codex",
      usage: { input_tokens: 8, output_tokens: 4 },
    });

    await withSequencedUploadServer([400, 200], async (webhookUrl, requestCount) => {
      await runCli(["connect", webhookUrl], home);
      await expect(
        runCli(["daemon", "--once", "--scheduled"], home, {
          TOKENRANK_NOW: "2026-07-12T05:00:00.000Z",
          TOKENRANK_SCHEDULE_MINUTE: "0",
          TOKENRANK_RETRY_BASE_MS: "1",
        }),
      ).rejects.toMatchObject({ stderr: expect.stringContaining("temporary") });
      expect(requestCount()).toBe(1);
      expect(await exists(path.join(home, ".tokenrank", "aggregate-state.json"))).toBe(false);
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

  it("fails a manual upload on an active lock while scheduled runs skip quietly", async () => {
    const home = await tempHome();
    const clock = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" };
    await mkdir(path.join(home, ".tokenrank"), { recursive: true });
    await writeFile(
      path.join(home, ".tokenrank", "collector.lock"),
      JSON.stringify({ pid: process.pid, createdAt: "2000-01-01T00:00:00.000Z" }),
    );

    let requested = false;
    await withUploadServer(
      () => {
        requested = true;
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        const manual = await runCliFailure(["upload"], home, clock);
        expect(manual.code).toBe(1);
        expect(manual.stderr).toContain("Another TokenRank upload is already running");
        expect(manual.stderr).not.toContain(webhookUrl);
        expect(manual.stderr).not.toContain(home);
        expect(
          JSON.parse(
            await readFile(path.join(home, ".tokenrank", "service-state.json"), "utf8"),
          ),
        ).toMatchObject({ lastErrorCode: "UPLOAD_FAILED" });

        await runCli(["daemon", "--once", "--scheduled"], home, clock);
        expect(requested).toBe(false);
        expect(await exists(path.join(home, ".tokenrank", "collector.lock"))).toBe(true);
      },
    );
  });

  it("allows only one malformed-lock takeover under concurrent uploads", async () => {
    const home = await tempHome();
    await writeJsonLog(home, sourceFixturePaths.codex, {
      id: "malformed-lock-race",
      timestamp: "2026-07-12T04:30:00.000Z",
      model: "malformed-lock-race",
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await mkdir(path.join(home, ".tokenrank"), { recursive: true });
    await writeFile(path.join(home, ".tokenrank", "collector.lock"), "{malformed");
    let requests = 0;

    await withUploadServer(
      async () => {
        requests += 1;
        await new Promise((resolve) => setTimeout(resolve, 150));
      },
      async (webhookUrl) => {
        await runCli(["connect", webhookUrl], home);
        const env = { TOKENRANK_NOW: "2026-07-12T05:00:00.000Z" };
        const results = await Promise.allSettled([
          runCli(["upload"], home, env),
          runCli(["upload"], home, env),
        ]);
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
        const rejected = results.find((result) => result.status === "rejected");
        expect(rejected).toMatchObject({
          status: "rejected",
          reason: expect.objectContaining({
            stderr: expect.stringContaining("already running"),
          }),
        });
        expect(requests).toBe(1);
        expect(await exists(path.join(home, ".tokenrank", "collector.lock"))).toBe(false);
      },
    );
  });

  it("installs, reports, and uninstalls the background service config", async () => {
    const home = await tempHome();
    const darwinEnv = { TOKENRANK_TEST_PLATFORM: "darwin", TOKENRANK_SCHEDULE_MINUTE: "17" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, darwinEnv);

    const install = await runCli(["service", "install", "--interval", "120"], home, darwinEnv);
    const plistPath = path.join(home, "Library", "LaunchAgents", "com.tokenrank.collector.plist");
    const plist = await readFile(plistPath, "utf8");

    expect(install.stdout).toContain("Ignored --interval");
    expect(install.stdout).toContain("hourly at minute 17");
    expect(plist).toContain("daemon");
    expect(plist).toContain("<key>StartCalendarInterval</key>");
    expect(plist).toContain("<integer>17</integer>");
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

  it("uses one stable device-specific minute for hourly launchd collection", async () => {
    const home = await tempHome();
    const darwinEnv = { TOKENRANK_TEST_PLATFORM: "darwin", TOKENRANK_SCHEDULE_MINUTE: "17" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, darwinEnv);

    await runCli(["service", "install"], home, darwinEnv);
    const plistPath = path.join(home, "Library", "LaunchAgents", "com.tokenrank.collector.plist");
    const plist = await readFile(plistPath, "utf8");

    expect(plist).not.toContain("<key>Hour</key>");
    expect(plist).toContain("<key>Minute</key>\n    <integer>17</integer>");
    expect(plist).toContain("<key>RunAtLoad</key>");
  });

  it("installs a persistent hourly systemd user timer at the stable minute", async () => {
    const home = await tempHome();
    const linuxEnv = { TOKENRANK_TEST_PLATFORM: "linux", TOKENRANK_SCHEDULE_MINUTE: "23" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, linuxEnv);

    const install = await runCli(["service", "install"], home, linuxEnv);
    const servicePath = path.join(home, ".config", "systemd", "user", "tokenrank-collector.service");
    const timerPath = path.join(home, ".config", "systemd", "user", "tokenrank-collector.timer");
    const service = await readFile(servicePath, "utf8");
    const timer = await readFile(timerPath, "utf8");

    expect(install.stdout).toContain("hourly at minute 23");
    expect(service).toContain("daemon --once");
    expect(service).toContain("--scheduled");
    expect(service).not.toContain("--interval");
    expect(timer).toContain("OnCalendar=*-*-* *:23:00");
    expect(timer).toContain("Persistent=true");

    const status = await runCli(["service", "status"], home, linuxEnv);
    expect(status.stdout).toContain("Installed");

    const uninstall = await runCli(["service", "uninstall"], home, linuxEnv);
    expect(uninstall.stdout).toContain("Uninstalled");
    expect(await exists(servicePath)).toBe(false);
    expect(await exists(timerPath)).toBe(false);
  });

  it("installs a hidden Windows task with missed-run and logon recovery", async () => {
    const home = await tempHome();
    const windowsEnv = { TOKENRANK_TEST_PLATFORM: "win32", TOKENRANK_SCHEDULE_MINUTE: "31" };
    await runCli(["connect", "https://tokenrank.test/api/collector/upload/secret"], home, windowsEnv);

    const install = await runCli(["service", "install"], home, windowsEnv);
    const runnerPath = path.join(home, ".tokenrank", "tokenrank-collector.ps1");
    const taskPath = path.join(home, ".tokenrank", "tokenrank-collector.xml");
    const runner = await readFile(runnerPath, "utf8");
    const taskBytes = await readFile(taskPath);
    expect([...taskBytes.subarray(0, 2)]).toEqual([0xff, 0xfe]);
    const task = taskBytes.subarray(2).toString("utf16le");

    expect(install.stdout).toContain("hourly at minute 31");
    expect(runner).toContain("daemon --once");
    expect(runner).toContain("--scheduled");
    expect(runner).toContain("tokenrank.mjs");
    expect(runner).toContain("TOKENRANK_NO_ANIMATION");
    expect(runner).not.toContain("tokenrank.cmd");
    expect(task).toContain('<?xml version="1.0" encoding="UTF-16"?>');
    expect(task).toContain("<LogonTrigger>");
    expect(task.match(/<CalendarTrigger>/g)).toHaveLength(1);
    expect(task).toContain("<StartBoundary>2020-01-01T00:31:00</StartBoundary>");
    expect(task).toContain("<Interval>PT1H</Interval>");
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
