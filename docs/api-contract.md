# CLI 上传契约

TokenRank CLI 与 Web 之间只通过用户私人 webhook 通信：

```text
POST https://tokenrank.org/api/collector/upload/:token
Content-Type: application/json
```

单次请求最多包含 500 条聚合记录。CLI 会自动分批。

## Payload

```json
{
  "deviceId": "tokenrank-<stable-anonymous-hash>",
  "clientVersion": "0.1.0",
  "timezone": "Asia/Shanghai",
  "generatedAt": "2026-07-15T00:00:00.000Z",
  "entries": [
    {
      "date": "2026-07-15",
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

服务端当前执行 strict schema 校验，因此不能在未协调的情况下增加顶层字段或 entry 字段。

## Token 统计口径

- Codex 的 `input` 已包含 cached input，`total = input + output`。
- 缓存字段独立统计的工具，`total = input + output + cacheRead + cacheWrite`。
- 服务端会重新校验并计算可接受的 raw Token 总量，不能把客户端 `total` 当作唯一事实来源。

## 兼容流程

以下变更只需发布 CLI：

- 修复已有数据源解析。
- 新增同一工具的本地来源适配器。
- CLI 展示、语言、doctor、调度和安装器变更。

以下变更需要先让 Web 服务端兼容，再发布 CLI：

- 新增或重命名 `tool` key。
- 修改 payload 字段、类型、长度或批次上限。
- 修改 Token 计分口径。

发布前至少用真实 webhook 验证一次 connect、preview、upload，并确认服务端返回 `{ "status": 0 }`。
