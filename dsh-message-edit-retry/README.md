# dsh-message-edit-retry

DeepSeek Harness（DSH）桌面版客户端插件：**原位编辑已发送的用户消息并重新发送**，以及**对某一轮对话「继续」或「重试」**。

插件完全运行在浏览器端（client 半边），Host 半边只是一个可加载的空插件，不注册路由、不读写文件、不访问会话日志。

---

## 功能

### 1. 用户消息原位编辑

- 在每条用户消息（含 `steering` 消息）下方的动作条中新增「编辑」图标按钮，位置与官方「复制 / 分支」动作条一致。
- 点击后，**气泡原位切换为内联编辑器**，内容为该消息的原始提示词原文（保留换行）。
- 「取消」：直接恢复只读展示，**不发送任何请求**，原消息不变。
- 「发送」：走下面的「分叉重发」链路，把编辑后的文本（以及原消息中的图片）发送到**新分叉的子会话**。
- 编辑态容器复用官方气泡 token（`--dsw-specific-bubble`、`--dsw-radius-xl`、`10px 16px`），明暗主题与官方一致。
- 因为本插件替换了官方的 user/steering 节点渲染器，动作条同时**补回官方原有的「复制」按钮与时间戳**，避免行内功能缺失。

### 2. AI 继续 / 重试

在每一轮对话末尾（官方 turn-tail 动作条之前）新增两个文字按钮：

| 按钮 | 显示条件 | 行为 |
| --- | --- | --- |
| **继续** | 该轮已闭合，且 `turn/end` 原因**不是** `completed`（含 `hook` / `aborted` / `interrupted` / `error` / `max-tokens`，以及未知原因或缺 end 记录） | 在**当前会话**内发送一条本地化的「继续」/“Continue” 哨兵消息，让模型接着已有输出继续 |
| **重试** | 该轮已闭合 | **分叉**一个新会话（切点 = 该轮用户消息之前），重发该轮的**原始提示词**（文本 + 图片） |

- 轮次正常完成（`completed`）时只显示「重试」；轮次仍在运行时整组按钮不渲染。
- 会话运行中按钮为禁用态，tooltip 提示「请先停止当前任务」。

---

## 实现要点

### 停靠点（公开 slot）

| Slot | 注册方式 | 用途 |
| --- | --- | --- |
| `conversation.chat.node` | `key: 'user'` / `key: 'steering'`，`priority: -1` | 覆盖官方 keyed 单元，加入动作条与内联编辑器 |
| `conversation.chat.turnTail` | `id: 'message-edit-retry'`，`order: -10` | 每轮末尾的「继续 / 重试」 |

`priority: -1` 是 keyed slot 的 shadow 手法：每个 cell 取 `priority` 最小的存活项，官方为 `0`。

### 消息体渲染

消息气泡**委托官方工厂**渲染，保证排版、主题、图片、引用完全一致：

```js
renderFactorySlot('conversation.chat.user.content', {
  content: { text, attachments, extraBlocks, ...(referenceLabels ? { referenceLabels } : {}) },
  loadImage,
  facts: { ...(referenceLabels ? { sessionLabels: referenceLabels } : {}), ...(skillNames ? { skillNames } : {}) },
  interactive: true,
})
```

`attachments` 由 `image` / `file` 块映射为 `{ type:'image', image:{ attachment } }` / `{ type:'file', file:{ attachment } }`，与官方 `contentParts` 的拆分一致。

**引用与技能必须透传**：历史消息若含 `@会话引用` 或 `/skill` 调用，其节点数据携带 `referenceLabels` / `skillNames`。官方 `UserStyleBubble` 会把它们送进 `content.referenceLabels`（渲染气泡下方的引用摘要行）和 `facts.sessionLabels` / `facts.skillNames`（解析行内 chip）。本插件按同样规则转发；无值时**省略键而不是传 `undefined`**，空数组视为无值。漏传会让这类消息丢失引用摘要与 chip。

工厂缺失或抛错时回退为 `white-space: pre-wrap` 的纯文本气泡，不会整块崩溃。

### 分叉重发链路（编辑发送 / 重试共用）

```
sourceSeq = 该消息的 anchorSeq        // 缺失时用 data.seq
atSeq     = sourceSeq - 1             // 切点在该消息之前
```

