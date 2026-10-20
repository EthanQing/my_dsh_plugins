# my_dsh_plugins

EthanQing 的 DSH 插件仓库。现有插件独立维护，仓库根目录提供可通过 GitHub 安装的 **bundle 合集**；也可从 GitHub Release 下载单插件安装包。

支持 **DSH 0.2.1-rc.2 / Node 24+**。运行产物已提交，安装时不编译、不运行 prepare/install 脚本，不下载另一份 DSH。安装、更新、卸载、启用与重启全部由使用者自行操作。

| 插件 | 用途 | 说明 |
|---|---|---|
| [dsh-markdown-editor](dsh-markdown-editor/README.md) | Markdown 原文辅助、消息渲染与折叠 | 非 WYSIWYG；保守保留引用等原生内容 |
| [dsh-message-edit-retry](dsh-message-edit-retry/README.md) | 编辑消息、继续、重试 | 编辑/重试通过 fork 新会话发送 |
| [dsh-session-delete-manager](dsh-session-delete-manager/README.md) | 会话与项目范围删除 | 删除行为详见插件说明 |
| [dsh-smart-session-title](dsh-smart-session-title/README.md) | 智能会话标题 | 启用时需替换官方标题 LLM provider |

## 从 GitHub 安装合集

**先将本次仓库改动提交并推送到 GitHub，远端才具有这个安装入口。** 在 Desktop 已初始化且完全退出后，用其自带 CLI 手动执行：

```powershell
& 'D:/Programs/DSH/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add 'github:EthanQing/my_dsh_plugins#main'
```

`main` 会随仓库变化。需要固定版本时，将 `#main` 换成你已发布的 tag 或完整 commit SHA。其他机器请使用自身 Desktop 的 `resources/runtime/cli/bin/dsh.cmd` 路径；已经注册 Desktop CLI 的机器可使用 `dsh` 命令。

合集的包名是 **my-dsh-plugins**，提供四个已有插件的代码，**默认全部关闭**，也不禁用官方标题功能。根 bundle 使用包内相对路径加载各插件，保留它们原有的 manifest、Host 入口与浏览器模块 ID；不需要把四个目录复制到 Profile，也不创建第五个功能插件。

**合集与独立包二选一。** 如果已经单独安装了本仓库的插件，不要叠加安装合集，否则相同插件 ID/模块可能重复。请自行移除旧的独立包后切换合集，或继续使用下面的单插件 Release 包。

## 自行选择启用

安装合集后，将需要的示例内容**追加或合并**到你的 `~/.dsh/profiles/desktop/cordis.patch.yml`，保留现有配置；不要用示例文件覆盖整个 Profile patch。然后自行启动/重启 DSH。

- [仅启用 Markdown 插件](examples/markdown-editor.patch.yml)
- [启用消息编辑/重试](examples/message-edit-retry.patch.yml)
- [启用会话删除管理](examples/session-delete-manager.patch.yml)
- [启用智能标题](examples/smart-session-title.patch.yml)：同时禁用 `session-title-llm`，因为标题服务只接受一个 provider。

停用某插件时将对应行改为 `disabled: true`。停用智能标题时，同时将 `session-title-llm` 恢复为 `disabled: false`。

卸载合集由你执行：

```powershell
& 'D:/Programs/DSH/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop remove my-dsh-plugins
```

如果曾手动追加启用/标题替换片段，卸载时也需自行移除对应片段，恢复官方标题 provider。安装命令只负责包与 bundle，不会撤销用户后来写入的 Profile patch。

## 只安装某个插件：GitHub Release

标准 `github:owner/repo` 安装读取仓库根包，不能把 GitHub 的 `tree/main/某子目录` 页面当作独立 npm 包安装。需要单独插件时，使用本仓库 Release 中的预构建 `.tgz`。

仓库维护者执行以下命令只进行检查与打包，不安装插件：

```powershell
npm run check
npm run pack:plugins
```

`dist/` 输出合集、四个独立包和 `SHA256SUMS.txt`。独立包沿用各自的原始 bundle，安装它意味着启用该插件；智能标题独立包还会切换官方标题 provider。请按需选择。

发布流程：将改动提交并推送；推送你选择的 `v*` tag 后，GitHub Actions 检查并打包，创建 **Draft Release**。由维护者核对附件后手动发布。普通 push/PR 只上传 Actions artifacts，不发布 Release。不执行 npm install、不修改任何 Desktop Profile。

发布后，可在 DSH 插件管理器中粘贴某个 `.tgz` 的 GitHub Release 下载链接，或下载到本地后自行执行：

```powershell
# 示例文件名；使用你实际下载的包路径。
& 'D:/Programs/DSH/resources/runtime/cli/bin/dsh.cmd' plugin --profile desktop add './dsh-markdown-editor-0.3.1.tgz'
```

Release 尚未发布前，不存在可用的附件下载地址。更新时选择新的 commit/tag 或 `.tgz`，按当前 DSH 插件管理器的更新流程自行操作。

## 开发与验证

根目录检查不依赖第三方安装：验证包入口、浏览器模块 ID、locale、语法、合集默认关闭及打包文件。`npm run pack:plugins` 使用 `npm pack --ignore-scripts`，只使用已有运行产物。

修改插件源码后，先按各插件 README 构建并提交 `lib/`。Markdown 插件的构建与测试依赖由开发者自行安装；不要把本机链接、node_modules、Profile 或凭据提交到仓库。

机制依据：[官方 bundle/GitHub 安装文档](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/develop/basic/publish.zh.md)、[Desktop 自带 CLI](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.zh.md#bundled-command-runtime)、[客户端按入口查找所属 manifest](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/modules/src/index.ts)。
