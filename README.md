# Piano Fundamentals Trainer

Piano Fundamentals Training with Real MIDI Feedback

**连接真实 MIDI 钢琴的基本功专项训练器。** 在 Android 平板上看谱、看题，用你的电钢琴作答，练习识谱、和弦与音程，并回顾自己的练习记录。

Android Tablet · Real MIDI Input · Practice History · Local Data

[下载最新版 Android APK](https://github.com/Natural516/piano-fundamentals-trainer/releases/latest) · [查看更新记录](CHANGELOG.md) · [个性化主题](https://github.com/Natural516/piano-fundamentals-trainer-themes)

## 它能训练什么

### 识谱训练

看到五线谱后，直接在真实键盘上弹出对应音符，训练谱面音符与键盘位置之间的快速联系。可以按自己的练习需要选择谱表、调号和题数。

### 和弦训练

练习三和弦、七和弦的构成、转位与键盘定位。支持柱式与分解和弦，通过循序练习逐步熟悉，或使用综合随机练习检查掌握情况。

### 音程训练

按指定低音构造音程，例如“请按出以 C4 为低音的纯五度音程”。覆盖 26 种音程，支持固定题数或无限练习。五线谱始终显示低音；打开答案提示后，也会显示目标音，帮助你核对音程。

### 乐理工具

查询和弦、自然大调音阶、调号与音程，把遇到的理论问题带回键盘练习。

### 练习历史

查看已保存的练习结果、正确与错误情况，以及练习次数和完成题数的趋势，方便回顾练习中的难点。

## 实际练习是什么样

以下是 Android 1.6.0 在 Lenovo 平板上的真实应用画面，使用内置浅色主题。

### 首页：选择今天要练什么

![首页：开始识谱、和弦练习，查看最近练习与 MIDI 连接](docs/screenshots/android-v1.6.0-home.png)

### 识谱：看五线谱，在钢琴上作答

![识谱练习运行画面：清晰的五线谱与作答状态](docs/screenshots/android-v1.6.0-sight-reading.png)

### 和弦：把和弦知识落实到键盘

![和弦练习运行画面：当前和弦、谱面与 MIDI 输入反馈](docs/screenshots/android-v1.6.0-chord-practice.png)

### 记录：回看练习结果与趋势

![练习记录：已保存的练习、结果摘要与练习趋势](docs/screenshots/android-v1.6.0-history.png)

## 为什么使用它

- **使用真实钢琴。** 通过 MIDI 电钢琴或键盘作答，不用屏幕虚拟键盘代替实际练习。
- **即时 MIDI 反馈。** 根据收到的演奏输入判断答案，让你知道当前题目是否弹对。
- **专注基本功。** 围绕识谱、和弦和音程做专项练习；不是钢琴课程、曲库跟弹或虚拟钢琴小游戏。
- **数据留在本地。** 练习历史和设置保存在设备上，基本使用不依赖账号；下载和检查更新需要网络。

MIDI 判定不等于完整的演奏评价：应用不声称能够判断音色、手型、触键质量或音乐表现力。

## 如何开始

1. 从 [GitHub Releases](https://github.com/Natural516/piano-fundamentals-trainer/releases/latest) 下载最新版 Android APK，安装到平板。
2. 开启钢琴与平板的蓝牙，在应用的 MIDI 页面允许必要权限、扫描并连接兼容的 Bluetooth MIDI 钢琴。确认页面显示已连接、输入端口已打开。
3. 进入“练习”，选择识谱、和弦或音程，开始在真实钢琴上作答。

当前已实测 Lenovo TB375FC 与 Roland FP-30X 的蓝牙 MIDI 组合。其它设备需确认支持兼容的 Bluetooth MIDI；能连接蓝牙音频，不代表能传输 MIDI。

## 下载与安装

当前正式版本：Android `1.6.0`，主要面向横屏 Android 平板。

[前往 Latest Release 下载 APK](https://github.com/Natural516/piano-fundamentals-trainer/releases/latest)

- 在 Release 的 Assets 中下载正式 `.apk`，按 Android 系统提示安装。
- 正式应用也提供用户主动触发的“检查更新”，下载后由 Android 系统确认安装。
- 兼容的正式旧版本可覆盖安装，保留兼容的历史记录与主要设置。已在 Lenovo TB375FC 验证从 1.5.3 升级到 1.6.0 的数据保留。
- 不要为了升级先卸载或清除应用数据；其它设备的兼容性与数据保留需以实际情况为准。

## 个性化主题

支持导入 `.pftheme` 个性化主题，改变应用外观与练习环境。喜欢清爽界面时，可以随时使用内置浅色或深色主题。

[浏览官方主题仓库](https://github.com/Natural516/piano-fundamentals-trainer-themes)

Bocchi（孤独摇滚）1.1.0 已提供识谱、和弦和音程练习的主题视觉。使用 App 1.6.0 时，在“设置 → 导入主题包”选择下载的主题，然后选用它。升级应用不会自动替换你已经选择的主题；旧主题仍可在兼容范围内继续使用。

## Open Source & Development

- [Apache License 2.0](LICENSE)
- [Building：本地验证与 Debug APK 构建](BUILDING.md)
- [Development：工程入口与主题架构](DEVELOPMENT.md)
- [Security：更新验证与签名安全](SECURITY.md)
- [Third-party notices](THIRD_PARTY_NOTICES.md)

<details>
<summary>开发者发布信息</summary>

当前 Android `1.6.0`（`versionCode 14`）。Android 版本以 [android/version.properties](android/version.properties) 为单一来源。

源代码许可证不自动覆盖官方品牌、主题图稿或第三方素材；对应授权边界见第三方说明。贡献者通常构建 Debug APK，维护者签名流程见 [Android release signing](android/RELEASE_SIGNING.md)。

</details>
