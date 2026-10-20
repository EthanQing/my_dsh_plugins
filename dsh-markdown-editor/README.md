# dsh-markdown-editor

DSH Web 插件：把**用户气泡按 Markdown 渲染**、**长消息自动折叠**，用 **CSS Custom Highlight API** 在输入框里**原位着色 Markdown 语法**，并在输入框内提供**行样式（标题/引用/围栏）、Enter 列表续写、Tab 列表缩进与 Markdown 粘贴**，同时**遮蔽**第三方插件在多会话上误显示的「预览」按钮。

适用于 DeepSeek Harness **0.2.1-rc.2**（在解包源码上核对了 `conversation.user.text.node` 的 keyed 槽语义、`conversation.session.header.actions` 的 list 槽语义、`MarkdownText` 的 labels 形状）。不改内核、不改 `app.asar`、不写 Profile、不改第三方插件代码。

## 功能

### 1. 用户气泡按 Markdown 渲染

- 遮蔽 keyed 槽 `conversation.user.text.node` 的 `key: 'text'` 单元（`priority: -1`），用 `keyed` 槽「每 key 只渲染最小 priority 的存活条目」的规则接管该段文本。
- `interactive === true`（历史消息气泡）时走块级渲染：直接复用官方 `@deepseek-ai/dsh-client-ui-primitives` 的 `MarkdownText`，因此**代码块复制按钮、表格、图片、脚注、行内代码底色全部沿用官方实现**，本插件不自绘任何 Markdown 元素。
- `interactive !== true`（输入框上方的队列预览、发送中的回显、内联编辑的原文）时**只做行内**：一个 `<span>` 内按简化规则着色（粗体 / 强调 / 删除线 / 行内码 / 链接），不产生任何块级元素 —— 队列预览的 `ellipsis` 单行截断与内联编辑的原文都不受影响。
- 文本取值顺序 `node.data.display → node.data.text → raw`。`display` 是官方「折叠空白」规则后的展示文本，丢掉它会让气泡里的连续空白与原文本不一致。
- **只接管 `text` 这一段**。`@session` / `/skill` 引用由官方 `conversation.user.text` 工厂切分成独立 node，`key: 'session'` 单元仍是官方的 chip 渲染器，本插件不注册、不遮蔽、不接管。
- 失败降级两层：`MarkdownText` 缺失或不可渲染 → 纯文本；`MarkdownText` 抛错 → 轻量 error boundary（`getDerivedStateFromError`）回退纯文本，并 `console.warn('[dsh-markdown-editor] …')`。文本变化时 boundary 会重置重试，不会永久卡在降级态。
- **可用性判断不能用 `typeof === 'function'`**：官方 `MarkdownText` 是 `React.memo(...)` 的产物，而 `memo` 返回的是 `{ $$typeof: Symbol.for('react.memo'), type, compare }` **对象**而不是函数。只判函数会把真实组件误判为缺失，让所有块级气泡静默退回纯文本。插件改用 `isRenderable()`，同时接受函数组件与 `memo` / `forwardRef` / `lazy` 包装对象，并在实际使用点（`useMemo` 内）判断而不是模块加载期。
- `package.json` 的 `dsh.client.inject` 显式列出 `@deepseek-ai/dsh-client-ui-primitives`，表达真实依赖。

### 2. 长消息自动折叠（纯显示层）

- 阈值：**> 1400 字符 或 > 18 行**（满足其一）。折叠用 `max-height` + 底部渐隐遮罩 + 「展开全文 / 收起」按钮。
- 遮罩 `pointer-events:none`，不拦截点击；展开后是原生 `MarkdownText` 输出，代码块复制、表格、图片照常可用。
- **只影响显示**：不截断字符串、不改 props、不写回任何 store。展开态是组件内 state，文本身份变化时复位为折叠态。

### 3. 输入框原位 Markdown 着色（Tier A）

