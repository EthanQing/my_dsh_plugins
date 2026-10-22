# dsh-subagent-sidebar-default

子代理侧边栏管理器 **0.1.1**，面向已核对的 Windows Desktop **DSH 0.2.1-rc.2 / Node 24+**。

这是你仓库内独立维护的完整插件，基于 miuzel 的 `dsh-subagent-workspace-ui 1.10.0`（MIT）制作 Fork，**无需安装原第三方插件**。上游出处、固定提交和修改范围见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。开发目录使用当前工作区，未使用提示词中的旧机器路径。

## 打开行为

- 管理器普通单击、名称按钮和活跃子代理浮窗条目都默认调用同一个右侧边栏入口，支持一次性与可继续子代理。原有侧边栏按钮也复用相同入口。
- 使用官方 `sidebarRight.openResource()`，指定 `kind: 'subagentchat'`、`preferNewPane: false`、`revealIfOpened: true`。侧栏未展开时由原生服务展开；已经打开时使用现有活动停靠面板，不创建新的拆分面板。
- 同一规范地址交给原生资源标签去重并激活；不同子代理各有标签。不关闭或替换已有其他标签，不切换主窗口的父会话。
- 原生标签关闭只释放视图引用，不调用取消、暂停或删除。原生子代理详情与输入权限由 DSH 自己管理。
- 每次点击重新解析公开子代理地址，并让官方标签注册表验证。地址缺失、官方服务未启用或打开失败时提示错误，保留主窗口，不回退主窗口跳转。
- 没有通过 DOM 事件拦截、模拟点击或修改 DSH 内核实现导航；已移除上游的主窗口导航和 `pinChatViewTab()` 模拟点击。

## 保留功能与差异

保留上游管理器的搜索、范围选择、分类分组、筛选排序、批量选择、活跃浮窗、实时输出、暂停/继续、隐藏与恢复，以及子代理提示词预览。管理器界面未重新设计。入口、动作按钮、状态、Token 方向和实时事件标记统一为 SVG；中英文文案不再夹带 emoji 或字符图标。实时输出中的用户内容保持原样。

本插件使用独立插件/浏览器 ID、语言命名空间、CSS 类、偏好键和删除端点。第一次读取偏好时可以继承原插件留在浏览器中的配置；后续仅写自己的配置，不修改原插件。

子代理背景配置限制在该子会话的原生内容区域，移除上游针对全局哈希类名的统计栏装饰，避免侧栏子会话影响父会话外观。

删除功能采用本仓库安全删除后端的独立副本，无需安装 `dsh-session-delete-manager`：校验令牌、会话 ID、目录边界与符号链接，并通过官方工作区归档检查占用。**运行中或仍被标签页/预览占用的会话拒绝删除**，先暂停并关闭相关视图再操作；不强行拆除活动会话，不创建临时会话刺激刷新。批量删除报告部分失败，不把失败项目误标记为成功。

“隐藏/归档”沿用上游的浏览器本地列表隐藏语义，不删除会话；永久删除仍需用户确认。

## 从仓库安装与启用

本插件已接入[仓库合集](../README.md)。提交并推送后，可按根 README 通过 `github:EthanQing/my_dsh_plugins#main` 安装或更新。合集中的插件默认关闭，随后由用户合并[启用示例](../examples/subagent-sidebar-default.patch.yml)，自行重启 Desktop。

**与原 `dsh-subagent-workspace-ui` 二选一。** 原包默认 Host 行 ID 是 `subagent-workspace-manager`；示例停用该行后启用本插件。若你曾自定义原插件行 ID，需同时停用对应行。保持官方 `ui-subagent` 与右侧边栏启用，本插件依赖其原生资源标签。不要为了去掉官方管理入口而停用整个 `ui-subagent`。

当前检查到原第三方插件已卸载；本次没有安装依赖、安装/启用插件、修改 Profile、启动或重启 DSH。

也可以手动安装独立预构建包：

```powershell
& 'D:/Programs/DSH/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add './dsh-subagent-sidebar-default-0.1.1.tgz'
```

使用实际包路径；合集与独立包二选一，避免同一插件重复注册。

## 兼容与边界

- 不接管 `dsh-message-edit-retry` 的用户消息、继续/重试按钮，也不修改 `dsh-codex-collapse` 的过程折叠。
- 不替换 `dsh-markdown-editor` 的渲染 Slot。上游提示词预览模块仍使用受作用域约束的 DOM 装饰；该功能独立于导航，在宿主标记变化或 Markdown 插件已有预览时，显示效果需要 GUI 验收。不声称整个插件没有 DOM 操作。
- 地址类型未知时只使用 DSH 已发布的 `unknown` 路由，不猜成可继续子代理。未被官方目录发现的会话可能暂时无法打开。
- 复用当前原生布局：如果用户事先手动拆分或浮动过侧栏，保留其布局；本插件不合并/移动已有面板。屏幕过窄时侧栏仍遵循 DSH 的全屏响应式规则。
- 不覆盖其他插件或官方组件中的导航，例如原生工具卡片或子代理详情内部的“在主窗口打开”。默认行为覆盖本管理器与它的浮窗。
- 已核对安装包接口并完成基础代码检查，未安装到 Profile，也未完成真实 GUI 验收。未来 DSH 版本需重新核对接口。

## 开发

```powershell
# 开发依赖安装由开发者自行决定执行；现成 lib/ 安装时无需构建。
npm ci
npm run build
npm run check
npm run pack:plugin
```

构建工具为锁定的 esbuild，支持通过 `DSH_ESBUILD_MODULE` 指定已有模块 URL。本次复用工作区现有工具，没有安装依赖。`src/client/` 保留上游模块结构；`src/index.js` 是安全删除 Host；`lib/` 是已提交的运行产物；`dist/` 是忽略提交的安装包与校验和。

实现依据与限制：[docs/design.md](docs/design.md)。
