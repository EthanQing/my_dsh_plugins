# Aegis 工程工作流

[English](README.md)

纯配置的 DeepSeek Harness Plugin Bundle，安装后注册 **Aegis Engineering**，主预设 ID 为 `reliable-dev`。支持桌面端 **0.2.1-rc.2**，源码构建 `332895e0f7c9d4dbfb29729f5eb367fa263ff986`；不支持拿旧版全局 CLI 代替桌面端。不修改 DSH 本体，不自建会话数据库，仅通过一个小型 Host 入口调用官方 Include 加载七个原有预设，不含自定义调度器、通知系统或安装脚本。

七个角色共享同一套工作区工具：文件读取、写入、编辑、搜索和平台 Shell（Windows 上最终为 Git Bash `bash`）。职责由提示词约束，不再靠隐藏工具区分；Lead 仍独占 `aegis_delegate`/`list_agents`，子角色没有二次委派。六个独立子预设分别为 `aegis-planner`、`aegis-coder`、`aegis-knowledge-curator`、`aegis-reviewer`、`aegis-project-mentor`、`aegis-git-operator`。内部指令为英文，与用户交流默认简体中文。

## 可续聊机制

该版本本地 `spawn` 原生提供 Continuable，不再使用 `backgroundMode`。Lead 通过单一 `aegis_delegate` 工具和显式 `agent_preset` 启动角色，首次启动后保留返回的子会话 ID；后续直接用该 ID 调用 `send_message`，不先 `list_agents`。仅在真实断线、会话恢复或结果缺失时，且确需定位已有子代理，才允许一次 `list_agents` 查询。角色按需启动；一次完成会释放活动实例，持久会话及 ID 可继续使用。宿主默认 `maxActiveSubagents` 为 8。

Planner、Coder、Reviewer、Git Operator 可通过官方 `send_message` 向直接父 Lead 请求决策、报告阻塞或重要风险；Knowledge Curator、Project Mentor 为完成通知单向汇报。Lead 也可在子工作期间直接补充或纠偏。消息只返回交付确认；不相关或空闲的角色不会被查询、唤醒或广播，正常完成使用官方通知，只有结果缺失或断线才进入历史恢复。

**等待方式**：Lead 没有其他实际工作时，会简短说明状态并结束当前模型轮次，把控制权交回 DSH；这不是结束整个工作流。子代理正常完成后，由官方 `subagent-settled` 通知携带结束状态和结果唤起 Lead，再按原流程推进，需要用户批准的阶段仍然先批准。不得用 `sleep`、Shell 循环、定期查询或反复检查 Git/文件变化来等子代理，也不在完成后再次询问“是否完成”。真正必要的外部服务就绪检查可使用有界机制，但不能代替子代理完成通知。

冷恢复依赖官方会话持久化、现存会话文件及相同 ID 的当前预设。恢复使用当前安装的预设版本，不保留旧插件实现副本。`session_event_search` / `session_event_read` 的跨会话查询要求工作区 cwd 字符串完全相同。缺失服务、预设或历史时应报告，不能无声新建替代会话。

桌面默认 `openAt: never`，全文索引未启用。Lead 不改变该设置；使用原子会话 ID 的 `session_event_read`，从 `seq: 0, after: 50` 读取原始事件窗口，每次异常恢复最多读取三个向前推进的窗口，定位后再精确读取一次结果；序号无进展或无后续事件时立即停止并报告，不重复等待或重建子代理。全文搜索仅在可用时使用，禁用时转为原始读取，不能重建 Planner。

## 开发流程与批准

如果你已经用 GPT 准备了详细的实施提示词，Lead 会直接复用目标、文件位置、修改建议、约束和验收条件。它只核实关键代码事实与风险，不默认重新扫描项目、做完整调研，或把提示词重写成另一份长计划。发现实际代码不符或缺少关键决定时，才补充调查。

| 任务 | 默认怎么做 |
| --- | --- |
| 小任务 | Lead 简短方案 → 用户批准 → Coder → Lead 简短验收 |
| 实施路径明确的普通任务 | 同样直接审批后交给 Coder，不强制 Planner 和 Reviewer |
| 有技术选择、需求不清或需要跨模块分析 | 只针对缺口提问或调用 Planner，明确后再审批实施 |
| 高风险任务 | 保留风险规划、用户批准、独立 Reviewer 和关键验证；已有方案可复用，但必须核实关键事实与安全假设 |

风险按实际改动判断：安全权限、支付、数据与迁移、破坏性操作、公共接口、依赖工具链、生产配置、跨模块重构及大范围不确定影响不能因为提示词详细而降级。提示词很长，也不代表必须走复杂流程。

Planner 只补齐未解决的决定，不重做已有调查。Coder 继承文件位置、有效证据和验收条件，负责实际修改与必要验证。Reviewer 只在高风险、具体未解决风险或用户明确要求时出场，聚焦实际 Diff；Lead 最终验收只核对改动、范围和已有证据，不再开展一轮完整审查或重复构建。

Curator 仅处理实际需要的知识更新，Mentor 用于教学，Git Operator 用于单独授权的 Git 操作。纯知识任务用 Curator 替代 Coder，也按实际风险选择规划与审查。没有必要就不增加角色或阶段。

**用户修改审批仍然保留**：Lead 展示简短摘要并询问“批准实施 / 修改计划 / 暂不实施”。原始详细提示词、沉默和历史批准均不等于本次批准。任务、工作区、实质范围或风险变化时停止相关写入，更新方案并重新请求批准。Git 暂存、提交、推送分别取得当前任务的明确授权。

