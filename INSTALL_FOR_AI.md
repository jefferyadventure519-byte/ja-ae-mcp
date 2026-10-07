# 给 Claude Code 的安装指令：ja-ae（After Effects 控制 MCP）

> 本文件写给 **Claude Code**。用户只需对你说：「请按 https://github.com/jefferyadventure519-byte/ja-ae-mcp 里 INSTALL_FOR_AI.md 的步骤，帮我安装并测试 ja-ae」。

你的任务：在用户这台 Windows 电脑上安装 ja-ae，把它接入 Claude Code，然后用自检脚本验证 14 个工具都能用，并生成一段简单的 AE 动画。每完成一步，用一句话告诉用户结果。

## 硬性规则

1. **只支持 Windows。** 系统不是 Windows 时，告诉用户后停止。
2. **不改 AE 的首选项。** 不关闭或丢弃用户未保存的 AE 工程，不替用户点任何 AE 弹窗。
3. 需要用户动手时（安装 Node、打开 AE、勾选脚本权限、保存工程），**一次只请他做一件事**，并写清楚具体点哪里。
4. 不替用户安装 Node.js。缺少 Node 时，给出官方下载地址，等用户装好再继续。
5. 安装目录固定为 `%USERPROFILE%\.ja-ae-mcp`，不要装到别处。
6. 命令一律用 PowerShell 执行。

## 步骤

### 第 0 步：说明要做什么

告诉用户，接下来会依次做这几件事：
- 下载 ja-ae；
- 检查环境；
- 把它注册进 Claude Code；
- 跑一次自检。

自检会在 AE 里新建一个测试工程，并替换掉当前打开的工程。所以请用户先确认：**AE 已经打开，当前工程已经保存**。

### 第 1 步：检查 Node.js

```powershell
node -v
```

需要 v18 或更新版本。没有或版本太低时，请用户从 https://nodejs.org 下载安装 LTS 版本，装好后**重开 Claude Code**，再从第 1 步开始。

### 第 2 步：下载或更新代码

有 git 时：

```powershell
$d = "$env:USERPROFILE\.ja-ae-mcp"
if (Test-Path "$d\.git") { git -C $d pull --ff-only } else { git clone https://github.com/jefferyadventure519-byte/ja-ae-mcp.git $d }
```

没有 git 时（`git --version` 报错），下载 zip：

```powershell
$d = "$env:USERPROFILE\.ja-ae-mcp"; $z = "$env:TEMP\ja-ae-mcp.zip"; $x = "$env:TEMP\ja-ae-mcp-x"
Invoke-WebRequest "https://codeload.github.com/jefferyadventure519-byte/ja-ae-mcp/zip/refs/heads/main" -OutFile $z
if (Test-Path $x) { Remove-Item $x -Recurse -Force }
Expand-Archive $z $x -Force
if (Test-Path $d) { Remove-Item $d -Recurse -Force }
Move-Item "$x\ja-ae-mcp-main" $d
```

下载失败（网络连不上 GitHub）时，告诉用户需要能访问 GitHub 的网络，然后停止。

### 第 3 步：检查环境并注册

```powershell
node "$env:USERPROFILE\.ja-ae-mcp\scripts\install.js" --json
```

读取输出的 JSON：

- `ok: true` 且 `action.ok: true`：已注册成功。
- `checks` 里 `level: "error"` 的项必须先解决：
  - `ae_installed` 失败：没找到 AE。请用户告诉你 `AfterFX.exe` 的完整路径，然后用 `$env:JA_AE_EXE="完整路径"` 重跑本步。
  - `ae_version` 失败：AE 版本低于 2022，ja-ae 不支持。
- `needsUserAction` 里的项要请用户处理：
  - `ae_running`：请用户打开 After Effects。
  - `ae_scripting_pref`：请用户在 AE 里点「编辑 → 首选项 → 脚本和表达式」，勾选「允许脚本写入文件和访问网络」。
  - `other_ae_mcp`：用户已经装了别的 AE 类 MCP。告诉他两套同时存在可能让 AI 混用，由他决定是否保留；**你不要擅自删除**。
  - `plugin_route`：用户已经通过 `/plugin` 装过 ja-ae。这时**不要**再用脚本注册，跑一次 `install.js --uninstall` 撤掉本次注册即可。

### 第 4 步：自检

确认 AE 已打开、当前工程已保存后运行（通常 1–5 分钟，AE 在此期间会忙，请用户别操作 AE）：

```powershell
node "$env:USERPROFILE\.ja-ae-mcp\scripts\selftest.js"
```

- 退出码 0：全部通过。
- 退出码 1：有工具没通过，原因见报告。
- 退出码 2：自检被安全中止。原因写在输出里，最常见的是 AE 工程有未保存改动，请用户保存后重跑。

运行结束后：

1. 读取输出里的报告路径 `selftest_report.md`，把「X/14 个工具通过」和失败项告诉用户。
2. 用 Read 工具打开同目录下的 `contact_sheet.png`（6 帧预览总览），描述你看到的动画：标题从模糊渐清并上移，红色色块展开。
3. 告诉用户成片和工程文件的路径，他可以在 AE 里打开 `ja-ae-selftest.aep` 查看。

### 第 5 步：收尾

告诉用户：

- **新开一个 Claude Code 会话**后，ja-ae 的 14 个 `ae_*` 工具才会出现。
- 可以直接这样说：
  - 「看看我 AE 里现在打开的工程有什么问题」
  - 「给当前合成的标题做一个弹性出场」
  - 「把这个工程里所有文字的字体换成某某字体」
- 每次改动都能在 AE 里用 Ctrl+Z 撤销，ja-ae 不会自动保存工程。

## 常见问题

| 现象 | 处理 |
|---|---|
| `AE_NOT_RUNNING` | 请用户打开 AE |
| `AE_TIMEOUT` | AE 里有弹窗没关、AE 正在渲染，或者脚本权限没勾 |
| 自检里 `ae_render` 失败，而 AE 是 2022 版 | AE 2022 的渲染队列没有 H.264，属正常。可以改用 `use_ame: true` 交给 Media Encoder 渲染 |
| 字体相关失败，而 AE 是 2022 版 | AE 2022 没有字体接口，ja-ae 会改为扫描系统字体文件；Adobe Fonts 激活的字体列不出来 |

## 卸载与更新

- 卸载：`node "$env:USERPROFILE\.ja-ae-mcp\scripts\install.js" --uninstall`
- 更新：重复第 2 步和第 3 步，然后新开会话。
