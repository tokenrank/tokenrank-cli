# TokenRank CLI 品牌视觉重设计

## 背景

当前 TokenRank CLI 使用荧光青、亮紫、粉红和多行 TrueColor Block Art，形成了通用“赛博朋克”风格，但与网站已经确定的“AI Token 竞技场 × 工业数据终端”品牌不一致。大型 ASCII/Block Art 在 Windows Terminal 的实际渲染中还出现了字符断裂、色块错位和背景重叠，严重影响可读性。

本次重设计采用已确认的 B「Scoreboard Panels」方向，并使用克制动效。CLI 必须成为网站视觉系统在终端中的直接延伸，而不是独立的一套霓虹主题。

## 目标

- CLI 与网站共享同一套品牌颜色、排名语言和工业数据面板结构。
- 在 Windows Terminal、PowerShell、macOS Terminal 和常见 Linux 终端中保持稳定、清晰。
- 保留明显的 TokenRank 赛事感，但不让装饰覆盖真实安装、扫描和上传信息。
- 彩色 TTY、窄终端、`NO_COLOR`、非 TTY、JSON 和后台任务都获得明确且可测试的输出。

## 非目标

- 不修改 collector 的采集、归属、去重、计分、上传或服务调度逻辑。
- 不引入 curses、Ink 或其他交互式 CLI 框架。
- 不实现全屏持续刷新的 TUI。
- 不新增与网站品牌无关的颜色、字体或图形语言。

## 已确认方向

### 视觉方向

采用 B「Scoreboard Panels」：

- 顶部使用信号绿赛事带，显示 `TOKEN/RANK // COLLECTOR` 与本地 Agent 编号。
- 主视觉使用两栏记分牌：左侧显示 `BURN TOKENS.` / `ASCEND RANKS.`，右侧显示状态编号与 collector 在线状态。
- 连接、扫描、上传和隐私边界使用骨黑面板、细边框和结构化编号。
- 移除大型 TOKENRANK ASCII Logo、Block Art 彩条和 `NEON TOKEN GRID` 语言。

### 动效方向

采用“克制动效”：

- 只允许短暂状态点变化、当前扫描行高亮和单行进度更新。
- 不允许整行背景在不同颜色之间闪烁。
- 不允许持续循环动画；命令结束后终端必须保持静态。
- `TOKENRANK_NO_ANIMATION=1`、`NO_COLOR=1`、非 TTY、JSON 和后台模式完全禁用动画。

## 视觉系统

### 品牌颜色

颜色直接映射网站 `app/globals.css` 中的 design tokens：

| 用途 | 色值 | 网站 token |
| --- | --- | --- |
| 终端底色 | `#070907` | `--background` |
| 主文字 | `#F2F1E8` | `--tr-ivory` |
| 次级文字 | `#858B80` | `--tr-muted` |
| 信号绿 | `#D6FF3F` | `--tr-gold` / `--tr-green` |
| 警示橙 | `#FF5B35` | `--tr-orange` |
| 面板底色 | `#0D100E` | `--tr-surface` |
| 当前行底色 | `#141814` | `--tr-surface-2` |
| 边框 | `#343A33` | `--tr-line` |

颜色语义固定：

- 信号绿：正常、已连接、进行中、成功、当前扫描项。
- 警示橙：排名数字、警告、失败、需要用户注意的动作。
- 象牙白：标题、主要数据和当前任务。
- 灰绿：说明、路径、等待状态和辅助数据。
- 禁止使用现有的荧光青 `#24FFB8`、亮蓝 `#00DAFF`、紫色 `#6930FF`、粉色 `#FF258D` 及其 ANSI TrueColor 序列。

### 字体与字符

- 使用终端自身的等宽字体，推荐顺序与网站一致：Cascadia Code、IBM Plex Mono、Consolas、系统 monospace。
- 不依赖字体连字或 Nerd Font 图标。
- 图形字符限制为终端普遍稳定的 `●`、`■`、`─`、`█`、`░`；窄终端和无色输出可退化为 ASCII 字符。
- 不再渲染多行大字 Logo，避免 Windows Terminal 中的宽字符和行高错位。

## 布局

### 宽终端（72 列及以上）

输出按以下顺序组成：

