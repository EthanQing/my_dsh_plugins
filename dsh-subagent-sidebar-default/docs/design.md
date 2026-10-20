# 导航与兼容设计

## 核对范围

- 当前安装：`D:/Programs/DSH/resources/app.asar`，读取其中 DSH、ui-subagent、ui-sidebar-right 的 manifest 和运行产物，版本均为 `0.2.1-rc.2`。只读核对，没有执行 Desktop。
- 当前 `C:/Users/Ethan/.dsh/profiles/desktop` 未安装第三方管理器。用户确认已卸载，希望开发自己的完整版本，因此采用独立 MIT Fork，而不是要求重新安装原包再注入增强。
- 上游 `dsh-subagent-workspace-ui 1.10.0`，固定提交 `02036b5c3661302f902884e24e6094283eef8b21`。未改动原包或 DSH 核心。

## 为什么只改 preferNewPane 不够

上游 `apply.ts` 同时提供主窗口 `openChild/openSession` 和右侧栏 `openAside`。`Manager.openRow()` 默认调用前两者，然后切换对话视图；活跃浮窗接收相同 `openRow`。因此仅修改右侧栏辅助按钮的 placement 不会改变普通单击。

本版本删除默认路径上的主窗口函数和 DOM 模拟对话标签点击，以 `openDefault(row)` 替换 Manager 的导航 props。Manager 与 ActiveFloat 继续共用本地 `openRow`，它只在侧栏打开成功后关闭管理器。批量选择仍优先执行选择操作；暂停、继续、隐藏和删除按钮保留 `stopPropagation()`。

## 原生标签复用

`src/client/navigation.ts` 每次点击取 `ctx.sessions.subagentAddress(childId)`；没有已解析地址时，仅接受列表已有的父 ID、子 ID 和已知模式。按官方格式生成：

```text
dsh-resource://subagentchat/session/<encoded-child>?parent=<encoded-parent>&mode=<mode>
```

由 `sidebarRightTabs.candidates(address)` 验证 `subagentchat` 类型接受，再调用：

```js
sidebarRight.openResource(address, {
  kind: 'subagentchat',
  preferNewPane: false,
  revealIfOpened: true,
})
```

原生服务的 `openContent` 在同一步展开侧栏、选择活动停靠面板并查找已打开的同类资源。没有传入 `replaceTab`、`paneId` 或 `split()`，不会主动替换标签、拆分、搬动或关闭现有布局。规范化地址固定查询顺序，去重由官方资源内容身份负责，不创建自己的标签缓存。

官方 `subagentchat` 资源拥有会话 retention 和释放机制。本插件不注册关闭取消钩子；关闭标签不会发出取消/删除请求。不创建私有 Session/Agent，不写真实消息或调用记录。

## 生命周期与兼容

- 使用官方 Header Actions / Lineage Slots；沿用上游对官方两个管理入口的声明式 shadow，不停用官方资源提供者。
- Host 和 browser 模块 ID 均为 `dsh-subagent-sidebar-default`，旧包默认 Host ID 则为 `subagent-workspace-manager`。切换由用户完成，启用示例明确停用旧 Host 行。单独命名 UI、CSS、偏好及端点避免覆盖旧代码。
- 自己的样式在 `ctx.effect` 中安装并清理；retention 仍按上游限额管理，卸载释放。
- 提示词预览仍是上游 DOM 装饰实现；本次没有借它劫持点击，也没有宣称它是正式消息渲染扩展接口。后续可独立改造，不扩大此次导航任务。
- 上游 Host 的直接递归删除、内部 Session 解绑和临时会话刷新被替换为仓库已有的受保护删除实现。检查活动会话先于文件扫描；拒绝占用不强删。源码副本随本插件分发，不依赖邻居目录或另一插件运行。

## 依据

- [上游导航注入](https://github.com/miuzel/dsh-subagent-ui/blob/02036b5c3661302f902884e24e6094283eef8b21/src/client/apply.ts)
- [上游管理器](https://github.com/miuzel/dsh-subagent-ui/blob/02036b5c3661302f902884e24e6094283eef8b21/src/client/manager.ts)
- [上游活跃浮窗](https://github.com/miuzel/dsh-subagent-ui/blob/02036b5c3661302f902884e24e6094283eef8b21/src/client/active-float.ts)
- [DSH 官方子代理入口](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-subagent/src/client/index.ts)
- [DSH 官方侧栏服务](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-right/src/client/service.ts)
- [DSH 官方插件开发 Skill](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/preset/agent-preset/skills/cordis-plugin-development/SKILL.md)
