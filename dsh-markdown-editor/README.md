# dsh-markdown-editor

DSH **0.2.1-rc.2** 的 Markdown 原文辅助编辑器，版本 **0.3.1**。保留原插件 ID、Host 入口和 bundle patch，不修改内核或其他插件。

## 已实现

- 输入框保留 Markdown 原文；通过 CSS Custom Highlight API 着色，不修改 DOM、文档样式或选区。扫描识别反引号/波浪号围栏、闭合符长度、语言信息与未闭合围栏；围栏内容不参与行内语法着色。
- 普通 Enter 保留 DSH 原生发送；Shift+Enter 换行，列表内自动续写有序/无序标记，支持光标处拆行、缩进、`.` / `)`；空项移除整行标记与空白。代码围栏内不续写列表。
- Ctrl+Enter 仅插入换行，不补格式、不退出空列表，也不触发 DSH 加速发送；支持空输入框和替换选中文本。Tab / Shift+Tab 修改当前行前导缩进并恢复正文光标，单次手势可一次撤销。
- IME（含 compositionend 后保护窗）、命令/引用菜单、禁用态、Alt/Meta/AltGraph 和 Ctrl+Shift+Enter 组合仍优先交回原生。完全移除粘贴监听，附件、引用、占位符清理均继续走原生路径。
- 每次按键获取当前 DSH Composer 和编辑器，支持 root/实例替换；私有访问集中在 `src/composer.js`，检查 namespace、Lexical **0.49.0** 版本与方法形状，不支持时回退原生输入。
- 消息复用官方 `MarkdownText`，保留代码块、高亮、安全链接；超过 1400 字符或 18 行的文本可展开/折叠，不截断原文。
- 不再向行内文本插槽输出块元素。通过公开 `slots.entries/register` 包装当前消息行，在块级层输出 Markdown；附件、图片、extraBlocks 和引用摘要仍委托官方 factory。
- 动态跟踪消息行注册变化，保留原行 locale 与注入动作。已审查本仓库 `dsh-message-edit-retry`，其编辑、继续、重试和编辑视图继续交给原组件，未修改该插件。
- 移除对 `subagent-prompt-preview` 的全部遮蔽。

## 保留的限制

- **不是 WYSIWYG**：不注册 Heading/List/Code 节点，不隐藏 Markdown 标记，不写 TextNode 样式。CSS Highlight 不支持标题字号或真正粗体。
- 官方 Composer 没有节点扩展及 Markdown 序列化接口。列表手势仍为经过版本与能力检查的私有适配；未知版本停用列表辅助，着色独立运行。
- 含命令、引用、文本实体或非普通段落的草稿，列表辅助保守停用。列表续写/缩进的非折叠选区交回原生；Ctrl+Enter 使用 Lexical 原生选区换行操作，不经过列表解析。Tab 只处理当前项，不批量缩进选区，不重排后续编号。
- 若编辑器版本不兼容或辅助功能发生异常，Ctrl+Enter 会被消费但不编辑，避免意外落入原生发送；此时可使用原生 Shift+Enter 换行。
- 含 Session 引用、其他业务节点或 skillNames 的消息保留整段原生渲染，暂不提供该段的 Markdown/折叠；队列、发送回显与省略预览也保留原生。拥有独立 store/子插槽的未知第三方消息行不包装。
- 私有适配抛错后本次加载停用列表辅助；已经开始的手势不会再次落入原生发送。不声称 Lexical 异常一定可回滚。
- 当前 Profile 未发现 `dsh-subagent-workspace-ui`，无法复现其异常预览。准确修复应由预览拥有者使用 `origin === 'subagent'`，并绑定本会话预览数据；`parentId` 不能区分 fork 与子代理。只移除旧屏蔽，不跨插件隐藏正常功能。

## 构建与检查

```powershell
npm ci
npm run build
npm run check
npm test
```

`package-lock.json` 锁定开发依赖；esbuild 生成单文件 `lib/client.js`，运行时不加载本包 React 或 Lexical 开发依赖。`check` 检查源码与产物一致，`prepack` 自动构建。验证包括真实 Lexical 编辑/光标/撤销与 React 消息层委托；GUI 由用户验收。

```text
src/
  client.js           注册与生命周期
  markdown.js         语法范围扫描
  lists.js            围栏上下文、列表编辑计划
  composer.js         版本检查、私有 Lexical 适配
  keyboard.js         键盘与 IME 保护
  highlighter.js      只读 DOM Range 着色
  messages.js         消息行包装、原生内容委托
  message-view.js     官方 MarkdownText、错误降级
  collapse.js         折叠状态与阈值
  locale.js / styles.js
scripts/build.mjs
test/
lib/index.js / lib/client.js  DSH 入口
```

## Desktop 安装/更新

安装、更新与卸载全部由用户自行操作。GitHub 合集和单插件 Release 的安装方式见[仓库安装说明](../README.md)，不要将合集与本插件独立包重复安装。

本地开发链接仅在用户主动选择时使用 **Desktop 自带 CLI**；先完全退出 DSH，不要手写 Profile manifest 或替换其依赖：

```powershell
& 'D:/Programs/DSH/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add 'link:E:/Desktop/workspace/my_dsh_plugins/dsh-markdown-editor'
```

CLI 维护 `~/.dsh/profiles/desktop` 的依赖、锁文件与 bundle 列表。之后重新打开 DSH；本地 link 源码更新后先构建，再重启以加载新产物。卸载使用同一 CLI 的 `plugin --profile desktop remove dsh-markdown-editor`。

正式接口提案、预览修复方向与源码依据：[docs/composer-extension.md](docs/composer-extension.md)。
