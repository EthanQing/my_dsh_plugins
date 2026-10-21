# 0.1.1 布局修复验证记录

适配已核实的 DSH Windows Desktop 0.2.1-rc.2。合集版本 0.6.1，配套 Git 审查插件 0.3.2。

## 源码确认与结构

- 官方 `shell.bottom` 跨越根 Grid 三列，是旧终端缩短左右栏的原因；终端自身并未使用 fixed。
- Git 原来注册在 `conversation.composer.dock`，但胶囊内部 fixed + 全局右栏偏移计算使它逃离输入区。
- 新终端从官方 `conversation.input.dock` 的局部元素引用获取主聊天 `data-conversation-content`，追加自己的 host，React portal 只挂此 host。右侧嵌入聊天排除，卸载时移除 host 并恢复标记。不移动原生节点、不使用生成类名。
- 官方原有滚动区继续包含消息与 sticky composer，终端作为该滚动区之后的同级 Flex 子项。宽度由父列决定，左右栏不参与高度计算。
- Git 行与输入卡片同宽，在输入框上方正常流右对齐；展开层局部 absolute 向上生长，不再测量 body/viewport/sidebar。
- 开始卡片使用公开的 Button、Menu 和 SVG 图标。卡片整体高度、padding、字体及描述模式参照原生 Guide；Shell 列表由官方 Menu 处理边界、焦点、外点及 Escape。

## 已执行检查

| 范围 | 结果 |
| --- | --- |
| 终端状态、偏好、菜单动作、渲染/ACK | 25 项 Node 测试通过 |
| 实际 Cordis + 官方 ClientTerminals | 局部服务隔离、独立保活、定向关闭及 detach-only 卸载通过 |
| 终端真实浏览器隔离夹具 | 347 项断言通过，0 浏览器异常 |
| Git 操作界面、提交输入、布局 | 22 项测试通过；浏览器项显式设置已有 Edge 路径执行 |
| Git 浏览器几何 | 88 项断言通过，覆盖 800/640/380/280/220px 列宽及短滚动区 |

终端浏览器夹具使用真实 React、ReactDOM portal、xterm 与三列 Grid，复现官方聊天语义 DOM 和 sticky 输入区。检查了左右栏顶部/中部/底部点击、右栏开合、主列宽度跟随、同会话右栏不得创建第二 host、240px 默认高度、120px 最小高度、真实鼠标拖高、键盘调整、最大化/恢复、动态输入区高度、隐藏和会话切换不调用 close。另在 900/720 逻辑宽度、125%/150% DPR 下验证控件边界与可点击性，并检查截图。

Git 夹具使用实际插件 CSS 与局部高度观察器，验证卡片最大宽度/侧边留白、向上展开、460px 上限、内部滚动、收起不挪动输入框、观察器清理，以及官方 overflow-y:auto + sticky 组合下不向上裁切。

## 两项必要边界

1. **最大化空间**：基础目标为聊天区可用高度减 48px，但实际输入区经常高于 48px。实现优先保留完整 composer 高度，避免最大化后输入框和 Git 胶囊不可操作。普通上限同样至少预留 180px 或更高的实际输入区。极小窗口允许低于常规最小高度。最大化不改写此前拖动高度。
2. **NuShell 候选**：首次优先选择 Host 已确认可启动的 NuShell，之后使用插件独立存储 `dsh-bottom-terminal.shell.v1`。本机已安装 NuShell 不等于 Host 候选中已有 NuShell；需要用户在现有 terminal-controller 的 shellCandidates 中追加 nu 或实际可执行文件路径。插件不伪造候选、不修改 Profile，也不覆盖原生终端偏好。

## 不属于本轮已完成的实机验收

隔离夹具的终端模型为测试替身；Menu/Button/SVG 使用明确标注的测试 shim。由此不能声称真实 NuShell/PTY、官方菜单碰撞与键盘导航、连接断开恢复或实际 Desktop 安装已经手动验收。未安装、更新或启用插件，未编辑 Desktop Profile，未重启 DSH。

用户安装后仍应在实际 Desktop 检查：左栏和右侧文件/浏览器/子代理标签组合；真实 Shell 的输入输出和尺寸变化；官方菜单边缘展开、Esc 与外点关闭；隐藏、切会话与恢复后的真实进程保活；Git 暂存/提交/推送确认行为。仓库中的修复与安装包已提供，实机启用由用户操作。
