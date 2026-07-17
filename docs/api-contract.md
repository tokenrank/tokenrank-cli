# CLI 上传契约

TokenRank CLI 与 Web 之间只通过用户私人 webhook 通信。新 endpoint 在上传前先读取匿名账户 identity：

```text
GET https://tokenrank.org/api/collector/upload/:token
-> 200 { "status": 0, "accountId": "<64 lowercase hex>" }

POST https://tokenrank.org/api/collector/upload/:token
Content-Type: application/json
```

GET 响应属于私人、`no-store` 数据；无效 token 返回 401。CLI 只接受严格的 64 位小写十六进制 `accountId`。同一 endpoint 已有合法本地 identity 时可直接复用，因此无变化小时任务仍是 0 HTTP；endpoint 改变时必须重新 GET。identity 未知或请求失败时 fail closed，不发送 high-water。identity 不同则清空本机旧账号 aggregate/pending/cutover 后为新账号建立 fresh full，绝不把账号 A 的 high-water 发给账号 B。

`accountingVersion: 2` 使用 UTC 日历日，并支持原子完整快照与小时增量。旧客户端没有这些字段时，Web 仍按 legacy upsert 处理。

## 共同字段

```json
{
  "accountingVersion": 2,
  "syncMode": "incremental",
  "deviceId": "tokenrank-<stable-anonymous-hash>",
  "clientVersion": "0.2.0",
  "timezone": "Asia/Shanghai",
  "generatedAt": "2026-07-16T00:00:00.000Z",
  "entries": [
    {
      "date": "2026-07-16",
      "tool": "codex",
      "model": "gpt-5",
      "input": 100,
      "output": 50,
      "cacheRead": 20,
      "cacheWrite": 0,
      "total": 150
    }
  ]
}
```

- `date` 必须是事件时间对应的 UTC `YYYY-MM-DD`，`timezone` 仅作设备元数据，不参与排行榜日界线。
- `entries` 是按 UTC 日期、工具、模型聚合的绝对累计值，不是增量差值。
- `model` 最长 120 个 UTF-16 code units；更长的本地值由 CLI 保留可读前缀并追加稳定 SHA-256 短后缀，既满足服务端 schema，也避免简单截断碰撞。
- 单次请求最多包含 500 条 `entries`。
- 当前 CLI 使用安全的 high-water 策略：只上传新 key 或非下降的绝对累计值；日志缺失、轮转或回退不会把服务端总量调低。

## Full snapshot

首次升级到 v2 以及每天一次 UTC reconciliation 使用 `syncMode: "full"`：

```json
{
  "accountingVersion": 2,
  "syncMode": "full",
  "cutoverDate": "2026-07-16",
  "snapshotId": "550e8400-e29b-41d4-a716-446655440000",
  "batchIndex": 0,
  "batchCount": 2,
  "batchHash": "<sha256(JSON.stringify(entries))>",
  "entries": []
}
```

