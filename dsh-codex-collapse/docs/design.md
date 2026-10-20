# 设计与接口依据

核对日期：2026-10-20。只读解析本机 `D:/Programs/DSH/resources/app.asar`，确认 dsh、ui-chat、ui-renderer 均为 **0.2.1-rc.2**。开发期间没有启动 Desktop、执行插件管理变更或读取凭据。实时 Cordis inspection / 连接浏览器工具不可用，使用安装包与对应官方源码核对。

核对的已安装 ui-chat Client bundle SHA-256：`A130B58FD24EA9B1E2A6A0F516009E9F9BFA9DC289CC8EBF004A735496FA52CA`。

## 为什么没有复制旧折叠插件

[dsh-auto-collapse](https://github.com/a179-sanae/dsh-auto-collapse) 的 [behavior-spec.md](https://github.com/a179-sanae/dsh-auto-collapse/blob/main/behavior-spec.md) 明确采用“原生一级—正文间工作段二级—原生工具详情”的设计；[work-groups.ts](https://github.com/a179-sanae/dsh-auto-collapse/blob/main/src/work-groups.ts) 根据正文边界分段，单条工作也可能创建工作段。它解决的是混合工作段，而不是每回合一个主入口。本插件没有复制其分组算法、DOM 观察器或层级结构。

[OpenAI Codex 开源仓库](https://github.com/openai/codex) 提供 TUI/执行单元等公开实现；例如 [exec_cell/compact.rs](https://github.com/openai/codex/blob/main/codex-rs/tui/src/exec_cell/compact.rs) 把命令预览与完整输出披露区分开。这只能作为紧凑活动摘要的参考，不等于 Codex Desktop 界面的完整开源实现。本插件没有复制 Codex 源码或商标图形。

## 已核对的 DSH 边界

- [ChatFlow.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/chat/ChatFlow.tsx) 保持原生节点、group、pending echo 和运行尾部的顺序。本插件不替换 flow、不重建父子关系。
- [TurnProcessNodeView.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/chat/TurnProcessNodeView.tsx) 是 `conversation.chat.node` keyed slot 的 `turn-process`。插件通过公开 `slots.entries/inject/register` 取得原始组件并注册更低 priority 的控制器；原生组件仅在安全回退路径复用。
- [ChatNodeSeat.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/chat/ChatNodeSeat.tsx) 在渲染器之前就决定整个回合可见性，运行中的 `setOpen()` 不允许关闭。只更换按钮或反复调用 setOpen 无法实现安全的运行态折叠，也不能保证中途正文可见。
- [ChatGroupSeat.tsx](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/chat/ChatGroupSeat.tsx) 另有 group disclosure；[presentation-policy.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/presentation-policy.ts) 的 Verbose 模式关闭原生外层折叠和 Step Group 折叠，适合避免双重控制。原生“全部展开”只在用户点击后通过现有 `transcript-view` 注册项提供的 `setTranscriptView('verbose')` 操作选择；不自动写配置、不修改其他设置。
- [slots.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/contract/slots.ts) 和 [snapshot.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/contract/snapshot.ts) 提供 `useChat`、`nodes.get`、`locations.getTurn`、`turnDataSource`。按回合及 kind 订阅增量源，避免每次 token 更新扫描所有历史或 DOM。
- [process-groups.ts](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-chat/src/client/conversation-nodes/process-groups.ts) 将 reasoning 与 response 映射成不同 groupPart。CSS 只隐藏 reasoning 部分；未知或未分出的混合节点保持可见。
- 源码中的 `data-slot=conversation.chat.flow`、`data-chat-turn`、`data-chat-node-key`、`data-chat-group-part` 用于本组件生成的显示样式。它们不是 Markdown 文本匹配，也不需要观察/改写 DOM；仍属于版本相关渲染标记，故 manifest 严格限定当前已核对版本，未来版本需重新确认。

## 状态与可见性

回合标识使用 sessionId + turn 编号，不用可能随分页/最终答案变化的 DOM 或 answerStep 身份。折叠选择与工具生命周期分离，使用有界 Map 和窗口级 sessionStorage。默认紧凑，状态转换只发布一次；手动选择优先于完成自动折叠，避免阅读中突然收起。

错误、停止、未完成和等待有独立标签。工具树递归检查需要操作的子项，父项也不会被隐藏；未知运行工具保守保留。原生审批 dock、用户消息、正文、turn-tail 和错误消息均不在选择器控制范围内。CSS 排除 focus-within 行，保留键盘操作可达性。

UI 样式使用 DSH 语义 token，原生字体、紧凑行和细小状态/箭头；所有控制使用原生 button、aria-expanded 和焦点环。状态文字中英文注册，动画尊重 prefers-reduced-motion。不引入另一份 React、不 require DSH Client 组件包，原生工具详情由原有渲染器保留。

## 未来官方接口建议

如果 DSH 增加 flow 级的只读 process visibility policy，以及保留正文/审批的按节点隐藏能力，就可以取消对 Verbose 和渲染属性的依赖。理想接口由宿主负责原生 group 展示、焦点、全文查找和滚动锚定，插件只返回每回合摘要及展开选择。本版本不通过私有函数劫持去模拟缺失接口。
