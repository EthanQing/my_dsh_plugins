# dsh-smart-session-title

DSH Web 插件：按**会话目标 + 本轮 AI 回复**自动生成中文标题，保护用户手动命名，并支持在项目内**先预览、再确认**的批量整理。

适用于 DeepSeek Harness **0.2.1-rc.2**（已在提取的 0.2.1-rc.2 运行时上验证类型与 API）。不修改内核、不修改 `app.asar`、不写 Profile 文件。

## 功能

### 1. 目标感知的自动标题

- 注册唯一的 session-title Provider（`smart-session-title`，`automatic: 'all-prompts'`），每条真人消息后触发一次生成。
- **等到本轮 `turn/end` 之后**才调用模型，因此输入包含：会话目标（首条 + 最近若干条真人消息，按 12 KiB 预算裁剪）、本轮已完成的助手文本（最多 4000 字符）、当前标题。
- System prompt 要求：简体中文、6~16 个汉字、保留项目/技术/英文专名、禁止“新会话/问题讨论”等泛化标题、只输出一行标题。
- 输出清洗：取首个非空行，去掉代码围栏、列表/标题标记、`标题：` 前缀、星号强调、成对引号、控制字符。
- 长度按 **Unicode 码点**校验（6~16）。不合规时**重试一次**；仍不合规则放弃并保留旧标题（不机械截断成误导性标题）。
- 与当前标题同主题（忽略空白、标点、大小写、全半角）时直接返回当前标题。

### 2. 手动命名优先（不可被覆盖）

所有入口（自动生成、单会话 AI 重命名、批量确认）在动笔前都先读 `sessionTitle.get(session)?.source.kind`，为 `user` 时立即跳过/拒绝；Provider 内部在本轮结束前后各复查一次，因此“生成途中手动改名”不会被覆盖。插件**不**自行 append 任何 `session/title` 事件，标题写入始终由 `ctx.sessionTitle` 完成。

### 3. 节流与成本控制

- 同一会话同时只跑一个生成；两次生成开始间隔 ≥ 30 s（可配）；2 s 合并窗口把连续多条消息合并为一次调用；全局并发上限 2。
- 新消息会**取消**排队中的旧请求；所有等待（窗口、间隔、并发槽、turn/end）都可被取消，卸载时清理 timer 与监听器。
- **没有 AI 文本或文本过短（< 40 字符）时不调用模型**，保留旧标题。
- 同一内容版本不重复调用模型；派生的标题版本键忽略 `session/title` 与 `session/title-llm-request`，避免“提交标题”本身使缓存失效。

### 4. 单会话 AI 重命名

会话行 `…` 菜单中的「AI 重新命名」：校验会话在内存中、非手动命名、未运行，然后通过 `refresh()` 重新生成。该入口只针对当前会话，不涉及批量。

### 5. 项目内批量整理（预览 → 确认）

会话行 `…` 菜单中的「整理本项目标题…」打开面板：

1. **预览**（Host `preview`，经 Remote `previewBatch`）：列出项目成员会话，为可整理项生成候选标题，逐行给出状态（可整理 / 手动命名 / 运行中 / 已归档 / 未打开 / 内容不足 / 超出上限 / 生成失败）。**只读，不写标题。**
2. 勾选后**确认**（Remote `confirmBatch`）：`previewId + sessionIds` 校验同 peer、未过期（10 分钟）、未消费、属于本预览；随后逐项复检项目成员、手动锁、内容版本未变，才把已确认候选交给 `refresh()`，Provider 直接消费候选（不二次生成）。
3. 取消或过期即丢弃预览；面板展示逐项结果与失败原因。

批量确认**只能**经 Remote 发生，不是命令、不是 agent 工具。

## 依赖边界（安装可见性）

Host 半只 import 三类模块：相对文件、Node 内置模块、以及 DSH 安装自带的 `@deepseek-ai/*` 包（`dsh-session-title`、`dsh-session-title-llm`、`dsh-typert-protocol`、`schemastery` 等）。

插件**不**在 Host 侧 import `zod` 或其他第三方包：DSH 运行时并不会把 `zod` 提供给 Profile 插件（安装清单里没有它），本地仓库能解析不等于 Profile 里能解析。因此 Host 的线格式校验使用自带的、无依赖的 `src/validate.js`（严格对象：拒绝未知字段、校验类型与长度）。Client 侧仍使用浏览器已播种的 `zod` 生成同一形状的 codec。构建脚本会静态检查每个 Host 模块的 import，出现不可解析的包名即失败。

## 安全边界

- Remote 命名空间 `smartSessionTitle`，每个方法在 `this.ctx.invocation` 上校验：invocation 存在、命名空间/方法匹配、`peer.principal.kind === 'owner'`、`peer.interactions === 'answer'`、连接未中止。否则抛 `USER_CONFIRMATION_REQUIRED`。
- 入参用 Zod **strictObject** 严格校验：`confirmBatch` 只接受 `{previewId, sessionIds}`，不接受标题、身份或 `confirmed` 之类的伪造字段；多余字段由 Gateway 边界拒绝。
- 预览按 peer 隔离：另一个连接（哪怕同为 owner）不能确认他人的 preview。
- 不使用 `principalOf === undefined` 判断 owner（该函数对“进程内非 Remote 调用”同样返回 `undefined`）。
- 批量的预览缓存、候选、定时器都在 `ctx.effect` 生命周期内，卸载即清理。