- 首次 v2 cutover 固定为当前 UTC 日期，只发送 `date >= cutoverDate` 的 recent rows；更早的 legacy 历史保留。
- 后续 reconciliation 沿用本机已提交的 `cutoverDate`，重发 high-water rows，不根据“本次未扫描到”删除历史。
- 同一 snapshot 的全部批次共享随机 `snapshotId`，`batchIndex` 从 0 开始，`batchCount` 最大 100；空快照仍发送一个空批次。
- `batchHash` 是对该批规范化 `entries` 执行 `sha256(JSON.stringify(entries))` 得到的 64 位小写十六进制值。
- Web 在所有批次齐全后原子提交，并返回 `{ "status": 0, "uploaded": N, "committed": true, "revision": 1 }`，其中 `N` 必须精确等于本批 `entries.length`。CLI 严格校验成功 envelope，只有看到最终 `committed: true` 才更新本机 aggregate state；中途失败保留旧 aggregate state，并在 pending snapshot 中原子保存规范化 entries、cutover、account/device/endpoint identity、固定批次大小、snapshot ID 与 digest。重试不重新规划快照，必须逐批使用原 snapshot ID、边界、entries 与 hash。
- 如果本机 aggregate state 丢失或损坏，CLI 可能临时用当天 UTC cutover 发起 full。Web 对同一 device 的 cutover 冲突返回 HTTP `409` 和 `{ "status": -1, "error": "CUTOVER_DATE_CONFLICT", "expectedCutoverDate": "YYYY-MM-DD", "revision": 1 }`。CLI 仅接受这个严格 envelope，删除不兼容 pending 后按 `expectedCutoverDate` 重新扫描并重建 full，且每次命令最多自愈一次，避免重试循环。
- webhook Token 轮换会让 endpoint identity 变化，因此下一次默认上传强制发送 full snapshot。GET identity 确认是同一账号后，设备级 `cutoverDate`、high-water 与 WAL 才能继续沿用。若旧 token 已留下 receiving snapshot，Web 返回 HTTP `409` 和 `{ "status": -1, "error": "ACTIVE_SNAPSHOT_CONFLICT", "activeSnapshotId": "<uuid>", "expectedCutoverDate": "YYYY-MM-DD", "revision": 1 }`；CLI 只有在本地完整 pending 的 account、device、snapshot ID 与 cutover 全部精确匹配时，才通过新 endpoint 原样重放旧 snapshot，提交后在同一命令继续此前持久化的新 endpoint candidate。找不到精确 pending 时保持失败，不猜测、不生成替代 ID。

## Incremental

同一 UTC 日内的小时同步使用 `syncMode: "incremental"`。CLI 逐项比较本机 high-water 的 Token 计数字段，只发送变大的聚合行；没有变化时不发 GET 或 POST。发送前会把规范化 changed rows 原子写入 pending incremental WAL；部分批次成功或网络失败时整组 high-water 可幂等重放，并与后续扫描取非下降合并。只有全部批次收到严格合法且 `uploaded === entries.length` 的 `{ "status": 0, "uploaded": N, "revision": 1 }` 才先提交 aggregate state、再清 WAL，来源文件轮转不会丢掉未确认用量。

`--file`、`--tool`、`--since` 属于增量/过滤上传。当前 endpoint 尚未成功完成默认 full sync 时，CLI 会在本地拒绝这些命令并要求先运行 `tokenrank upload`，避免把不完整数据误当成首次 cutover。

网络错误、HTTP 408、429 和 5xx 使用带抖动的指数退避，并在合理范围内尊重 `Retry-After`；其他 4xx 立即失败。每次 direct、HTTP proxy 或 HTTPS CONNECT 尝试都有默认 30 秒绝对 deadline，覆盖连接、响应头与响应 body，超时后 Abort 并按网络错误重试。

每个来源根目录默认最多枚举 100,000 个匹配文件，路径确定排序且工具 predicate 在计数前应用；可用 `TOKENRANK_MAX_SOURCE_FILES` 调低测试。任何 stateful scan 一旦触发上限、读取错误或超大记录跳过，都会 fail closed，不上传、不写 aggregate ACK、不推进计划边界。

## Token 统计口径

- Codex 的 `input` 已包含 cached input，`total = input + output`。
- 缓存字段独立统计的工具，`total = input + output + cacheRead + cacheWrite`。
- 主 Agent 与可观测的 subagent 调用均按真实模型调用计入同一聚合总量，不上传或展示 subagent 明细。
- 服务端会重新校验并计算可接受的 raw Token 总量，不能把客户端 `total` 当作唯一事实来源。

## 兼容流程

以下变更只需发布 CLI：已有来源解析修复、同一工具的新本地来源、CLI 展示、语言和安装器变更。

以下变更必须先让 Web 服务端兼容：新增或重命名 `tool`、修改 payload、批次上限、UTC/cutover 或 Token 计分口径。

发布前必须完成 `pnpm check`、`pnpm lint`、`pnpm typecheck`、`pnpm test`，并用兼容 v2 的真实 webhook 验证 full commit 与 subsequent incremental。
