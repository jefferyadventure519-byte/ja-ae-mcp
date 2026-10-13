# 第三方插件测试结果

> 测试环境：Windows 11，After Effects 2026（26.0），2026-10-13。共 1332 个第三方效果。
>
> **适用范围**：结论跟 AE 版本、插件版本、插件授权有没有生效都有关。你的电脑只要有一样不同，结果就可能不同。这份名单是「已知情况」，不是保证。任何第三方效果用于交付前，都要渲染一帧看一眼。

## 1. 结论

| 结论 | 数量 | ja-ae 怎么处理 |
|---|---|---|
| 可用：能加上、能出画面、参数可以用脚本改 | 1077 | 正常使用 |
| 可用，但「内容」要靠预设（模型、发射器、文字、风格、曲线等） | 82 | 正常使用，返回里提示哪些是内容参数 |
| 要先指定输入：默认输出是纯色、空画面或提示文字 | 68 | 放行，提示要先做什么 |
| 要人在插件界面里操作 | 1 | 放行，提示要人操作 |
| 测试时输出带水印或未授权提示 | 7 | 放行，提示交付前必须出帧检查 |
| 疑似水印，没有确认 | 2 | 同上 |
| 加不上、加上时弹窗、崩溃、渲染超时 | 95 | 拒绝并说明原因（见第 6 节） |

前两类合计 1159 个，占 1332 个的 87%。

「可用」和「内容靠预设」里有 332 个在默认参数下画面没有变化（调色、抠像、修复类居多）。这类只确认了能加、能渲染、没有水印，要调参数或换合适的素材才看得出效果。

## 2. 怎么测的

| 轮次 | 做法 | 数量 |
|---|---|---|
| 冒烟 | 每个效果加到图层上，读出全部参数和类型，记录报错、弹窗、崩溃 | 1332 |
| 重点深测 | 每项渲染两帧：默认值一帧；用脚本改颜色、强度、位置并打关键帧后一帧 | 65 |
| 全量出画面 | 其余效果各渲染一帧，和不加效果的基准画面比；转场类把进度设到一半；逐张看总览图查水印 | 1184 |

每个效果的结论见 [fx_tests.csv](fx_tests.csv)（Excel 可以直接打开）。工具用的是同一份数据：`plugins/ja-ae/data/fx_tests.json`。

## 3. 不能用的 95 个

**加不上（86 个）**：加的时候报错，效果没有加上。

| 分类 | 数量 | 效果 |
|---|---|---|
| NF's Plugins-Cell | 23 | F's CellGrad、F's CellLineEraser、F's ColorChange、F's ColorChangeFromPoint、F's ColorChangeSimple、F's ColorKey、F's EdgeLine、F's EdgeLine-Hi、F's IroTore、F's IroToreAdjacent、F's LineTrace、F's MainLineRepaint、F's Paint、F's PaintMalutPaint、F's PixelExtend、F's PixelReplace、F's PixelSelector、F's SelectColor、F's SelectedBlur、F's ShitsuKanBlur、F's Thin、F's UsedColorList、F's colorThreshold |
| NF's Plugins-Filter | 20 | F's ChromaticAberration、F's ColorMatKey、F's Extract-Hi、F's Filter、F's Flare、F's LineDetection、F's Mosaic、F's NamiGarasu、F's OutLine、F's Posterization8bit、F's Scanline、F's ScreenShakeDir、F's ScreenShakeMM、F's Shine、F's Star、F's Star_Colorful、F's VideoGrid、F's VideoLine、F's VideoLine2nd、F's whiteInOut |
| NF's Plugins-Draw | 13 | F's Spark、F's SparkGrand、F's SparkMult、F's SparkRing、F's SparkStorm、F's TouchDraw、F's TouchDrawCenter、F's TouchDrawStraght、F's grayToWaveLine、F's sputteringAlpha、F's sputteringCircle、F's sputteringRect、F's sputteringSplash |
| NF's Plugins-Channel | 11 | F's AlphaFix、F's ChannelShift、F's CreateAlpha、F's EdgeBlur、F's MaskFromRGB、F's MaskFromRGB_Multi、F's Max、F's Max_Kasumi、F's Premultiply、F's RgbToAlpha、F's alphaThreshold |
| NF's Plugins-Colorize | 11 | F's CCplus、F's FillColor、F's HLS_Reverse、F's RGBAControl、F's ToGray、F's Toner、F's YuvControl、F's grayToColorize、F's grayToCountourLine、F's graytoneToColorize、F's smokeThreshold |
| NF's Plugins-Noise | 6 | F's AnimatedNoise、F's ChannelNoise、F's RandomLineNoise、F's RandomMosaic、F's RandomMosaic2nd、F's RandomShift |
| NF's Plugins-expression | 2 | F's ExpsColors、F's ExpsPos |