1. **Live Band**：一行信号绿背景，左侧 `TOKEN/RANK // COLLECTOR`，右侧本地 Agent 编号。
2. **Hero Scoreboard**：左侧两行品牌口号，右侧状态编号与 `COLLECTOR ONLINE`。
3. **Connection Panel**：展示 upload endpoint 的连接状态和公开 origin，不展示私密 token。
4. **Local Sources Panel**：逐工具显示编号、工具名和 `SCANNING` / `QUEUED` / `DONE` / `SKIPPED` 状态。
5. **Progress**：单行进度条、完成百分比与当前累计 Token。
6. **Privacy Boundary**：橙色左边界，明确只上传聚合用量，prompt、代码、对话和文件名保留在本机。
7. **Footer**：版本、平台以及 `NO_COLOR + NON-TTY SAFE` 能力提示。

面板之间使用空行和一像素语义的字符边界，不再使用大面积全宽彩色背景区分每一步。

### 紧凑终端（40–71 列）

- Live Band 缩为 `TOKEN/RANK // COLLECTOR`。
- Hero 只保留品牌名与在线状态，不显示大号状态编号和完整口号。
- 每个状态采用一行：`[01] Codex sessions  SCANNING`。
- 进度条按剩余宽度自适应，最小 10 列。
- 隐私说明缩为 `AGGREGATES ONLY // CONTENT STAYS LOCAL`。

### 非 TTY、NO_COLOR、JSON 与后台模式

- 不输出 Logo、色块、动画或回车覆盖控制符。
- 使用稳定纯文本：`== section ==`、`OK`、`WARN`、`ERROR`。
- JSON 模式只输出 JSON，不混入品牌头、状态条或日志。
- 定时后台上传保持安静，只按现有约定写必要错误或结构化结果。

## 状态与动效

### 启动

- 彩色 TTY 可显示最多 180ms 的短状态点变化，不重绘整屏。
- 启动完成后只保留静态 `● COLLECTOR ONLINE`。

### 扫描

- 当前扫描行使用 `#141814` 背景和信号绿左边界。
- 已完成项切换为信号绿 `DONE`，下一项再成为当前行。
- 终端不支持稳定背景色时，只改变状态文字颜色。

### 上传

- 只更新进度条所在单行，使用 `\r` 与清行控制符覆盖旧内容。
- 完成后写入一条静态成功行，不再播放完成闪烁。

### 警告与失败

- 使用警示橙文字和左边界，不使用整屏红色或背景闪烁。
- 错误信息必须包含失败阶段和可执行的下一步，视觉装饰不得吞掉原始错误。

## 实现边界

主要改动集中在：

- `bin/tokenrank.mjs`：替换 CLI palette、Logo、section、step、success 和 upload progress 渲染。
- `src/lib/collector/cli.test.ts`：更新 TTY 文案断言，增加品牌色、禁用旧色、窄终端、动画和纯文本降级测试。
- `README.md`：更新 CLI 视觉与兼容性说明。
- `CHANGELOG.md`：记录品牌统一和 Windows Terminal 稳定性修复。

应优先复用现有 `terminalIsTty`、`terminalColumns`、`useColor`、`useAnimation`、`fitLine` 和单行更新机制，不引入依赖或改写 collector 业务流。

## 测试与验收

### 自动化测试

- 彩色 TTY 输出包含 `TOKEN/RANK // COLLECTOR`、`BURN TOKENS.`、`ASCEND RANKS.` 和阶段编号。
- 输出只包含网站品牌色对应的 TrueColor 序列，不包含青、蓝、紫、粉旧色序列。
- 40、71、72、104 列分别验证紧凑/宽屏边界，所有可见行不得超过终端宽度。
- `TOKENRANK_NO_ANIMATION=1` 不产生动画帧或睡眠依赖。
- `NO_COLOR=1` 和非 TTY 输出不含 ANSI escape sequence。
- JSON 和后台模式不输出任何品牌视觉内容。
- 既有扫描、上传、状态、doctor 和 service 测试继续通过。

### 人工验收

- Windows Terminal + PowerShell：无 Block Art 断裂、无色块错位、无残留动画帧。
- 80 列与 120 列：信息层级清楚，扫描状态和错误可快速定位。
- `NO_COLOR=1`：输出可复制、可记录、可被脚本安全消费。
- CLI 与网站并排查看时，颜色、边框、赛事语言和隐私表达属于同一品牌。

## 成功标准

- 用户第一眼识别为 TokenRank 网站的终端版本，而非通用赛博朋克模板。
- 真实扫描信息成为视觉主角，品牌装饰只建立层级和记忆点。
- Windows Terminal 不再出现截图中的断裂 ASCII/Block Art 和青紫粉色带。
- 所有现有 collector 功能、纯文本输出、JSON 输出和后台运行行为保持兼容。
