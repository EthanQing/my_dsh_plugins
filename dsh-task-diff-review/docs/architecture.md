# 实现与边界

## 核对依据

实际检查 Windows 桌面包 `D:/Programs/DSH/resources/app.asar` 中 0.2.1-rc.2 的 workspace-changes、agent-loop、subagent、session-query、ui-conversation、ui-sidebar-right、ui-deliverables 实现，并参考：

- [官方 workspace-changes](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/deliverables/workspace-changes/README.zh.md)
- [官方 Diff 审查](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-deliverables/README.zh.md)
- [输入区 Slots](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-conversation/src/client/contract/slots.ts)
- [Git diff](https://git-scm.com/docs/git-diff)

官方记录器主动排除 origin=subagent/delegationDepth>0，且 workspace/changes 仅持久化 turn，summary/snapshot 留在 Host 内存。不能把这些摘要简单相加，也不能据此声称历史已永久保存。

## Host

`index.js` 在官方 Connection 认证边界内注册 summary、diff、refresh、history 四个只读 GET 路由。会话目录来自官方 Agent/SessionQuery，不接受客户端指定任意磁盘路径。历史头信息有界缓存，避免轮询完整历史。

`recorder.js` 通过 `session/event` 中 `user/message` 的 `source.kind=user` 建立新基线；runtime-context、agent-message、subagent-settled 不新建任务。`tools/pre-execute` 等待基线任务完成再调用 next，以覆盖终端/脚本首次写入。父子关联来自 `header.parentSession`，不根据模型文本猜测。后代首次创建和每次续聊重新绑定正确任务，创建至首次 turn/start 也作为待完成阶段；turn/end、tool/result 和递归目录监听触发合并捕获，不轮询子代理状态。

本轮结束以已观察到的各成员 turn 状态为准；父结束但子仍运行时继续监听。后续官方完成通知唤起父回合时仍用同一基线。目录监听有防抖；每次全量读取被记录范围的最终磁盘内容，而非累计工具调用行数。持久化前后清单和内容寻址的文件副本，写入临时 JSON 后原子替换指针。重启不使用当前目录补造旧基线。

`snapshots.js` 的 Git 仓库访问仅使用 rev-parse、ls-files、ls-tree、cat-file、for-each-ref、symbolic-ref、merge-base、check-attr 和 config --get。原始 blob 不经过 clean/smudge 过滤器，读取不修改真实索引、对象库或工作树。不调用 git add、checkout、update-index、write-tree、hash-object -w 或提交命令。文件捕获逐层 lstat，拒绝符号链接/联接。受限文件只能报告缺口。

本轮原始快照保留磁盘字节。未提交模式另外只读查询 text/eol 属性、core.autocrlf 与索引/工作区 EOL 统计，在插件内做对应的 CRLF→LF 转换，避免 Windows 检出换行差异产生全仓库假修改。自动转换遇索引已有 CRLF 或 Git 判为二进制时不执行，参照 [Git convert.c](https://github.com/git/git/blob/master/convert.c) 的行为。外部过滤器、工作区编码和 ident 转换不执行，相关文件明确标为未覆盖。

快照比较在自己的临时目录使用 `git diff --no-index --no-ext-diff --no-textconv -M`，name-status 和 numstat 来自同一对内容，支持 Git 重命名检测。单文件真实 unified patch 转为原生 hunks；显示与统计读取同一组内容。Git 执行无 shell、无提示、无可选锁，有输出和时间上限。临时目录使用随机 ID，仅在插件自身目录内清理；项目和真实 Git 元数据不写入。

## Client

`conversation.input.dock` 是原生 composer 上方的 list slot，不用绝对定位。自定义资源 `dsh-resource://task-diff-review/session/<id>`，`sidebarRight.openResource` 使用 `preferNewPane:false,revealIfOpened:true`，文件通过同一标签的 navigation 参数选择。

原生 FileDiff 没有独立公开扩展点；从公开 Slots 注册表获取官方 `@deepseek-ai/dsh-client-ui-deliverables` 的 ReviewTab 组件，仅在自己的标签中通过 props 适配 summary、diff、选中项和 split/wrap 状态。没有导入私有包、修改注册表、覆盖原生存储/路由、伪造会话事件或冒充原生工具日志。使用独立的本地状态，不注册原组件拥有的子 Slot；原生跨应用打开菜单不提供，原生文件打开按钮保留。真实 ReviewTab 本身完成行号、绿色/红色 Diff、Shiki 代码着色与 5000 行渲染保护。

这一组合依赖已核对版本的 ReviewTab props 契约，属于版本绑定的兼容方案，不是官方承诺的稳定独立 Diff SDK。缺失原生组件时显示说明，不用 DOM 扫描强行替代。GUI 布局与高亮的实际验收由用户在 DSH 中完成。

界面定时读取已记录摘要，不轮询会话事件、子代理目录或 Git 进度。未提交/分支范围只在可见审查视图读取，分支内容是 merge-base → HEAD。任务 Diff 请求绑定不可变的比较清单 token，刷新/切文件时不会用旧 Diff 配新文件标题。

## 0.2.0：Git Review 增量扩展

没有修改任务基线、父子会话关联、事件捕获和冻结规则。Recorder 仅在 view 数据分支调用新增的 `git-review.js`；原输入区和原生 Diff 适配器保留。

- Staged：使用 `ls-files --stage -z` 读取 Index 的 blob，`cat-file --batch-check/--batch` 有界读取内容，与 HEAD 比较。未出生分支使用空基线；冲突 stage、链接和子模块明确列为缺口，不把它们伪装成删除。
- Unstaged：同一 Index 内容与规范化的 Working Tree 比较。Index 不包含的新路径标记未跟踪；未提交仍独立计算 HEAD → Working Tree，不叠加两个范围。
- Commits：只读 `git log`/`git show`，分支必须来自已有 refs 或 HEAD，Commit 输入只接受十六进制 Hash。提交说明作纯文本渲染。消息搜索使用 fixed-strings，Hash 前缀另外验证在所选分支历史中可达。
- 历史每页 50 条，返回不可变 tip 供后续分页使用，避免新增提交造成 skip 翻页重复；浏览器按 Hash 去重。分页 offset 上限 100000，搜索上限 200 字符，超限提示错误。没有执行 fetch、checkout、add、reset 或 commit。
- 普通提交对比其父提交；根提交对比空树；Merge 通过父序号选择一个真实父提交作普通双边 Diff，不把 combined diff 冒充单个父提交差异。复用现有 binary/oversized、rename 和行数解析。
- 提交内容不可变，选定提交不会定时重新计算；只有选择、父提交切换和手动刷新时读取。历史列表使用自己的有限高度滚动区，并保留手动加载按钮。

修正了 no-index numstat 在 `-z` 双路径格式中删除文件的 `/dev/null` 取路径问题，这是历史提交删除文件统计所需的小范围兼容修复。

语义依据：[git diff](https://git-scm.com/docs/git-diff)、[git status](https://git-scm.com/docs/git-status)、[git log](https://git-scm.com/docs/git-log)、[git show](https://git-scm.com/docs/git-show)。
