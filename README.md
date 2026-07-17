# Piano Fundamentals Trainer

钢琴基本功训练器，当前已完成首页 UI 框架、MIDI 输入测试页和本地监听。

## 当前阶段范围

- 已实现深色音乐工作室风格首页。
- 已实现左侧导航、MIDI 状态卡片、功能练习卡片、右侧统计栏、底部快捷功能。
- 已实现练习卡片、左侧导航和快捷功能的占位页切换。
- 已实现 MIDI 输入测试页，接入浏览器 Web MIDI API。
- 已实现 MIDI 输入设备枚举、设备选择、事件摘要与日志弹窗、activeNotes 状态和 88 键虚拟键盘高亮。
- 已实现本地监听开关和音量控制，MIDI 输入不依赖软件发声。
- 首页左下角 MIDI 状态卡片已接入真实 MIDI 设备状态。
- 未实现练习判定系统、真实练习模块、VST、SoundFont、MIDI 文件导入和曲谱导入。

## 目录结构

```text
.
├─ package.json
├─ electron.vite.config.ts
├─ tsconfig.json
├─ tsconfig.node.json
├─ tsconfig.web.json
└─ src
   ├─ main
   │  └─ index.ts
   ├─ preload
   │  └─ index.ts
   └─ renderer
      ├─ index.html
      └─ src
         ├─ App.tsx
         ├─ data.ts
         ├─ hooks
         │  ├─ useAudioEngine.ts
         │  └─ useMidi.ts
         ├─ main.tsx
         ├─ styles.css
         ├─ types.ts
         ├─ utils
         │  ├─ audioNotes.ts
         │  └─ midiNotes.ts
         ├─ vite-env.d.ts
         └─ components
            ├─ FullKeyboard.tsx
            ├─ HomePage.tsx
            ├─ MidiTestPage.tsx
            ├─ PlaceholderPage.tsx
            ├─ RightInfoPanel.tsx
            ├─ Sidebar.tsx
            └─ VirtualKeyboard.tsx
```

## 主要文件

- `src/main/index.ts`：Electron 主进程，创建 Windows 桌面窗口。
- `src/preload/index.ts`：预加载脚本，保留后续安全暴露桌面能力的入口。
- `src/renderer/src/App.tsx`：页面状态和首页/占位页切换。
- `src/renderer/src/data.ts`：导航、练习模块、快捷功能和页面标题数据。
- `src/renderer/src/hooks/useMidi.ts`：Web MIDI 初始化、输入设备列表、设备选择、事件监听、CC64 记录和 activeNotes 状态。
- `src/renderer/src/hooks/useAudioEngine.ts`：本地监听、音量控制和内置合成钢琴音色。
- `src/renderer/src/utils/audioNotes.ts`：MIDI 编号到频率、velocity 归一化等音频工具。
- `src/renderer/src/utils/midiNotes.ts`：MIDI 编号、音名和 88 键范围转换。
- `src/renderer/src/components/HomePage.tsx`：首页主体、练习卡片和快捷功能。
- `src/renderer/src/components/Sidebar.tsx`：左侧导航栏和 MIDI 状态卡片。
- `src/renderer/src/components/MidiTestPage.tsx`：MIDI 输入测试页。
- `src/renderer/src/components/FullKeyboard.tsx`：A0 到 C8 的 88 键虚拟钢琴键盘。
- `src/renderer/src/components/RightInfoPanel.tsx`：今日练习统计和最近练习记录。
- `src/renderer/src/components/VirtualKeyboard.tsx`：小型虚拟钢琴键盘预览。
- `src/renderer/src/styles.css`：深色卡片式 UI 样式和桌面自适应布局。

## 运行命令

```bash
npm install
npm run dev
```

Windows PowerShell 如果拦截 `npm.ps1`，可以使用：

```powershell
npm.cmd install
npm.cmd run dev
```

## 构建和打包

```bash
npm run build
npm run dist
```

- `npm run build`：执行 TypeScript 类型检查并构建 Electron/Vite 输出。
- `npm run dist`：在 `release/` 下生成 Windows 安装包。

## MIDI 测试页使用方式

1. 连接电钢琴或 MIDI 键盘。
2. 启动应用后进入首页，点击左下角 `MIDI 测试`，或点击底部快捷功能里的 `MIDI 测试`。
3. 在 MIDI 输入测试页允许 MIDI 权限。
4. 点击 `刷新设备`，在下拉框或设备列表中选择 MIDI 输入设备。
5. 按下键盘后查看当前按下音符、MIDI 编号、velocity、事件摘要和 88 键高亮。
6. 点击 `查看事件日志` 可以打开最近 20 条 MIDI 事件弹窗。
7. 如需软件发声，开启 `本地监听` 并调整音量；如果外部音源已经发声，可以关闭本地监听。

## 外部音源说明

如果你使用 Garritan CFX、Pianoteq、Kontakt、DAW 等外部音源，可以在外部音源中直接选择同一个 MIDI 键盘作为输入，并关闭本软件的本地监听，避免双重声音。

## 下一阶段建议

下一阶段建议实现 MIDI 输入测试页的设备体验完善：

- 加入 MIDI 输入延迟和事件稳定性检测。
- 增加设备自动重连与上次选择记忆。
- 增加一个只读的音符流调试面板。
- 为第三阶段练习模块定义统一的 MIDI 事件订阅接口。

