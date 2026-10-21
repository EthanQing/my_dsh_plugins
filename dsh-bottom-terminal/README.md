# 底部集成终端 · dsh-bottom-terminal

适配已核实的 DSH Windows Desktop **0.2.1-rc.2**。插件源码、第三方渲染源码、构建脚本和预编译产物都保留在本目录。

## 使用与当前版本限制

插件在官方 `shell.bottom` 布局位置提供多标签终端 Dock。新建默认进入底部，支持 Shell 选择、标签切换与重命名、关闭标签、拖动上边界调整高度、折叠和最大化。关闭/隐藏面板不关闭其中进程；只有关闭终端标签才发送终止请求。各会话保留自己的标签和归属，切会话不结束其他会话的进程。

右侧引导页的原有“新建终端”卡片通过官方 keyed 插槽扩展改为默认在底部打开，并提供 Shell 选择及“在右侧打开”。输入框旁的“终端”入口可以重新显示已隐藏的面板，不额外创建进程。已有其他自定义终端引导扩展时，保留它的入口。

**本版本不能安全覆盖官方 `terminal.new`。** 当前 shortcuts 服务拒绝重复命令 ID，也没有公开替换处理函数的接口。因此本插件注册独立的 `terminal.bottom.new`，默认快捷键为 **Ctrl+Shift+`**，并提供底部新建入口；原生 `terminal.new` / Ctrl+` 仍打开右侧终端。默认键位冲突时不抢占已有绑定，可在 DSH 快捷键设置中选择底部命令并配置。希望复用 Ctrl+` 时，先在官方快捷键设置中解除原生命令绑定，再给底部命令绑定；这不会改变原生命令 ID 的处理行为。

底部菜单也可选择在原生右侧新建终端。已有终端不在两处同时挂载或自动迁移；两种位置的进程保活独立管理。官方右侧终端组件应保持开启。

Dock 使用真实布局行，会缩短上方主区和侧栏的可用高度，而不覆盖聊天输入框、右侧审查或底部状态栏。最大化占用可用底部区域，不进入悬浮全屏。`shell.bottom` 在本版为单插槽，如已有其他底部扩展占用，插件会避免覆盖它。

## NuShell

通过 **DSH Host 原生 shell discovery** 发现和校验 Shell；界面不直接拼接可执行路径。现有控制器默认候选未包含 `nu`，需要在现有 `terminal-controller` 配置中添加候选（不要再创建第二个控制器实例）：

```yaml
- id: terminal-controller
  config:
    shellCandidates:
      - zsh
      - bash
      - fish
      - pwsh
      - powershell
      - cmd
      - nu
```

如果已有自定义 `shellCandidates`，保留它们并追加 `nu`。PATH 找不到时，把 `nu` 替换为实际绝对路径，例如本次核实的：

```yaml
      - C:/Users/qc/AppData/Local/Programs/nu/bin/nu.exe
```

这台电脑的 NuShell 版本为 **0.112.1**。Host 会用真实可执行文件和 `-i` 交互参数启动，沿用 DSH 的 Windows PTY、ANSI、输入、终端尺寸与控制权协议；没有嵌套 Bash，也没有自建 PTY 服务。NuShell 的补全、历史与配置由其自身管理。

配置生效后，底部和原生右侧的 Shell 菜单都会获得 NuShell。选择一次 NuShell，原生 `selectShell` 会把偏好保存到当前站点，重新打开 DSH 后仍有效。保留其他 Shell，且不强制覆盖现有浏览器选择。如果还希望为尚无浏览器偏好的新环境设置 Host 默认，可额外配置：

```yaml
    shell:
      path: C:/Users/qc/AppData/Local/Programs/nu/bin/nu.exe
      name: NuShell
      args: ['-i']
```

修改现有 Profile 或控制器配置前须确认。源码中的示例不会自行修改 Profile。恢复标签不等于进程跨 Host 重启持久；DSH Host 退出后原生终端进程可能结束，重新启动后需按提示新建。

## 安装

预编译包无需安装构建工具。可以作为合集组件安装并启用 `dsh-bottom-terminal`，或从本目录生成独立 `.tgz` 后通过 DSH 插件管理安装。二者选择一种，避免同一插件被重复加载。

```sh
npm pack --ignore-scripts
```

安装后启用组件。NuShell 配置见上节和 `docs/desktop-nushell.patch.yml`；具体本机应用前应保留备份并确认现有配置。重启 DSH Desktop 后加载新的 Client 和 Host 配置；插件不会自行重启应用。

## 构建与维护

```sh
npm run build
npm run check
npm test
```

本地构建需要 esbuild 0.25.12，也可通过 `DSH_ESBUILD_MODULE` 指定现有 esbuild 模块的文件 URL。安装/更新插件不会运行 install、prepare 或 prepack 脚本，发行包直接包含 `lib/`。

xterm 6.0.0 与 FitAddon 0.11.0 的完整发布源码位于 `vendor/`，不会在运行时下载。插件通过官方模块加载器复用公开 `ClientTerminals`，并在 `ctx.isolate('webTerminals')` 中创建局部实例，共享原生 Remote 服务。这样不会覆盖原生侧栏的 `retainTabs` 清单；底部所有会话的标签都会参与自身保活，DOM 卸载只 detach，明确关标签才 close。

`src/terminal-view.js` 负责 xterm 渲染适配，解析完成后才向官方模型确认输出，保留其背压和恢复机制。升级 DSH 时应重新检查公开模型及 `shell.bottom` / shortcuts 契约；不依赖官方私有终端 chunk、DOM 搬运或全局按键劫持。

`node scripts/verify-installed-api.mjs <经校验的 DSH node_modules/@deepseek-ai 目录>` 可选验证实际版本的 Cordis 隔离、独立保活与定向关闭；它使用模拟传输，不连接用户终端。完整 GUI、真实 NuShell 交互及实际进程行为仍需在 Desktop 中验收。

参考：官方 [终端 UI](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-sidebar-terminal/README.zh.md)、[Terminal Controller](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/api/terminal-controller/README.zh.md)、[布局](https://github.com/deepseek-ai/deepseek-harness/blob/master/packages/client/ui-layout/README.zh.md)、[NuShell 安装说明](https://www.nushell.sh/book/installation.html)。开发判断以本机已校验的 0.2.1-rc.2 发布代码为准。
