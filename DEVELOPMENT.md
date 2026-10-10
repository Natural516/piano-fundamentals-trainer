# Development

本页保留开发入口与架构说明；面向钢琴学习者的介绍见 [README](README.md)，构建步骤见 [BUILDING](BUILDING.md)。

## 工程入口与边界

- `prototype/android-tablet-v1/`：Android 平板 Web UI 与应用集成。
- `android/`：Capacitor Android 工程、原生 Bluetooth / USB MIDI、更新与主题包边界。
- `src/shared/musicNotation/`：Android 使用的 VexFlow 五线谱组件、字体加载与谱表模型；`src/shared/styles/` 保留行为等价的共用外观样式。
- Windows / Electron 桌面端已退役，当前源码树不再提供桌面应用入口、打包或运行命令。历史实现可在 Git 历史中查阅。
- 识谱核心位于 `src/sightReading/`；Android 和弦、音程的实现分别位于 `prototype/android-tablet-v1/src/chordPractice/` 与 `intervalPractice/`。
- `android/version.properties`：Android 应用版本唯一来源。
- `package.json` 与 `scripts/`：已有构建及专项验证入口。

业务题目、判定、会话、报告和持久化由 App 控制，不能由主题素材或展示截图提供或改写。仅有 MIDI 时，不把不可观测的手型、身体动作、音色或表现力包装成已验证能力。

## 个性化主题与 Theme API

Light / Dark 是内置外观；外部 `.pftheme` 包只提供静态素材与安全主题参数。Theme API 负责能力声明，App-owned Visual Recipe 决定 DOM、布局、响应式规则与谱面安全区，主题不接管业务状态。

主题包版本与 App 版本独立。正式 Bocchi 1.1.0 兼容 App `[1.6.0, 2.0.0)`；Bocchi 1.0.0 在其兼容范围内继续有效，在新 App 缺少音程专属能力时使用 standard fallback。App 1.5.3 不接受需要 1.6.0 的新主题。

音程主题为 optional capability：`intervalPracticeVisual`，recipe 为 `interval-blue-notebook-v1`，optional slots 为 `hubCardCollage` 与 `activeBorder`。缺少 optional capability/slot 的旧主题仍合法；不能渲染空图片或死占位。音程专属素材只用于 Practice Hub 卡片与 ACTIVE 外缘，不能进入五线谱白纸安全区，不新增 Preparation、Result 或 History Detail 专属素材。

源码主题定义位于 `theme-packages/bocchi/`。源码 manifest 的 `signature: null` 表示未打包的源码元数据，不表示已发布的 Production `.pftheme` 未签名。实际可安装主题从 [官方主题 Releases](https://github.com/Natural516/piano-fundamentals-trainer-themes/releases) 获取。

```powershell
npm.cmd run theme:verify -- theme-packages/bocchi
```

生产主题使用受信任的 Production 公钥验证签名、真实素材与兼容范围；同版本不同 digest 的包不能伪装为普通更新。不要修改 trust store 或正式素材来绕过验证。

## 维护参考

- [Android 实现与历史硬件验证](prototype/android-tablet-v1/README.md)
- [主题源码与打包参考](theme-packages/bocchi/README.md)
- [签名基础设施](android/RELEASE_SIGNING.md)
- [项目原则](docs/PROJECT_PRINCIPLES.md)
- [更新记录](CHANGELOG.md)

上述历史工程文档包含各开发阶段的检查记录，不应把历史候选状态当成当前上线状态。当前 App 版本读取单一版本源，当前下载状态以正式 Releases 与 README 为准；源码改动不自动授权版本提升、重新打包或发布。
