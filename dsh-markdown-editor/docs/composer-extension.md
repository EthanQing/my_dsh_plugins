# Composer Extension 提案（尚未实现）

## 当前源码结论

核对日期：2026-10-20。本机 Desktop 内置 CLI / ui-conversation / ui-chat 为 `0.2.1-rc.2`；只读读取安装包 client bundle，确认内嵌 Lexical `0.49.0`、namespace 为 `dsh-composer`。另核对官方 commit `687f282e8625c6b8d11ff58211a90524be2e4317`。

1. [runtime.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-conversation/src/client/input/editor/runtime.ts) 的 createEditor 固定注册 ReferenceChipNode、CommandChipNode、TextRefNode，再安装 plain-text、history、reference 行为。未发现公开 Composer 节点注册入口。
2. [keymap.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-conversation/src/client/input/editor/keymap.ts) 在 CRITICAL 层仲裁菜单、IME、发送与粘贴。扩展不能独立覆盖整个输入流程。
3. [projection.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-conversation/src/client/input/editor/projection.ts) 分离 detectText、clipboardText、引用 occurrence 与发送模型。仅保证富文本节点 getTextContent 不变，不足以证明序列化安全。
4. [UserText.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-conversation/src/client/user-text/UserText.tsx) 使用 span 与 inline keyed slot，不适合完整块级 Markdown。0.3.0 使用消息行块级委托，含业务节点时保留原生。
5. [Lexical 插件文档](https://lexical.dev/docs/react/plugins)与[Editor State 文档](https://lexicaljs.org/docs/concepts/editor-state)以宿主拥有 Composer/编辑器上下文为前提，并不能给 DSH 插件提供缺失的注册和投影权限。

本次不实现真正 WYSIWYG，不修改内核、私有节点注册表、DOM 结构或 TextNode 样式。

## 建议的正式接口

由 DSH 提供版本化 `ctx.uiConversation.composerExtensions`。以下名称为提案，不是现存 API：

```ts
interface ComposerExtension {
  id: string
  apiVersion: 1
  supportedDsh: string
  mode: 'source' | 'markdown'
  nodes?: readonly ComposerNodeDefinition[]
  codec?: ComposerMarkdownCodec
  decorate?: (snapshot: ReadonlyComposerSnapshot) => readonly Decoration[]
  handleKey?: (event: ComposerGesture, tx: ComposerTransaction) => 'pass' | 'handled'
  onMount?: (composer: ComposerExtensionSession) => () => void
}
```

- **生命周期**：创建编辑器前收集、校验并冻结节点声明；按实例建立 session，明确 root/实例替换与 dispose 通知。卸载正在使用的节点扩展时，先用 codec 转回 Markdown 原文并迁移光标/undo，再停用；不能直接删注册表或替换 editor。
- **节点能力**：受控注册 Heading/List/ListItem/Quote/Code，宿主管理同一 Lexical 实例及 transforms。验证 type 冲突、版本、schema 迁移；禁止第三方第二份 Lexical 操纵宿主状态，提供 headless 测试环境。
- **统一 codec**：提供 parse(markdown, references)、serialize(document) 和位置映射。序列化分别产出发送原文、剪贴板投影、触发检测投影及引用 occurrence；引用/命令继续归宿主所有，不能把 chip 当普通文本伪造或覆盖。
- **往返与降级**：未知 Markdown 保留原文，围栏语言、空白、换行和引用目标不能静默丢失。源模式/可视模式显式转换；保存必要 source map，发送前验证 codec，失败回到可恢复的 source 模式，不发送损坏内容。
- **键盘仲裁**：宿主先处理 IME、特殊修饰键、重复键、禁用态和菜单，再调用扩展。扩展只通过受控 transaction 修改文本/选区；返回 handled 后由宿主消费事件。提供 selection bookmark、history group 与列表操作，失败不触发发送。
- **纯视觉装饰**：只读 snapshot 与稳定文档坐标，由宿主映射 DOM/Highlight 或受控装饰层；不进入 EditorState、发送数据或 undo。IME 期间暂停，按文档/DOM 修订使缓存失效。
- **粘贴**：附件识别、引用解码、占位符清理始终由宿主先执行，扩展只处理宿主明确交付的清理后文本，不捕获 paste。
- **草稿与历史**：版本化 schema 支持重启、队列、编辑重发、undo/redo、引用重命名；扩展缺失时仍能恢复 source。持久化不依赖 DOM，发送继续走统一投影。

还建议为 `conversation.chat.user.content` 增加 block text 局部 slot，提供 text/facts/interactive/ellipsis 与原生 fallback。让插件只替换文本，附件、引用摘要、extraBlocks 的布局与生命周期继续归官方所有，减少当前消息行包装的必要性。

## 子代理异常预览的准确修复方向

当前 Profile 没有 dsh-subagent-workspace-ui，无法核实第三方实现或复现；旧 README 的根因描述不能当作已复现结论。但官方 [sessions/service.ts](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/session-controller/src/client/sessions/service.ts) 分别投影 parentId 与 origin，本仓库编辑/重试插件使用 sessions.fork，因此单凭 parentId 判定子代理在语义上不成立。

应在预览拥有者中采用明确来源判断；未知 summary 暂不显示，不能注册同 ID 的空组件屏蔽所有会话：

```js
const canShowPromptPreview = summary => summary?.origin === 'subagent'
```

预览缓存以当前 sessionId 为键；切会话取消旧请求或用 generation token 丢弃迟到响应，响应 sessionId 与 owner 不符时拒绝展示。正常子代理继续显示按钮，普通 fork 不显示。旧记录没有 origin 时应查询权威子代理 lineage，不能用 parentId 兜底。本插件只移除旧屏蔽，未修改其他插件，未声称已修复第三方内部错误。
