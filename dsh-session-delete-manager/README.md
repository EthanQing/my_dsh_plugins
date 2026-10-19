# dsh-session-delete-manager

DSH Web 插件：在侧栏项目（Workspace）与会话菜单里**真正删除**会话记录，支持项目内多选、全选、二次确认与运行中保护。原生风格、明暗主题适配，不新增独立管理页。

## 功能

- **项目菜单「多选会话」**：项目行 `…` 菜单新增入口，并保留原生「删除工作区」在最后。进入后，当前项目已渲染的会话行前出现复选框；已选数量、全选/取消全选、删除所选、取消都在左下角浮动条中完成。全选与计数覆盖项目里尚未展开/未渲染的会话，复选框只出现在已渲染行。
- **会话菜单「删除会话」**：单条会话行 `…` 菜单底部新增红色菜单项；二次确认后删除当前会话。
- 删除完成后刷新会话列表并退出批量模式；批量模式显示失败数量并保留失败项，单条删除在确认框内显示具体原因。
- 运行中的会话不可删除；归档会话、子代理会话和空白会话不会显示单条删除入口。
- 批量选择仅限当前项目；Host 按会话 id 删除（单条删除只作用于所选会话），不会删除工作区或项目目录。

## 删除语义

删除请求由本插件的 Host 路由 `/dsh-session-delete-manager` 处理（仅 POST，JSON body 上限 64 KiB，单次最多 200 个会话）。

Host 只删除以下两类**已存在的会话产物**：

1. `<DSH_HOME>/sessions/<project-key>/<encoded-session-id>/` 日志目录；
2. `<DSH_HOME>/storages/session_projcache/sessions/<session-id>.json` 投影缓存。

删除前会校验会话 ID、目录真实路径、符号链接与常规文件类型，并用自写的非跟随递归删除清理日志目录。批量删除按请求顺序逐条执行；单条失败不会掩盖其他条结果。

运行中的会话会被拒绝。Host 还会先通过 Workspace 的归档集合临时隐藏会话，再进行缓存/日志删除；中途失败会尽力恢复归档状态。归档集合本身不清理。

> 注意：当前 DSH 客户端没有公开的 `sessions.clear` 时，删除“正在查看”的会话后，会话列表会刷新，但当前会话视图可能仍需手动切换到其他会话。插件不会调用 `detachSession`、`agent.cancel`，也不会停止任何 Agent。

## 安全边界

- 仅当用户在界面中完成二次确认后才发起删除；没有自动清理或后台定时删除。
- 不修改 DSH 内核或 `app.asar`，不依赖第三方运行时依赖。
- 不使用 `window.confirm`，不注册管理页面；仅注册一个私有 POST 删除路由和一个同源 GET token 端点；插件运行时不写 Profile（安装步骤会修改 Profile 的依赖与 bundles）。
- 删除路由仍校验插件 token（恒定时间比较），token 校验先于读取 body 和删除动作。客户端优先从同源 `GET /dsh-session-delete-manager/token` 获取 token；端点响应同时支持 JSON 与 HTML meta 提取，作为兼容回退。当前 Desktop 的 frontend-static 对未知路径返回 404，因此实际修复依赖 Host 重启后的 JSON 端点。失败后再回退当前页面 index 的 meta（纯 Web 兜底），最后回退 DOM meta。
- 桌面 Electron 的 index 由 desktop host 的 boot 注入构建，raw `tapIndex` 不参与，因此客户端不能只依赖 `<head>` meta；桌面修复依赖 Host 重启后的 token JSON 端点。旧 Host 没有该端点，刷新页面只能加载新客户端，不能补出旧 Host 缺失的端点。桌面下相对路径请求由 `dsh-app://app` scheme handler 转发到 Host。
- token 端点要求自定义头与同源校验（`Sec-Fetch-Site: same-origin`，或 Origin/Referer host 匹配，或桌面代理下无 Origin/Sec-Fetch-Site 且带 Host 认证 cookie）；本路由不处理 CORS，跨源请求被自定义头预检挡住；端点不写日志、不缓存。
- 日志只记录数量/错误码，不记录会话标题或完整路径。

## 结构

```text
dsh-session-delete-manager/
├── package.json
├── cordis.patch.yml
├── lib/
│   ├── index.js        # Host ESM：token 注入/端点、删除路由、路径校验、递归删除
│   └── client.js       # 手写浏览器 bundle：window.__ModuleLoader__.load
├── locale/
│   ├── zh.json
│   └── en.json
├── icon.svg
├── LICENSE
└── README.md
```

无构建步骤、无测试框架、无第三方依赖。运行时要求 DSH Web 客户端 `0.2.1-rc.2` 或兼容版本，Node.js >= 22。

## 开发与验证

```bash
node --check lib/index.js
node --check lib/client.js
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
node --input-type=module -e "import('./lib/index.js').then(m => { if (typeof m.apply !== 'function') process.exit(1) })"
```

本目录只包含插件源码；安装、Profile 写入与重启 DSH 由部署者执行。

## 安装与回滚（由部署者执行）

源码不执行安装；以下安装步骤由部署者执行。

安装（桌面版示例）：

```bash
dsh plugin --profile desktop add link:C:/Users/qc/Desktop/qingyi/dsh-plugins/dsh-session-delete-manager
```

使用 `link:` 安装后，必须显式把包名追加到 `C:\Users\qc\.dsh\profiles\desktop\package.json` 的 `dsh.profile.bundles` 数组，否则 Profile 启动时不会合并本插件的 `cordis.patch.yml`：

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "…existing bundles…",
        "dsh-session-delete-manager"
      ]
    }
  }
}
```

随后重启 DSH，并刷新 Web GUI。**不要**用 `--dump-config` 验证（桌面版会拒绝该模式）；改为检查上面的 `package.json`、`cordis.patch.yml` 以及页面中的菜单/确认框。

回滚：

1. 先从 `dsh.profile.bundles` 移除 `"dsh-session-delete-manager"`；
2. 再用所用 DSH CLI 版本的插件移除/卸载命令删除该 `link:` 依赖；
3. 重启 DSH 并刷新页面。

## 手动验收建议

1. **完全重启 DSH** 后刷新 Web GUI，在项目行 `…` 菜单中看到「多选会话」，原生「删除工作区」仍在最后。
2. 进入批量模式，确认当前项目对应会话行出现复选框，已选计数正确；折叠项目中的会话也计入总数。
3. 选择若干会话，点击「删除所选」，确认对话框；取消不删除。
4. 对单条非运行会话执行「删除会话」，确认后列表刷新；运行中会话的菜单项为禁用。
5. 在明暗主题下检查菜单、浮动条、确认框的原生观感，以及键盘 Tab/Escape 行为。