1. 先通过 `源 binding.session.readAttachment(attachmentId)` 读取原消息的每张图片（附件属于源会话），`Uint8Array` → 分块 `String.fromCharCode` → `btoa` 转 base64，避免大图爆栈。**文件附件丢弃**，UI 提前提示。
2. 源会话 `running === true` 时先 `binding.session.cancel()`，再轮询其快照直到 `running === false`，超时 5000ms 就提示「当前任务未能停止，请稍后重试」并中止（**不 fork**）。
3. `atSeq >= 0` → `sessions.fork({ sessionId, atSeq, increaseTitle: true })`；
   `atSeq < 0`（首条消息无前驱）→ **不 fork**，改为 `sessions.create({ cwd })` 新建空会话（cwd 取自 `node.cwd`，回退到会话列表中的 `cwd`）。
4. `ctx.get('uiWorkspace')?.openSession(childId)` 切到子会话。
5. `await sessions.using(childId, { source: 'messageEditRetry' }, async (ref) => { ... })` —— `using` 内部 `retain` + `await ready`，并在 `finally` 自动 `release()`，无需手工管理引用。
6. `ref.binding.session.prompt(parts, 'queue', undefined, crypto.randomUUID())`；`requestId` 必传（Host 用它做幂等去重）。`parts` 仅含 `{type:'text'}` 与 `{type:'image', mediaType, data, name?}`。
7. `result.ok === false` 时抛出并带 `result.error.message` 显示，**父会话保持不变**。

### 继续链路（当前会话内）

- 会话运行中 → 提示先停止，**不自动 cancel**（避免用户意外中断）。
- 发送 `[{ type:'text', text: '继续' | 'Continue' }]`。这是 `prompt` 要求的非空文本；**不重复原提示词**、不拼接历史。

### 轮次结束原因

`conversation.chat.turnTail` 的 owner props 是 `TurnTailOwnerProps { turn: TurnLocation, seq, openFile }`，而 `TurnLocation` 本身携带 `status` 与 `end.data.reason.kind`。因此**结束原因无需降级判定**：

```js
turn.status === 'closed' && turn.end.data.reason.kind !== 'completed'
```

采用「非 completed 即可继续」的白名单取反：`hook` 中断、上游新增的结束原因、以及缺少 end 记录的闭合轮都能续写，不会因枚举遗漏而少一个按钮。

公开投影 `turnOutline` 只提供被截断的 `prompt` 预览，**不能**用于重发原始提示词，所以文本与图片来自模块级 registry（见下）。

### 模块级 registry 与并发

- `promptRegistry`：在 keyed `conversation.chat.node` 的 `useEffect` 中登记 `{ anchorSeq, text, content, cwd, hasFile }`，键为 `sessionId + turn + kind`；**只登记 `user`**（steering 永不作为重试种子），同一键保留最小 `anchorSeq`（该轮的开启提示词）。turn-tail 通过 `useSyncExternalStore` 订阅读取。写入**只在 effect 内**发生，render 期间无副作用。
- `activity`：按 `sessionId` 计数的 in-flight 集合，所有按钮在请求进行中 `aria-disabled`，防止重复点击创建多个分叉。
- 样式、字典均通过 `ctx.effect(...)` 注册并返回清理函数；`installStyles` 返回移除 `<style>` 的 disposer，重复加载时会先移除同名旧 `<style>`。

---

## 安装

插件需要被复制进 DSH 的 profile 插件目录，并在配置中启用。**本仓库不包含安装/启用步骤**，由部署方执行（例如由主控流程完成 profile 侧的 `package.json`/插件清单登记）。

目录结构：

```
dsh-message-edit-retry/
├── package.json          # type: module, main: lib/index.js, dsh.bundle.patch, dsh.client
├── cordis.patch.yml      # 插件 id / name 插入声明
├── icon.svg
├── README.md
├── LICENSE
├── lib/
│   ├── index.js          # Host 半边：可加载的空插件
│   └── client.js         # 全部功能（window.__ModuleLoader__ lazy factory）
└── locale/
    ├── zh.json
    └── en.json
```

`lib/client.js` 是**直接运行的产物**，DSH 直接加载它，不经过构建步骤。

依赖要求：DSH `@deepseek-ai/dsh` `0.2.1-rc.2`（`ctx.sessions.using` / `prompt(content, mode, signal, requestId)` / `readAttachment` 均按该版本签名实现），Node.js `>= 22`。

---

## 已知限制（请务必阅读）

