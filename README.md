# Piano Fundamentals Trainer

钢琴基本功训练器是一个基于 Electron、React 和 TypeScript 的 Windows 桌面练习软件。

当前测试版本：`0.9.0-beta`

## 已实现功能

- Web MIDI 输入设备枚举、选择、连接状态和事件日志。
- 88 键虚拟钢琴键盘、复音高亮与 CC64 延音踏板事件显示。
- 可独立开关和调节音量的本地监听。
- 节拍器、预备拍、强弱拍声音和三档判定宽容度。
- 识谱练习：高音谱号、低音谱号、双谱号随机和三档音域。
- 节奏与切分练习：四个基础节奏模板。
- 十二大调音阶练习。
- 自然三和弦、转位与柱式和弦练习。
- 左右手协调练习。
- 本地练习记录、历史报告、今日统计和最近练习记录。

外部使用 Garritan CFX、ARIA Player、Pianoteq、Kontakt 或 DAW 时，可让外部音源与本软件直接读取同一个 MIDI 键盘，并关闭本软件的本地监听以避免双重声音。本软件不包含 MIDI 转发、VST 宿主或 SoundFont。

## 开发环境

```bash
npm install
npm run dev
```

Windows PowerShell 如果拦截 `npm.ps1`，可使用 `npm.cmd`：

```powershell
npm.cmd install
npm.cmd run dev
```

## 检查与构建

```bash
npm run test:regression
npm run typecheck
npm run build
```

- `test:regression`：检查核心题库、判定工具和本地记录边界。
- `typecheck`：检查 Electron 主进程和 React 渲染进程的 TypeScript 类型。
- `build`：执行类型检查并生成 `out/` 生产构建。

## Windows 打包

请先运行 `npm run build`，再执行：

```bash
npm run pack
npm run dist
```

- `pack`：生成 `release/win-unpacked/` 免安装目录。
- `dist`：生成 NSIS 安装包和单文件便携版。

输出目录：

```text
release/
├─ 钢琴基本功训练器-Setup-0.9.0-beta.exe
├─ 钢琴基本功训练器-Portable-0.9.0-beta.exe
└─ win-unpacked/
```

安装版支持选择安装路径，并创建桌面和开始菜单快捷方式。便携版是可直接双击运行的单个 EXE。两者都不需要 Node.js、npm、命令行或开发服务器。

## 数据保存

练习记录保存在 Electron 的本地应用数据目录中。安装升级和正常卸载不会主动删除这些记录。便携版同样使用 Windows 用户应用数据目录，因此移动便携 EXE 不会把记录嵌入或带走。

## 临时程序图标

当前 `build/icon.ico` 是用于 `0.9.0-beta` 构建的临时程序图标，生成脚本为 `scripts/generate-app-icon.py`。它与首页六个练习模块图标无关，后续可直接替换正式 ICO。