- 目标元素：`[data-composer-input][contenteditable="true"]`，回退 `[data-conversation-content] [contenteditable="true"]`，再回退带 `__lexicalEditor` 属性的可编辑元素。
- 技术：`CSS.highlights` + `new Highlight()` + `Range`，用 `::highlight(name)` 着色。
- 着色项：`**bold**` / `__bold__`、`*italic*` / `_italic_`、`~~del~~`、`` `code` ``、`[text](url)`、行首 `#` 标题、`- ` / `1. ` 列表标记、`> ` 引用标记。语法标记本身用弱色（`--dsw-alias-label-caption`），内容用对应语义色。
- 触发：`input` / `selectionchange` / `focusin` / `focusout`，防抖 40 ms；IME 期间（`compositionstart` → `compositionend`）暂停，结束后重算。
- 只在**有焦点的**编辑器上工作；失焦、切会话、元素消失时清空全部 highlight 条目。
- 特性检测：`typeof CSS !== 'undefined' && CSS.highlights && typeof Highlight === 'function'`，不支持则静默跳过（输入框完全正常，只是没有着色）。
- 长文本保护：扁平化文本 > 100 000 字符时跳过着色；单个分类的 Range 数量上限 4000。

### 4. 输入框富文本（行样式 + Enter 续写 + Tab 缩进 + Markdown 粘贴）

**这里改了行为**，三项取舍已获用户确认：标记**淡化而非完全隐藏**、**Tab 改为列表缩进**、**依赖 DSH 私有接口并在异常时自动降级**。

原理：输入框的节点集是固定的（`dsh-composer`：`ReferenceChip` / `CommandChip` / `TextRef`，没有标题、列表、引用、代码节点），loader 也不提供 `lexical` 种子，因此**不可能**注册语义节点。唯一合规的富文本手段是 `TextNode.setStyle(css)`：

- `setStyle` 只写节点的 `__style`，由 Lexical 自己在 `createDOM` / `updateDOM` 中落到 DOM 上；
- 它**不影响 `getTextContent()`**，所以发送内容（`$composerLayout().clipboardText` 只取 `getTextContent`）、`detect` 偏移、光标/选区映射、IME 全部保持原样。

四项能力由 `FEATURE_FLAGS` 集中开关，可单点回退：

```js
const FEATURE_FLAGS = { lineStyles: true, enterList: true, tabIndent: true, pasteMarkdown: true }
```

**行样式引擎**（`classifyLine` / `classifyLines` / `planBlockStyles` / `applyLineStyles`）

- 纯函数 `classifyLine(text)` 识别 `^(#{1,6})\s`、`^>\s?`、`^(\s*)([-*+]|\d{1,9}[.)])\s`、围栏 `^```(\w*)$` 与普通行；围栏状态由 `classifyLines` 的状态机跨行/跨块传递（围栏是唯一有记忆的块语法）。
- 样式：`#` → `1.35em/600`，`##` → `1.22em`，`###` → `1.12em`，`####`~`######` → `1em/600`；`>` → `--dsw-alias-label-tertiary` + 500；围栏内 → 等宽字体 + `--dsw-alias-bg-layer-2` 底色；**列表行不写样式**（标记淡化交给着色器，避免同一属性双写）。
- 触发：`registerUpdateListener` + 40 ms 防抖；按「块文本指纹」判断是否真的变了，未变则不写；`editor.update(fn, { tag: 'history-merge' })` 保证不产生撤销步；带重入锁防 update→listener→update 循环。
- **IME 组合期短路**：root 带 `data-composer-composing` 或 `editor.isComposing()` 为真时跳过本次写入（不消费指纹），组合结束后由下一轮 update 补齐 —— 与着色器的处理一致，不会在候选窗下面改样式。
- 只写 `isSimpleText()` 为真的普通文本节点；`/skill`、`@file` 这类实体节点与 chip 一律跳过，免得和它们自己的类样式打架。

**Enter 列表续写**