1. **重发会创建新会话。** 编辑与重试都通过分叉实现，因此结果出现在**新的子会话**里，原会话不会被修改。这是 DSH 唯一公开的「在历史某点重来」能力。
2. **文件附件不会重发。** 原消息中的 `file` 块会被丢弃（Host 的 `file` 内容需要 `receiptId`，历史回执无法跨分叉复用）。UI 会在编辑态和重试 tooltip 中提前提示；图片会正常重发。
3. **首条消息走新建会话。** 当被编辑/重试的消息没有前驱事件（`anchorSeq - 1 < 0`）时无法分叉，改为新建空会话后再发送。
4. **源会话运行中会被先停止。** 编辑/重试在源会话 `running` 时会先 `cancel()` 并等待其停下；5 秒内未停下则中止并提示，不会留下半成品子会话。
5. **「继续」依赖哨兵文本。** 它发送一条本地化的「继续」消息，而不是拼接历史；模型看到的是自己的上一轮输出 + 这条指令。
6. **消息内容缓存在前端内存。** `promptRegistry` 只保存在当前页面进程内，刷新后由渲染过的消息重新填充；若该轮从未在当前页面渲染过，则只显示「继续」、不显示「重试」。
7. **时间戳跟随官方本地化。** 非当日消息按官方同一算法显示：同年用 `clock.md`（zh `{m}月{d}日`、en `{m}/{d}`），跨年用 `clock.ymd`（zh `{y}年{m}月{d}日`、en `{y}-{m}-{d}`），占位符 `{y}` / `{m}` / `{d}`，末尾拼 `HH:MM`。这 4 个键写在插件自己的字典里。
8. **inject 缺失会显式报错。** 渲染器的动作经 slot `inject` 注入；若 `editAndSend` / `continueTurn` / `retryTurn` 缺失，会走本地化的「操作失败」提示（编辑态保持打开以便重试），不会静默无响应。
9. **依赖官方 slot 契约。** 使用了 `conversation.chat.node` 的 keyed shadow 与 `conversation.chat.turnTail` 的 list 追加。若上游更改 slot 名称、keyed 语义或 `priority` 取值规则，需要同步升级（见下）。

---

## 维护与升级

- **改文案**：只改 `lib/client.js` 中的 `zh` / `en` 字典；`locale/*.json` 仅承载插件管理器展示用的 `meta.title` / `meta.description`。
- **改样式**：集中在 `CSS` 常量。请继续使用 `--dsw-*` / `--dsh-*` 设计 token，不要硬编码颜色，否则暗色主题会失配。
- **上游接口变动时的核对点**（按文件 + 行号核对，不要整包扫描）：
  - `dsh-client-ui-chat` 中 `conversation.chat.node` 的 `ctx.slots.register`（keyed）与 `conversation.chat.user.content` 工厂签名；
  - `dsh-client-ui-chat` 的 `UserStyleBubble` / `contentParts`（`{ text, attachments, extraBlocks }` 形状）；
  - `dsh-client-ui-session` 的提供表 `props: ['sessionId']`、`hooks: ['session']`、`keyedHooks: ['projection']`；
  - `dsh-api-session-controller` 的 `ClientSessions.fork / create / using / retain` 与 `ISession.prompt` 的 `PromptContentPart` 联合类型；
  - `PromptContentPart` 只允许 `text` / `image{mediaType,data,name?}` / `file{receiptId}` 三种。
- **验证命令**（在插件目录内）：

```bash
node --check lib/index.js
node --check lib/client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8')); JSON.parse(require('fs').readFileSync('locale/zh.json','utf8')); JSON.parse(require('fs').readFileSync('locale/en.json','utf8')); console.log('json ok')"
```

- **不要**在客户端 `require('@deepseek-ai/dsh-client-ui-chat')`：它不是浏览器静态种子模块，会造成重复实例。消息体一律通过 `renderFactorySlot` 复用官方渲染。
- **不要在客户端使用 `fs` / `child_process` / 读取 `.dsh/sessions` 下的日志**：本插件是纯 UI 侧能力。
- **`dsh.client.inject` 的声明**：插件在 `apply` 里用到 `sessions`（来自 `@deepseek-ai/dsh-api-session-controller`）与 `uiWorkspace`（来自 `@deepseek-ai/dsh-client-ui-workspace`），因此 `package.json` 的 `dsh.client.inject` 声明了 `dsh-api-session-controller`、`dsh-client-locale`、`dsh-client-ui-conversation`、`dsh-client-ui-renderer`、`dsh-client-ui-session`、`dsh-client-ui-workspace` 六项，保证加载/激活顺序正确。新增服务依赖时同步补在这里。

---

## 许可证

MIT，见 [LICENSE](./LICENSE)。