独立、有实际收益、没有前后依赖的只读调查可以并行；写入角色仍串行执行，不并行修改同一文件、依赖中的实施与验证或尚未批准的写入。优先减少无用阶段，而不是增加代理数量。复用仍有效的读取和验证证据，不默认全量测试、反复构建或新建一次性烟测文件。审查与最终核对共享最多三轮返工；同一问题两轮无进展时提前停止。

## 安装与启用

工作流已加入 [DSH 插件合集](../README.md)，目录和包名从旧的 my_workflow / dsh-aegis-engineering 统一为 **dsh-aegis-workflow**，版本 **0.2.0**。

通过 DSH 插件管理器安装或更新合集：

```text
github:EthanQing/my_dsh_plugins#main
```

合集中默认关闭工作流。打开“Aegis 工程工作流”组件后，新建会话并选择 **Aegis Engineering**。也可参考[启用配置](../examples/aegis-workflow.patch.yml)。源码在[主仓库的工作流目录](https://github.com/EthanQing/my_dsh_plugins/tree/main/dsh-aegis-workflow)维护，不再从原独立仓库获取本次改动。

只安装工作流时，使用合集打包提供的 dsh-aegis-workflow-0.2.0.tgz，或者本地工作流目录；不要把 GitHub 子目录网页作为安装地址。

**切换旧版本前先停用或移除旧工作流包**，再启用新版。角色 ID 仍为 reliable-dev 和六个 aegis-* ID，未改名；相同角色不能同时注册两份，也不能通过覆盖解决冲突。合集旧包名 my-dsh-plugins 已更名为 dsh-plugins，旧合集与新合集同样二选一。

保留旧版本、配置和会话记录，更新后自行重启 DSH，并在新会话核对预设。需要回滚时使用保存的旧包并停用新版本。本次没有修改 Profile、安装或重启 DSH；也未声称完成真实模型或 GUI 验收。

## Windows 与工具边界

Windows 宿主以 DSH desktop 0.2.1-rc.2 + `dsh-gitbash-shell` 0.38.5 为已验证组合。插件把进程级 `ctx.shell` 换成 Git for Windows bash（`bash.exe -c`，当前解析到 `C:/Program Files/Git/bin/bash.exe`），并在会话创建时把“有 pwsh、无 bash”的工具面替换为官方 `bash` 工具、遮蔽伪 `pwsh`。因此七个角色在 Windows 上都应看到 **`bash`**（MSYS 路径，如 `/c/Users/...`），必须使用 bash 语法；不得对 `bash` 写 PowerShell 语法，也不得把 `pwsh` 当作 Git Bash 使用。若工具面只剩真正的 `pwsh`，说明 Git Bash 集成未生效：使用 PowerShell 方言时须明确说明这一限制，不要伪造工具名。

七个预设都保留官方平台工具行（win32 下 `tool-pwsh`、非 win32 下 `tool-bash`）；这是 `dsh-gitbash-shell` 行内补丁的输入，不是最终模型工具名。不要把它静态翻成 `tool-bash`：在未装或未启用 Git Bash 执行器的 Windows profile 上，`bash` 工具会落到 pwsh 执行器，反而制造错配。插件不固化本机可执行文件路径；未安装该插件的 Windows profile 不在本次验证范围内。

支持的 Desktop/Web 组合会禁用 base 层全局模型工具，由各预设提供工具。裸 base 宿主不属于支持范围；用户另装的全局工具插件也可能扩大实际暴露面。

工具访问权限不再用于区分角色。七个预设都能读写文件并运行平台 Shell；Planner、Reviewer、Mentor、Lead、Curator、Git Operator 的只读、只审查、只写知识、只做 Git 等边界都靠提示词自律，而不是靠缺少工具。**这不是系统级安全隔离**：Shell 本身可以修改文件、执行 Git；Windows 上第三方 Git Bash 执行器在受限模式下的实际沙箱行为可能与文件工具不同（插件会标注），文件工具仍受宿主沙箱策略约束。用户选择的 DSH 宿主权限和沙箱、以及用户审批仍然是有效边界；不能声称提示词能百分之百阻止越权行为。真实模型是否遵守流程需另做验收。

## 日常执行边界

日常开发遵循最小充分验证：文档、注释、简单文案修改只检查修改内容；小范围代码修复优先用一项已有针对性检查；一般功能执行一次最相关的构建或测试；高风险改动只补真正必要的验证；用户明确要求全面测试时按要求执行。默认不新建烟测脚本、不跑全量套件、不重复相同构建、不引入新测试框架或依赖、不做无关检查、不为小任务生成大量报告。确实需要临时验证文件时放在 OS 临时目录，结束前清理自己创建的文件；不得留在业务项目目录，不得改写 `.gitignore` 隐藏，不得用 `git clean` 或通配符删除处理项目文件，也不得删除用户已有文件或合法构建产物。Reviewer 和 Lead 不重复已执行且结果仍有效的检查；安全/数据完整性等高风险改动的关键验证不能省略，未执行项必须如实列为限制。

这些是提示词行为约束，不是系统级强制执行；宿主权限、沙箱模式和用户审批仍是最终边界。工具统一不等于提升权限：本 bundle 不会把会话改成 `danger-full-access`，也不会绕过宿主已经拒绝的操作。

## 测试与人工验收

本仓库已移除测试代码和测试运行脚本。此前的验证记录保留在[验证说明](docs/validation.md)，不代表当前仍附带可执行测试；职责和恢复机制见[架构说明](docs/architecture.md)。

桌面交互、视觉和真实模型审批遵守情况等待用户验收，代理未操作 GUI。许可证尚待决定，当前包标记 UNLICENSED；本次不创建版本标签或 Release。官方参考链接见英文 README。