- root 上**捕获阶段** `keydown`。官方 `KEY_ENTER_COMMAND` 是 bubble 阶段由 shell 注册的，捕获阶段 `preventDefault() + stopPropagation()` 后官方命令根本不会派发，**不存在双触发**。
- 让行条件（任一成立就完全放行，不碰事件）：`isComposing` / `keyCode === 229` / root 带 `data-composer-composing` / 引用或斜杠菜单打开（document 上存在 `[data-trigger-menu]`，或 root 内存在 `[role="listbox"]`）/ `aria-disabled` / 带 `ctrlKey`/`metaKey`/`altKey`/`shiftKey`。
- **不用 `[data-composer-overlay]` 判菜单**：那是 `ui-conversation` 在 `sessionId !== undefined`（真实会话恒成立）时渲染的**常驻锚点**，菜单开不开它都在 DOM 里；拿它判状态会让所有手势永远被否决。真正的动态标志是 `[data-trigger-menu]`——`ui-input-trigger` 的 MenuView 关闭时 `return null`。
- 光标所在块首行是列表项且行体非空 → 一次 `editor.update(fn, { tag: 'history-push', discrete: true })` 内先 `selection.insertParagraph()` 再 `selection.insertText(下一个标记)`。`-`/`*`/`+` 原样复制，有序列表取 `数字+1` 并沿用 `.` 或 `)`，前导空白照抄。
- 行体为空（只剩标记和空白）→ 同一 update 内把选区扩到标记上再 `removeText()`，**消费 Enter**（不发送）。
- 非列表行 → 完全放行，Enter 照常发送。
- 一次手势只有一个 update，撤销一次即可回退；同步期抛错则 catch 后放行官方行为并 `console.warn`，异常绝不冒泡到用户。

**Tab 缩进**（已批准的行为变更）

- 列表行内 `Tab` 在光标处插入 2 个空格并消费事件（默认 Tab 原本会移出焦点）；`Shift+Tab` 只在光标仍位于行首空白内时删除最多 2 个空格。
- 非列表行完全放行官方 Tab（键盘可达性不变）。同理 Shift+Enter（软换行）与 Ctrl/Cmd+Enter（accelerated 提交）都不拦截。

**Markdown 粘贴**

- 捕获阶段 `paste`：`event.defaultPrevented` 为真（已被其它处理器认领）直接放行；`clipboardData.files.length > 0` 直接放行（附件走官方）；否则只有纯函数预解析命中 Markdown（标题/列表/引用/围栏/行内标记任一）才接管。
- 一次 `editor.update(fn, { tag: 'paste', discrete: true })`，按空行切段插入为多个顶层段落，**文本与原粘贴逐字一致**（只规范化行尾 `
` → `
`）；超过 2000 行直接放行官方。
- 任何失败都在 update 内抛错，Lexical 会整体回滚该次 update，事件未被消费 → 官方粘贴接手，**不会丢内容**。

**接入与降级**

- `registerRootListener` 跟踪 `contenteditable` root 的更替（`__lexicalEditor` 取 editor），每次 root 更换重新绑定捕获监听并强制一次全量样式。
- 成功时 `console.info('[dsh-markdown-editor] rich text enabled')` 一次；失败时 `console.warn('[dsh-markdown-editor] rich text disabled: <原因>')` 并整块停用，输入框回到原样。
- 清理：捕获的 `keydown`/`paste`、`registerUpdateListener`、`registerRootListener`、定时器全部在 `ctx.effect` 的 disposer 内释放。

## 实现边界与已知限制

**输入框的富文本能力来自两处**：着色器用 CSS Custom Highlight API（只读 DOM、只写 `CSS.highlights`），富文本用 `TextNode.setStyle` + 属主键位手势。两者都不需要官方暴露装饰 API，但都不改变文本：

