# DSH Plugins · DSH 插件合集

这里放的是我为 DSH 桌面版整理和开发的插件，可以按需开启。目前适配 **DSH 0.2.1-rc.2**。

## 有哪些插件

| 插件 | 用来做什么 |
| --- | --- |
| [Markdown 编辑助手](dsh-markdown-editor/README.md) | 输入时给 Markdown 语法着色，辅助列表换行；让消息按 Markdown 显示，长消息可以折叠。 |
| [消息编辑与重试](dsh-message-edit-retry/README.md) | 修改已经发送的消息，继续回答或重新尝试。修改和重试会从对应位置创建新会话，保留原记录。 |
| [会话删除管理](dsh-session-delete-manager/README.md) | 删除不再需要的会话，支持批量处理。运行中的会话会受到保护。 |
| [智能会话标题](dsh-smart-session-title/README.md) | 根据聊天内容自动起标题，手动修改过的标题会保留。 |
| [Codex 风格执行折叠](dsh-codex-collapse/README.md) | 把 AI 的工具调用等执行细节收成一行，运行时显示进度，展开后可看原始记录，正文和最终回答保持可见。 |
| [子代理侧边栏管理器](dsh-subagent-sidebar-default/README.md) | 搜索、查看和管理子代理；点击后在右侧栏标签页中打开，主窗口继续保留父代理会话。 |
| [Aegis 工程工作流](dsh-aegis-workflow/README.zh-CN.md) | 主代理协调规划、编码、审查等六个可续聊角色。优先复用你准备好的详细任务，审批后按需实施。 |
| [代码改动概览与审查](dsh-task-diff-review/README.md) | 输入框上方显示本轮改动，包含关联子代理；右侧查看本轮、未提交、暂存、未暂存、分支和历史提交 Diff。支持提交搜索与 Merge 父提交选择。 |

## 怎么安装

在 DSH 的插件管理页面选择从 GitHub 安装，填入：

```text
github:EthanQing/my_dsh_plugins#main
```

合集的新包名是 **dsh-plugins**。以前安装过 **my-dsh-plugins** 的用户，请先卸载旧合集再安装新版，保留原有配置，避免同一批插件重复加载。

安装后，在合集的“包含的组件”里打开需要的插件即可。**初次安装默认全部关闭**，不用一次全部开启。更新并重启 DSH 后可加载新版本。

如果使用命令行，先退出 DSH，再在 PowerShell 中执行：

```powershell
& 'D:/Programs/DSH/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add 'github:EthanQing/my_dsh_plugins#main'
```

上面是本机的安装路径，其他电脑请换成自己的 DSH 路径。

## 开启前看一下

- **智能标题**：启用时关闭官方的 `session-title-llm`；停用智能标题后，再把官方功能打开。[配置示例](examples/smart-session-title.patch.yml)
- **执行折叠**：先停用 `dsh-auto-collapse`，并把 DSH 的工作详情设为“全部展开”。之后由本插件负责折叠。[配置示例](examples/codex-collapse.patch.yml)
- **子代理管理器**：与原 `dsh-subagent-workspace-ui` 二选一，官方子代理功能和右侧栏要保持开启。[配置示例](examples/subagent-sidebar-default.patch.yml)
- **Aegis 工作流**：启用后新建会话，选择 **Aegis Engineering**。若装过旧版工作流，先停用或移除旧包，避免相同角色重复注册。工作流目录和包名现为 `dsh-aegis-workflow`。[配置示例](examples/aegis-workflow.patch.yml)
- **改动审查**：启用后开始一条新任务才能建立本轮基线；保留官方右侧栏和 Diff 组件。并发人工修改、外部工作树和超限文件的覆盖限制会在界面说明。[配置示例](examples/task-diff-review.patch.yml)
- 如果以前单独装过这些插件，选择独立安装或合集安装中的一种，避免重复。

只想安装单个插件时，可以在 [Releases](https://github.com/EthanQing/my_dsh_plugins/releases) 有安装包后下载对应的 `.tgz`，再通过 DSH 插件管理页面安装。

各插件的详细说明都在上表链接里。安装、更新和重启由使用者自行操作。
