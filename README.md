# ja-ae · 让 Claude 直接操控 After Effects

**ja-ae** 是一个 MCP 服务，以 Claude Code 插件形式提供。装好以后，你可以在 Claude Code 里用自然语言提需求，Claude 会直接在你**已经打开的 After Effects** 里完成这些事：建合成、做动画、调效果和第三方插件、看预览帧、出成片。

它只提供能力，**不带任何模板或固定流程**。做成什么风格、用什么做法，完全由你的需求决定。

- 支持 **Windows + After Effects 2022 及以上版本**（会自动识别你这台 AE 支持哪些功能）。
- 每一次改动都是 AE 里的一个撤销步骤；**绝不自动保存**你的工程。
- 零依赖：只需要 Node.js 18 或更新版本。

---

## 一句话安装（推荐）

在 Claude Code 里粘贴这句话：

```
请按 https://github.com/jefferyadventure519-byte/ja-ae-mcp 里 INSTALL_FOR_AI.md 的步骤，帮我安装并测试 ja-ae
```

Claude 会依次完成：下载代码、检查环境、注册 MCP、跑自检（14 个工具逐个调用，并生成一段简单动画），最后把报告告诉你。装好后**新开一个会话**，就能直接用了。

开始前请准备好：

| 项目 | 说明 |
|---|---|
| After Effects 2022 或更新版本 | 先把 AE 打开，并保存好当前工程（自检会新建一个测试工程） |
| AE 脚本权限 | AE 菜单：编辑 → 首选项 → 脚本和表达式 → 勾选「允许脚本写入文件和访问网络」 |
| Node.js 18 或更新版本 | https://nodejs.org 下载 LTS 版本 |

## 手动安装（二选一，不要两种都装）

**A. 插件方式**：在 Claude Code 对话框里依次输入

```
/plugin marketplace add jefferyadventure519-byte/ja-ae-mcp
/plugin install ja-ae@ja-tools
```

**B. 脚本方式**：下载本仓库后，在仓库目录里运行

```powershell
node scripts\install.js      # 检查环境，并注册到 Claude Code
node scripts\selftest.js     # 自检：14 个工具 + 一段简单动画
```

两种方式装好后，都要新开一个会话。

## 怎么用

直接说需求，例如：

- 「看看我 AE 里现在打开的工程有什么问题」
- 「给当前合成的标题做一个弹性出场，主色用 #C80F2E」
- 「把这个工程里所有文字换成思源黑体 Bold」
- 「把 Excel 里这 30 个人名做成 30 个字幕条合成，然后批量渲染」
- 「给第 3 个图层加上我装的某某插件，调得柔和一点」

## 14 个工具

| 类别 | 工具 | 作用 |
|---|---|---|
| 环境 | `ae_status` | AE 是否打开、版本和语言、当前工程状态、这台 AE 支持哪些功能 |
| 工程 | `ae_project` | 查看、新建、打开、关闭、保存、另存为工程；带未保存保护和防覆盖 |
| 素材 | `ae_import` | 导入文件、图片序列、PSD/AI，可直接放进合成 |
| 读取 | `ae_inspect` | 工程、合成、图层的完整属性树，包括关键帧、缓动和表达式；也用来摸清第三方插件的参数 |
| 搜索 | `ae_find` | 全工程搜索图层名、文字内容、效果、表达式、素材路径 |
| 体检 | `ae_check` | 缺失素材、本机没装的插件、表达式报错、缺失字体、未使用素材；工程里用了测试时有问题的第三方效果也会列出来 |
| 发现 | `ae_discover` | 实时列出这台 AE 能用的效果（含插件，带测试结论）、字体、渲染模板、动画预设、脚本；也能读出插件使用说明 |
| 创建 | `ae_create` | 合成，以及文字、形状、纯色、调整、空对象、摄像机、灯光、素材图层 |
| 修改 | `ae_set` | 图层属性、关键帧（带缓动）、表达式、父子级、轨道遮罩、层级顺序 |
| 施加 | `ae_apply` | 效果（AE 自带或任意已装插件，可同时设参数）、动画预设；已知会崩溃、弹窗、加不上的效果会被拒绝 |
| 脚本 | `ae_run_script` | 执行任意 AE 脚本，覆盖上面没有的功能 |
| 预览 | `ae_render_frames` | 渲染若干帧，拼成一张总览图交给 AI 看 |
| 输出 | `ae_render` | 在 AE 内渲染成片；AE 2022 可交给 Media Encoder |
| 撤销 | `ae_undo` | 撤销最近 N 步 |