- **不**改 DOM 结构（除 Lexical 自己按 `__style` 写的行内样式）、`contentEditable`、`textContent`、`innerHTML`、选区；
- **不**改 `getTextContent()`，**不**替换节点或 editor，**不**调 `editor.setRootElement`，**不** `require('lexical')`，**不**改 shell 的节点集；
- **不**做镜像层、**不**自绘光标。

`::highlight()` 只能改 `color` / `background-color` / `text-decoration` / `text-shadow` 等少数字性，**不能**改字形宽度。所以着色器侧的仍有限制：

- **粗体不加字重** —— 只用颜色区分（`text-shadow` 模拟加粗会让笔画发虚，明确不采用）；
- 列表**不缩进**、引用**不换行** —— 只按行内规则着色与淡化标记。

标题字号、围栏底色这些**能用 `setStyle` 表达的**，已由行样式引擎负责；`setStyle` 表达不了的（块级重排、装饰层）仍然不做。行样式按**块首行**判定（当前一个块就是一个段落），因此块内第二个换行行不改变整块样式。

其余限制：

- 着色器是文档级委托监听 + 单个 40 ms 定时器；任何 `input` / 选区变化都会触发一次重算，但结果按「文本 + 首个文本节点身份」缓存，未变化时不重建 Range。
- 折叠阈值是常量，不提供设置项；如需可改 `COLLAPSE_CHARS` / `COLLAPSE_LINES`。
- `MarkdownText` 的 labels（复制 / 代码块 / 脚注文案）由本包自己的 locale 字典提供，因此与 `ui-chat` 的中英文案一致但不共享其字典。
- 排序优先级：本插件的 keyed 单元是 `-1`。**同一 key 同一 priority 才会抛错**，`-1` 与官方的 `100` 永不冲突；即使本插件注册失败，官方的 `PlainUserText` 仍在，气泡退化为纯文本而不是空白。

## 与其它插件的兼容

### `dsh-message-edit-retry`

该插件也接管了 `conversation.chat.node` 的 `user` / `steering` 单元（`priority: -1`）来加编辑/重试按钮，但它的气泡内容不是自绘文本，而是继续调用官方工厂：

```js
renderFactorySlot('conversation.chat.user.content', { content, loadImage, facts, interactive: true })
```

官方工厂再渲染 `conversation.user.text` → `conversation.user.text.node`，因此本插件在 `text` 单元上的接管**依然生效**：编辑/重试按钮保留，气泡内的 Markdown 渲染与长消息折叠也保留。两者是叠加关系，无需二选一。

唯一注意点：它的 `interactive` 恒为 `true`，所以重试插件的用户行永远走块级渲染路径（不会出现队列预览那种行内模式），这是符合预期的。

### `dsh-subagent-workspace-ui`

- 它的 `subagent-workspace-manager`（`id` 不同）与本插件无关，保持可见。
- 见下一节：本插件抵消它的「预览」按钮在普通会话上的误显示。
- 它自己的 Catalog 遮蔽、lineage 遮蔽与本插件不重叠。

### `dsh-auto-collapse`

它折叠的是**助手工作段**（思考 / 工具 / 上下文），本插件折叠的是**用户长消息气泡**，两者作用对象不重叠。

## 「预览」按钮的根因与处理

**现象**：普通（非子代理）会话的 header 里出现一个「预览」按钮，点了会展开一段与本会话无关的提示词预览。

**根因**：`dsh-subagent-workspace-ui` 用 `promptIsSubagent(sessionId)` 判断是否子代理会话：

```js
const promptIsSubagent = (sessionId) => {
  const summary = sessionsRt?.list?.getSnapshot?.()?.byId?.[sessionId]
  return Boolean(summary && (summary.origin === 'subagent' || typeof summary.parentId === 'string'))
}
```

