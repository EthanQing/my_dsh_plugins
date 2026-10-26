# DSH Plugins · DSH 插件合集

这里放的是我为 DSH 桌面版整理和开发的插件，可以按需开启。合集 **0.6.6** 声明兼容 **DSH 0.2.1-rc.2 和 0.2.1-rc.3**，不放行未经核对的后续版本。

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
| [代码改动概览与 Git 操作](dsh-task-diff-review/README.md) | 有改动时在输入框上方显示概览，右侧栏可通过中文菜单查看六种 Diff；输入框底部右侧的 Git 胶囊可暂存、取消暂存、AI 辅助写提交信息、确认提交和选择 Remote 推送。 |
| [底部集成终端](dsh-bottom-terminal/README.md) | 主聊天列内可拖动高度的多标签终端，左右侧栏保持完整；支持重命名、折叠、隐藏和最大化。原有引导页“新建终端”卡片默认打开底部，也可选择右侧。复用原生终端服务，支持配置 NuShell。 |

## 怎么安装

在 DSH 的插件管理页面选择从 GitHub 安装，填入：

```text
github:EthanQing/my_dsh_plugins#main
```

合集的新包名是 **dsh-plugins**。以前安装过 **my-dsh-plugins** 的用户，请先卸载旧合集再安装新版，保留原有配置，避免同一批插件重复加载。

安装后，在合集的“包含的组件”里打开需要的插件即可。**初次安装默认全部关闭**，不用一次全部开启。更新并重启 DSH 后可加载新版本。

从 `dsh-plugins@0.6.5` 更新时，在插件管理器中更新现有合集，确认版本为 **0.6.6**，再自行重启 DSH；无需修改 Profile 或使用版本豁免。如果 GitHub 尚未包含此次修复，更新仍会取得旧包，须等修复提交到上述仓库后再更新，也可自行安装本地打包的 `dist/dsh-plugins-0.6.6.tgz`。9 个组件仍默认禁用，更新前已手动启用的项目以你保留的配置为准。

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
- **底部终端**：保留官方终端服务和右侧栏，启用合集中的“底部集成终端”。当前版本的 `terminal.new` 命令仍保留原生右侧行为，底部命令为 `terminal.bottom.new`，Windows Desktop 默认快捷键为 **Ctrl+Shift+\`**。NuShell 需加入 Host 的 `shellCandidates`，合集不会自动修改现有 Shell 配置。[配置示例](examples/bottom-terminal.patch.yml)
- 如果以前单独装过这些插件，选择独立安装或合集安装中的一种，避免重复。

只想安装单个插件时，可以在 [Releases](https://github.com/EthanQing/my_dsh_plugins/releases) 有安装包后下载对应的 `.tgz`，再通过 DSH 插件管理页面安装。

各插件的详细说明都在上表链接里。安装、更新和重启由使用者自行操作。

## rc.3 兼容性核对

对照官方 [rc.3 发布说明](https://github.com/deepseek-ai/deepseek-harness/releases/tag/dsh-v0.2.1-rc.3) 及 [rc.2 → rc.3 源码差异](https://github.com/deepseek-ai/deepseek-harness/compare/dsh-v0.2.1-rc.2...dsh-v0.2.1-rc.3)（`687f282` → `1f81c04`）：新增导航“更多”菜单和可选参数未删除现有 Slots；Session 客户端变更涉及空白会话/草稿复用；DeepSeek API Key 路由调整模型列表来源，未改变插件使用的 `llm.prepareCall`、标题生成接口。终端、子代理、Git Review 所用服务继续沿用原接口，因此此次只修改包兼容声明、官方 peer 约束和校验，不改业务代码或 UI。

验证范围为官方源码、本机 rc.3 发布包的离线 API 核对、现有测试、构建与打包检查；未安装/启用插件，也未在运行中的 Desktop 中做 GUI、真实模型、PTY 或 Git 写操作验证。各子插件文档中的 rc.2 记录为原始验证基线，原有功能限制仍适用。

图标统一使用 SVG，包括状态、加载和图标按钮，不使用字符或 emoji 代替。完整范围见 [SVG 图标审计](docs/svg-icon-audit.md)；源码仓库可运行 `npm run check:icons` 复查。