## 第三方插件：哪些能用

我们在一台电脑上把 1332 个第三方效果逐个测了一遍（Windows 11，After Effects 2026，2026-10-13），结果已经做进 ja-ae：

| 结论 | 数量 |
|---|---|
| 可用（其中 82 个的「内容」要靠预设） | 1159 |
| 要先指定输入，或要人在插件界面里操作 | 69 |
| 测试时带水印（7）或疑似水印（2） | 9 |
| 加不上、弹窗、崩溃、渲染超时 | 95 |

装好以后不用做任何设置：

- Claude 列效果时，每个第三方效果都带测试结论；
- 加效果时，已知会让 AE 崩溃、弹窗或加不上的会被拒绝，并说明原因；
- 带水印的会提示「交付前先出一帧检查」；
- 「工程体检」会列出工程里已经用上的问题效果，手工加的也查得到。

可以直接问 Claude：「我电脑上哪些插件有已知问题？」

**注意**：结论跟 AE 版本、插件版本、插件授权有没有生效都有关。你的电脑和测试机不一样时，这份名单只是提示。任何第三方效果用于交付前，都请渲染一帧看一眼。

- 完整结果：[docs/plugin-test-results.md](docs/plugin-test-results.md)，逐个效果的表格：[docs/fx_tests.csv](docs/fx_tests.csv)
- 用法和坑：[plugins/ja-ae/docs/plugin-guide.md](plugins/ja-ae/docs/plugin-guide.md)

## 能做什么、不能做什么

- **能**：AE 脚本能做到的几乎所有事，包括已安装的第三方插件参数和动画预设。
- **不能或受限**：
  - 需要手工点选或后台解析的功能，例如摄像机跟踪、Roto 笔刷、内容识别填充。
  - 插件自带的专属界面。
  - 少数效果的特殊参数，例如曲线。
  - Claude 看不到实时播放，只能看抽帧。
- **AE 2022**：渲染队列没有 H.264（2023 版起才有），可以交给 Adobe Media Encoder 渲染；AE 2022 没有字体接口，改为扫描系统字体文件，Adobe Fonts 激活的字体列不出来。

## 安全

- 工程有未保存改动时，新建、打开、关闭工程都会被拦下，先问你。
- 运行外部程序（`system.callSystem` 等）默认会被拦截。但请知道：执行 AE 脚本本质上就是在你电脑上运行代码。
- 工程里的图层名、文字和素材路径会发给 AI 服务。处理涉及保密内容的工程前请先确认。
- Claude 操作 AE 时，你不要同时在 AE 里手动操作。

## 常见问题

| 现象 | 处理 |
|---|---|
| `AE_NOT_RUNNING` | 先打开 AE |
| `AE_TIMEOUT` | AE 里可能有弹窗没关、正在渲染，或者脚本权限没勾 |
| AE 装在非默认位置 | 一般能自动识别；识别不到时，把环境变量 `JA_AE_EXE` 设为 AfterFX.exe 的完整路径 |
| 想卸载 | `node scripts\install.js --uninstall`；插件方式安装的用 `/plugin uninstall ja-ae@ja-tools` |

---

<sub>ja-ae: an MCP server (Claude Code plugin) that lets Claude operate a running Adobe After Effects 2022+ on Windows — 14 generic tools (inspect, create, keyframes, effects/plugins, presets, scripts, preview frames, render, undo), no templates. Install by asking Claude Code to follow INSTALL_FOR_AI.md.</sub>