它把**任何带 `parentId` 的会话**都当成子代理会话。而 `fork()` 会给新会话记一个 `parentSession`，客户端投影出来就是 `parentId`。所以**只要会话是分叉出来的**（编辑并重发、重试、任何 `fork()` 路径），它就被误判为子代理，于是注册在 `conversation.session.header.actions` 的 `id: 'subagent-prompt-preview'`（`order: 101`，默认 priority 0）单元被渲染出来。

**处理**（不改第三方代码）：该槽是 **list 槽**、单元按 `id` 划分，同 `id` 同 `priority` 才会抛错。本插件用同 `id`、`priority: -1` 注册一个返回 `null` 的组件，list 槽按 priority 升序去重后保留 `-1` 那条，于是这个单元被遮蔽为空，而 `subagent-workspace-manager`（`id` 不同）与官方其它 header 单元都不受影响。

注册用 `try/catch` 包裹：若未来宿主在同一 `(id, priority)` 组合上也注册了单元，本插件只 `console.warn` 并放弃遮蔽（按钮回到可见），插件其余部分不受影响。

## 安装与回滚

源码与 Profile 分离：本目录只放插件本身，Profile 侧的注册由下面的步骤完成。

**当前状态（2026-10-20 已安装）**：已写入本机 Desktop Profile（`~/.dsh/profiles/desktop`）的 `package.json`，`pnpm install` 已建立 `node_modules/dsh-markdown-editor` 软链接，`pnpm-lock.yaml` 已记录 `link:` 条目；改动前的 `package.json` 备份为同目录 `package.json.bak-md-editor-*`。**需重启 DSH 桌面端后生效。**

复现或换机安装步骤：

1. 在 Profile 的 `package.json` 加依赖：`"dsh-markdown-editor": "link:C:/Users/qc/Desktop/qingyi/dsh-plugins/dsh-markdown-editor"`
2. 在同一个 `package.json` 的 `dsh.profile.bundles` 数组里追加 `"dsh-markdown-editor"`。
3. 在 Profile 目录执行 `pnpm install`（只建 link，不下载依赖）。
4. 重启 DSH 桌面端，刷新 Web GUI。

回滚：从 `dsh.profile.bundles` 移除该行、删除依赖项、`pnpm install`、重启。所有注册随插件卸载一起消失，官方 `PlainUserText`、官方 header 按钮与输入框原貌自动恢复。

## 目录结构

```text
dsh-markdown-editor/
├── cordis.patch.yml      # insert 本插件行
├── icon.svg
├── locale/{zh,en}.json   # meta.title / meta.description
├── lib/
│   ├── index.js          # Host 半：只导出 name 与空 apply
│   └── client.js         # 浏览器模块工厂：两个注册 + 着色器 + 富文本
└── README.md
```

## 自检（无 GUI）

```bash
node --check lib/client.js
node --check lib/index.js
```

0.2.0 另用三种桩验证了新代码，脚本均放在系统临时目录且已删除，不落仓库：

- 纯函数表：`classifyLine` / `classifyLines`（围栏状态机）/ `planBlockStyles` / `continuationOf` / `enterMustPass` / `isMarkdownLike`；
- 假 Lexical 文档：Enter 续写（有序/无序/缩进/`)` 分隔符/空项退出）、Tab 与 Shift+Tab、Markdown 粘贴的逐字一致性、CRLF 规范化、文件粘贴放行；
- 假 TextNode：断言样式引擎**只**调 `setStyle`，不调 `setTextContent`、不改 `getTextContent()`；第二次同内容不重写（指纹缓存）。

另外用最小桩（假 `window.__ModuleLoader__`、假 `require`、假 `ctx.slots`、假 DOM/CSS）跑过 factory，断言了三个注册的 options、`inject` 数组、样式注入次数、卸载时的清理，以及行内/块级两条渲染分支、折叠阈值、`display` 取值优先级、labels 形状、缺失 `MarkdownText` 的降级、无 `t` seat 时的中文兜底与 Highlight 的 Range 映射。这些是开发期的一次性验证，不随仓库提供（插件本身没有构建步骤）。