**加上时弹出插件自己的窗口（6 个）**：脚本被挡住，要人去点取消。

| 分类 | 数量 | 效果 |
|---|---|---|
| Red Giant Text Anarchy | 4 | Cool Text、Screen Text、Text Hacker、Text Matrix |
| CROSSPHERE | 1 | PBAccelerator |
| Image Lounge | 1 | Text Scroll |

**崩溃和超时（3 个）**

| 效果 | 分类 | 现象 |
|---|---|---|
| Stardust | Superluminal | 加上即崩溃 |
| Lockdown | Vranos | 渲染时崩溃 |
| Warping Wheels | Picture Instruments | 渲染超时 |

## 4. 测试时带水印的 7 个，疑似 2 个

插件授权没有生效时，输出会带水印或提示文字。下面这些在测试机上是这样；你的电脑上可能不同，也可能有别的效果带水印。

| 分类 | 数量 | 效果 |
|---|---|---|
| Black Ops Effects | 1 | Rescue Matte Filler |
| CROSSPHERE | 1 | Power Sphere |
| JAe Tools | 1 | Real Glow |
| Keller.io | 1 | Superpose 2 |
| Plugin Everything | 1 | Bezier Node |
| Prosya | 1 | Fog |
| RG Blurs and Glows | 1 | uni.Glow |

疑似（默认画面上有网格线或辅助线，可能是水印，也可能是参考线）：

| 分类 | 数量 | 效果 |
|---|---|---|
| Vimager | 1 | Contrast Up |
| 枪火+示波器 | 1 | Bang |

判断水印看的是画面上有没有多出东西，例如交叉线、铺满的字样、提示文字。

## 5. 要先处理才能用

**要先指定输入（68 个）**：默认输出是纯色、空画面或提示文字。多数是需要第二个输入、运动矢量、外部文件或先做分析的效果。