## 配置

`cordis.patch.yml` 与 Loader 配置键（均有默认值）：

| 键 | 默认 | 说明 |
| --- | --- | --- |
| `minIntervalMs` | `30000` | 同一会话两次生成的最小间隔 |
| `mergeWindowMs` | `2000` | 合并窗口 |
| `concurrency` | `2` | 全局并发生成上限 |
| `turnTimeoutMs` | `90000` | 等待 `turn/end` 的上限，超时保留旧标题 |
| `minAssistantChars` | `40` | 低于此长度的助手文本不调用模型 |
| `batchLimit` | `20` | 一次预览最多生成多少个候选 |
| `previewTtlMs` | `600000` | 预览有效期（10 分钟） |
| `providerId` | `smart-session-title` | 写入 `source.provider` 的 Provider id |
| `maxInputBytes` | `12288` | 输入字节预算 |
| `maxOutputTokens` | `4096` | 输出 token 上限（防止推理占满） |
| `timeoutMs` | `60000` | 单次模型调用超时 |
| `provider` / `model` | 未设置 | 可选：强制路由；默认取会话已记录的 `request/header` 路由 |

`cordis.patch.yml` 只做两件事：

1. **禁用** `session-title-llm`（内置“首条消息”Provider）——标题服务只接受一个 Provider；
2. **insert** 本插件行，并保留 `session-title` 服务本身及其配置。

## 安装（由部署者执行）

本仓库只含插件源码与构建产物，不执行安装，也不写 Profile。推荐走 DSH 官方插件页面（本地目录安装）：

1. 构建：`node scripts/build.mjs`（产物在 `lib/`）。
2. 在 DSH 插件页面选择「从本地目录安装」，指向本目录；页面会按官方流程写入 Profile 依赖与 bundles。
3. 重启 DSH 并刷新 Web GUI。

> 不要手写 Profile 的 `package.json` 或 `cordis.patch.yml`；也不要在 Profile 目录里跑 `pnpm`。
> 安装后 `session-title-llm` 行被禁用属于预期（本插件接管标题 Provider）。

回滚：在插件页面卸载本插件并重启；`session-title` 服务与既有标题事件不受影响。

## 目录结构

```text
dsh-smart-session-title/
├── cordis.patch.yml
├── icon.svg
├── locale/{zh,en}.json
├── lib/                 # 构建产物（Host ESM + 浏览器模块工厂）
├── scripts/build.mjs    # src → lib，并做语法与导出校验
├── src/
│   ├── index.js         # apply：Provider 注册、节流、Remote 挂载
│   ├── title.js         # 标题清洗/长度/同主题、输入裁剪、版本键
│   ├── limits.js        # 合并窗口、最小间隔、并发、可取消等待
│   ├── generate.js      # 一次受控模型调用（system prompt、重试）
│   ├── operations.js    # 单会话重命名、批量预览/确认/取消
│   ├── remote.js        # Remote 契约、owner 校验、Typert 注册
│   ├── validate.js      # Host 侧无依赖的严格线格式校验
│   └── client.js        # 侧栏菜单项 + 预览/确认面板（shell.overlay）
├── test/                # node:test（真实 Cordis/Typert/Gateway）
├── README.md
└── LICENSE
```

## 开发与验证

测试直接以**真实** Cordis、Typert Registry、API Gateway 与 `Peer` 组合进行，不复制运行时；用 `DSH_RUNTIME` 指向提取出的 0.2.1-rc.2 运行时目录：

```bash
# 构建（用真实 Node 24）
node scripts/build.mjs

# 测试（DSH_RUNTIME 指向提取的运行时目录）
DSH_RUNTIME=<extracted-runtime> node --import ./test/runtime.mjs --test test/*.test.mjs

# 语法检查
node --check lib/index.js
node --check lib/client.js
```

覆盖范围：标题清洗/长度/同主题、用户锁前后竞态、超时/取消/节流/合并、批量预览不写/过期/子集/peer 隔离、Remote 身份与入参拒绝、Client 契约与浏览器 bundle 工厂、patch/locale 资源。

## 限制

- **批量确认依赖 Remote**：Host 必须挂载 `typert` 与 `api-gateway`；它们不可用时本插件仍提供自动标题与单会话重命名，批量入口不可用（不会降级成普通命令确认）。
- 模型路由取自会话已记录的 `request/header`；会话尚未发过请求且未配置 `provider`/`model` 时，生成会明确报错并保留旧标题。
- 预览会为项目内至多 `batchLimit` 个会话各调用一次模型；会话很多时请分批。
- 标题由模型生成，长度/内容仅做机械校验与同主题判断，仍可能出现语义偏差；可手动改名，插件不会覆盖。
- `lib/client.js` 的视觉与交互（菜单、面板、明暗主题、键盘操作）需由人工在 GUI 中验收。