| 分类 | 数量 | 效果 |
|---|---|---|
| Red Giant Text Anarchy | 11 | Font Changer、Gradient、Gradient Path、GridLines、GridSquares、Hairlines、Path Distort、Smooth Tiler、Text Grid、Text Spiral、Type On |
| RE:Vision Plug-ins | 8 | Motion Vectors: Create、RE:Flex Motion Morph、RE:Map Inverse UV、RE:Map UV、RSMB Pro Vectors、SK ZBlur、Shade Normals 5、Twixtor Pro, Vectors In |
| Sapphire 时间 | 5 | S_匹配闪烁颜色、S_同步闪烁、S_帧变化检测、S_指定区域同步闪烁、S_指定区域同步颜色闪烁 |
| PSOFT | 4 | P_ColorSelection、P_Fill、P_PathStroke、P_Pencil+ 4 Line |
| RG Stylize | 3 | uni.Analog、uni.ChromaTown、uni.VHS |
| Sapphire 转场 | 3 | S_TV通道变换、S_光泄漏溶解、S_溶解超亮 |
| BCC 图像恢复 | 2 | BCC 光学稳定器（要先点分析）、BCC 重定义（要加在合成尺寸的纯色层上并指定输入） |
| Buena Depth Cue | 2 | Atmosphere、Depth |
| Composite Wizard | 2 | Deluxe Edge Finder、Deluxe Edge Finder EZ |
| Video Copilot | 2 | Element（要先在它的界面里搭场景）、Sure Target |
| irrealix | 2 | Volna、freeGradient |
| BCC 3D对象 | 1 | BCC 挤压EPS（要先选外部文件） |
| BCC 匹配运动 | 1 | BCC 匹配运动（要先指定前景） |
| BCC 变形 | 1 | BCC+ST Map（要先指定贴图） |
| BCC 时间 | 1 | BCC+音频可视化（要先选音频图层） |
| BCC 粒子 | 1 | BCC 幻影粒子（要先在它的界面里选发射器） |
| BCC 键控&混合 | 1 | BCC+光线包裹（要先指定背景图层） |
| Color Manipulation (timeinpixel | 1 | Nobe Color Remap |
| EFX keying/alpha | 1 | EFX Color select |
| FAN | 1 | b_stroke |
| FEC 变形 | 1 | FEC 倾斜剪影 |
| FEC 风格化 | 1 | FEC 喷胶枪 |
| GBS | 1 | GBDeflicker4（要先分析） |
| Plugin Everything | 1 | Monospacer |
| RG Particles and 3D | 1 | Lux |
| RG Text | 1 | uni.Text Tile |
| RG Transitions | 1 | uni.Blinds |
| RG VFX | 1 | Supercomp |
| RM | 1 | Diopter |
| Rowbyte | 1 | Color Wiggle |
| Sapphire 渲染 | 1 | S_形状 |
| Vimager | 1 | StyleX |
| jawset | 1 | Turbulence2D |
| minning.de Normality | 1 | Normality |
| proDAD | 1 | Mercalli 4.0（要先分析） |

**要人在插件界面里操作（1 个）**

| 分类 | 数量 | 效果 |
|---|---|---|
| Neat Video | 1 | Reduce Noise v6 |

**内容靠预设（82 个）**：数值参数可以用脚本改；内容要在插件界面里选一次并存成 .ffx 预设，以后由脚本载入。每个效果有哪些内容参数，见 fx_tests.csv 的「说明」列。

| 分类 | 数量 | 效果 |
|---|---|---|
| RG Text | 7 | uni.Hacker Text、uni.Numbers、uni.Screen Text、uni.Title Motion、uni.Type Cast、uni.Type On、uni.Typographic |
| BCC 粒子 | 5 | BCC 有机链、BCC 百叶、BCC 粒子发射器 3D、BCC 粒子阵列 3D、BCC 艺术 3D |
| RG VFX | 5 | Bang、Lens Distortion Matcher、Primatte Keyer 6、Real Lens Flares、Spot Clone Tracker |
| irrealix | 5 | Dust Transition、MosaicArt、Nebulosity、Potok、loopFlow |
| Sapphire 光照 | 4 | S_仿真镜头眩光、S_眩光、S_镜头光晕、S_闪光灯记忆 |
| Digital Anarchy | 3 | Beauty Box、Beauty Box Legacy、Beauty Box Shine Removal |
| PSOFT | 3 | P_Glow、P_GradientMap、P_ReplaceColor |
| Plugin Everything | 3 | AutoFill 2、Extrude、Shadow Studio 3 |
| RG Color | 3 | Colorista V、Magic Bullet Looks、Parametric Curve |
| RG Motion Graphics | 3 | 3D Stroke、uni.Line、uni.Progresso |
| Rowbyte | 3 | Aura、Plexus、Stipple |
| Sapphire 转场 | 3 | S_强光溶解、S_镜头光晕溶解、S_闪光灯溶解 |
| BCC 灯光 | 2 | BCC+灯光、BCC+镜头光斑 |
| BCC 电影风格 | 2 | BCC+交叉处理、BCC+电影胶片 |
| Frischluft | 2 | FL Curves - Absolute、FL Curves - Relative |
| RG Stylize | 2 | uni.Error Diffuse Dither、uni.Ordered Dither |
| RG Trapcode | 2 | Form、Particular |
| RG Utilities | 2 | Sound Keys、uni.Palettes |
| Sapphire 创建 | 2 | S_变换、S_效果 |
| Sapphire 风格化 | 2 | S_棱镜、S_色彩转换 |
| BCC 光学扩散 | 1 | BCC+自扩散 |
| BCC 时间 | 1 | BCC 节拍反应器 |
| BCC 纹理 | 1 | BCC+纹理 |
| BCC 转场 | 1 | BCC 幻影粒子溶解 |
| BCC 键控&混合 | 1 | BCC+Primatte Studio |
| BCC 颜色 & 色调 | 1 | BCC 3路颜色校正 |
| BCC 风格化 | 1 | BCC 垃圾 |
| FEC 变形 | 1 | FEC 分裂 2 |
| FEC 图像 | 1 | FEC 通道贴图 |
| FEC 粒子 | 1 | FEC 粒子世界 |
| KeenTools | 1 | GeoTracker |
| One Chance | 1 | Furikake |
| ProductionCrate | 1 | LaForge Editor |
| RG Generators | 1 | uni.Custom Dither |
| Sapphire 渲染 | 1 | S_夜空 |
| Sapphire 调节 | 1 | S_OCIO转换 |
| Video Copilot | 1 | Optical Flares |
| aescripts + aeplugins | 1 | Paint & Stick |
| bfx | 1 | bfx Map Ramp |

## 6. ja-ae 拿这份结果做什么

- `ae_discover what:"effects"`：每个第三方效果带 `test` 字段。名单里没有的第三方效果标 `untested`。
- `ae_discover what:"effects" test:"issues"`：只列这台电脑上装了、并且有已知问题的效果。
- `ae_apply`：
  - 加上即崩溃、渲染时崩溃、加上时弹窗、渲染超时的 9 个，直接拒绝。
  - 加不上的 86 个，在和测试相同的 AE 大版本上拒绝；版本不同时放行，让它试一次。
  - 其余的放行，返回里带测试结论和要注意的事。
  - 被拒绝后确实要试：先保存工程，再带 `force:true` 调用。
- `ae_check`：列出工程里已经用上的、测试时有问题的效果（`effectIssues`），以及没测过的第三方效果（`untestedEffects`）。手工加的效果也查得到。
- `ae_run_script`（执行任意脚本）不经过上面的拦截，只靠工具说明里的规则约束。

用法和坑见 [插件使用说明](../plugins/ja-ae/docs/plugin-guide.md)。

## 7. 各分类一览

「有问题」= 带水印、疑似水印、加不上、弹窗、崩溃、超时。

| 分类 | 效果数 | 可用 | 内容靠预设 | 要先处理 | 有问题 |
|---|---|---|---|---|---|
| Sapphire 转场 | 67 | 61 | 3 | 3 | 0 |
| RE:Vision Plug-ins | 64 | 56 | 0 | 8 | 0 |
| BCC 转场 | 63 | 62 | 1 | 0 | 0 |
| Sapphire 风格化 | 60 | 58 | 2 | 0 | 0 |
| Sapphire 渲染 | 39 | 37 | 1 | 1 | 0 |
| RG Transitions | 34 | 33 | 0 | 1 | 0 |
| Sapphire 时间 | 30 | 25 | 0 | 5 | 0 |
| BCC 键控&混合 | 28 | 26 | 1 | 1 | 0 |
| BCC 颜色 & 色调 | 28 | 27 | 1 | 0 | 0 |
| BCC 灯光 | 27 | 25 | 2 | 0 | 0 |
| FEC 转场过渡 | 26 | 26 | 0 | 0 | 0 |
| PSOFT | 25 | 18 | 3 | 4 | 0 |
| Sapphire 光照 | 25 | 21 | 4 | 0 | 0 |
| Sapphire 变形 | 24 | 24 | 0 | 0 | 0 |
| Image Lounge | 23 | 22 | 0 | 0 | 1 |
| NF's Plugins-Cell | 23 | 0 | 0 | 0 | 23 |
| RG Stylize | 23 | 18 | 2 | 3 | 0 |
| Sapphire 模糊+锐化 | 23 | 23 | 0 | 0 | 0 |
| BCC 风格化 | 20 | 19 | 1 | 0 | 0 |
| Composite Wizard | 20 | 18 | 0 | 2 | 0 |
| FEC 变形 | 20 | 18 | 1 | 1 | 0 |
| NF's Plugins-Filter | 20 | 0 | 0 | 0 | 20 |
| BCC 艺术效果 | 19 | 19 | 0 | 0 | 0 |
| BCC 电影风格 | 18 | 16 | 2 | 0 | 0 |
| BCC 图像恢复 | 17 | 15 | 0 | 2 | 0 |
| Key Correct | 17 | 17 | 0 | 0 | 0 |
| Plugin Everything | 17 | 12 | 3 | 1 | 1 |
| EFX keying/alpha | 16 | 15 | 0 | 1 | 0 |
| RG Blurs and Glows | 15 | 14 | 0 | 0 | 1 |
| Red Giant Text Anarchy | 15 | 0 | 0 | 11 | 4 |
| BCC 变形 | 14 | 13 | 0 | 1 | 0 |
| FEC 风格化 | 14 | 13 | 0 | 1 | 0 |
| Sapphire 调节 | 14 | 13 | 1 | 0 | 0 |
| BCC 渐变 & 着色 | 13 | 13 | 0 | 0 | 0 |
| NF's Plugins-Draw | 13 | 0 | 0 | 0 | 13 |
| ProductionCrate Filter | 13 | 13 | 0 | 0 | 0 |
| BCC 光学扩散 | 12 | 11 | 1 | 0 | 0 |
| BCC 模糊 | 12 | 12 | 0 | 0 | 0 |
| Frischluft | 12 | 10 | 2 | 0 | 0 |
| BCC 时间 | 11 | 9 | 1 | 1 | 0 |
| FEC 模糊 & 锐化 | 11 | 11 | 0 | 0 | 0 |
| FEC 粒子 | 11 | 10 | 1 | 0 | 0 |
| FEC 色彩校正 | 11 | 11 | 0 | 0 | 0 |
| NF's Plugins-Channel | 11 | 0 | 0 | 0 | 11 |
| NF's Plugins-Colorize | 11 | 0 | 0 | 0 | 11 |
| BCC 透视 | 10 | 10 | 0 | 0 | 0 |
| FEC 边缘 | 10 | 10 | 0 | 0 | 0 |
| RG Color | 10 | 7 | 3 | 0 | 0 |
| Rowbyte | 10 | 6 | 3 | 1 | 0 |
| BCC 粒子 | 9 | 3 | 5 | 1 | 0 |
| RG Motion Graphics | 9 | 6 | 3 | 0 | 0 |
| RG Utilities | 9 | 7 | 2 | 0 | 0 |
| RG VFX | 9 | 3 | 5 | 1 | 0 |
| Video Copilot | 9 | 6 | 1 | 2 | 0 |
| FEC 图像 | 8 | 7 | 1 | 0 | 0 |
| RG Generators | 8 | 7 | 1 | 0 | 0 |
| RG Text | 8 | 0 | 7 | 1 | 0 |
| FEC 灯光 | 7 | 7 | 0 | 0 | 0 |
| irrealix | 7 | 0 | 5 | 2 | 0 |
| BCC 3D对象 | 6 | 5 | 0 | 1 | 0 |
| BCC 镜头 | 6 | 6 | 0 | 0 | 0 |
| Digital Anarchy | 6 | 3 | 3 | 0 | 0 |
| FEC 透视 | 6 | 6 | 0 | 0 | 0 |
| NF's Plugins-Noise | 6 | 0 | 0 | 0 | 6 |
| Red Giant Warp | 6 | 6 | 0 | 0 | 0 |
| Sapphire 合成 | 6 | 6 | 0 | 0 | 0 |
| Satori | 6 | 6 | 0 | 0 | 0 |
| BCC VR | 5 | 5 | 0 | 0 | 0 |
| ProductionCrate Transitions | 5 | 5 | 0 | 0 | 0 |
| RG Distortions | 5 | 5 | 0 | 0 | 0 |
| RG Particles and 3D | 5 | 4 | 0 | 1 | 0 |
| Red Giant ToonIt | 5 | 5 | 0 | 0 | 0 |
| francois-tarlier | 5 | 5 | 0 | 0 | 0 |
| BCC 匹配运动 | 4 | 3 | 0 | 1 | 0 |
| BCC 纹理 | 4 | 3 | 1 | 0 | 0 |
| BGRA | 4 | 4 | 0 | 0 | 0 |
| Buena Depth Cue | 4 | 2 | 0 | 2 | 0 |
| CROSSPHERE | 4 | 2 | 0 | 0 | 2 |
| FAN | 4 | 3 | 0 | 1 | 0 |
| FEC 时间 | 4 | 4 | 0 | 0 | 0 |
| ProductionCrate MoGraph | 4 | 4 | 0 | 0 | 0 |
| Vimager | 4 | 2 | 0 | 1 | 1 |
| JAe Tools | 3 | 2 | 0 | 0 | 1 |
| Pixel Sorter Studio | 3 | 3 | 0 | 0 | 0 |
| ProductionCrate Glow | 3 | 3 | 0 | 0 | 0 |
| AndrewYY | 2 | 2 | 0 | 0 | 0 |
| Boris FX Mocha | 2 | 2 | 0 | 0 | 0 |
| Motion Boutique | 2 | 2 | 0 | 0 | 0 |
| NF's Plugins-expression | 2 | 0 | 0 | 0 | 2 |
| ProductionCrate 3D | 2 | 2 | 0 | 0 | 0 |
| RG Trapcode | 2 | 0 | 2 | 0 | 0 |
| Sapphire 创建 | 2 | 0 | 2 | 0 | 0 |
| Vranos | 2 | 1 | 0 | 0 | 1 |
| Zaebects | 2 | 2 | 0 | 0 | 0 |
| proDAD | 2 | 1 | 0 | 1 | 0 |
| 枪火+示波器 | 2 | 1 | 0 | 0 | 1 |
| AESweets | 1 | 1 | 0 | 0 | 0 |
| Animatable | 1 | 1 | 0 | 0 | 0 |
| BCC 浏览 | 1 | 1 | 0 | 0 | 0 |
| Black Ops Effects | 1 | 0 | 0 | 0 | 1 |
| Color Manipulation (timeinpixel | 1 | 0 | 0 | 1 | 0 |
| EFX | 1 | 1 | 0 | 0 | 0 |
| Fixel Algorithms | 1 | 1 | 0 | 0 | 0 |
| GBS | 1 | 0 | 0 | 1 | 0 |
| ISP | 1 | 1 | 0 | 0 | 0 |
| KeenTools | 1 | 0 | 1 | 0 | 0 |
| Keller.io | 1 | 0 | 0 | 0 | 1 |
| Knoll | 1 | 1 | 0 | 0 | 0 |
| Koji Color | 1 | 1 | 0 | 0 | 0 |
| Neat Video | 1 | 0 | 0 | 1 | 0 |
| OLM Plug-ins | 1 | 1 | 0 | 0 | 0 |
| One Chance | 1 | 0 | 1 | 0 | 0 |
| Picture Instruments | 1 | 0 | 0 | 0 | 1 |
| PixelGym | 1 | 1 | 0 | 0 | 0 |
| ProductionCrate | 1 | 0 | 1 | 0 | 0 |
| ProductionCrate Utility | 1 | 1 | 0 | 0 | 0 |
| ProductionCrate VFX | 1 | 1 | 0 | 0 | 0 |
| Prosya | 1 | 0 | 0 | 0 | 1 |
| RM | 1 | 0 | 0 | 1 | 0 |
| Red Giant Psunami | 1 | 1 | 0 | 0 | 0 |
| Scopes (timeinpixels.com) | 1 | 1 | 0 | 0 | 0 |
| Superluminal | 1 | 0 | 0 | 0 | 1 |
| Taronites | 1 | 1 | 0 | 0 | 0 |
| TumoiYorozu Plug-ins | 1 | 1 | 0 | 0 | 0 |
| VFX Tools | 1 | 1 | 0 | 0 | 0 |
| aescripts + aeplugins | 1 | 0 | 1 | 0 | 0 |
| bfx | 1 | 0 | 1 | 0 | 0 |
| iBelieveInSwordfish | 1 | 1 | 0 | 0 | 0 |
| jawset | 1 | 0 | 0 | 1 | 0 |
| minning.de Normality | 1 | 0 | 0 | 1 | 0 |
| murasin's FX | 1 | 1 | 0 | 0 | 0 |

## 8. 没有测的

- 被归入旧版分类（`_Obsolete`、BCC 旧效果）的 252 个效果。
- 默认画面无变化的 332 个，没有逐个调参数验证效果。
- 插件自带的预设库能不能用脚本切换。
- 带插件的整片（几十秒以上）渲染稳定性。
- 脚本面板和扩展面板类的插件。
- 别的 AE 版本（2022—2025）和别的插件版本。
