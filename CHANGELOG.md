# Changelog

## 1.7.0 — 2026-10-05 — versionCode 15

Android versionName：1.7.0。正式签名 Android APK；已在 Lenovo TB375FC 的 RC 验收中验证从 1.6.0 同签名覆盖升级并保留 History、主要设置与 Bocchi 1.1.0。截图继续保留其真实版本与开发构建来源。

### New / 新增

- USB MIDI 输入，与 Bluetooth MIDI 共用成熟的输入与练习判定链路；一次选择一个真实输入设备。
- 中文 / English 的 App-owned UI 与点击式语言选择。
- 识谱、和弦与音程练习提前结束时，可以选择保存或放弃本次 History 记录。

### Improved / 改进

- MIDI 连接、扫描与状态使用设备无关文案，同时保留系统返回的真实设备名称。
- 首页增加音程入口，移除具体训练设置摘要；训练配置仍在 Preparation 页面完成。
- 乐理查询、练习结果、History、主题管理与更新页提供双语 presentation，稳定理论事实与历史兼容边界保持不变。
- Android native label 与未命名 MIDI 设备/端口 fallback 资源具有完整 English 默认和既定中文资源。

### Fixed / 修复

- Bluetooth MIDI 重复候选，以及 stale device handle 导致的重连问题。
- History 筛选栏覆盖记录内容的问题。
- English Home / History 中的中文展示残留。

### Compatibility / 兼容

- Production package 与永久签名身份不变，versionCode 从 14 提升为 15；无需卸载或清除数据。
- Bocchi 1.1.0 的兼容范围仍为 App 1.6.0 至低于 2.0.0；主题内原有文字素材不属于 App-owned 翻译。
- 音程练习的 26 种音程为既有 1.6.0 功能，不是本版新增。
- 不包含 iPad、Android per-app locale sync、内置钢琴音源或全设备/全尺寸适配承诺。

## 1.6.0 — 2026-10-02 — versionCode 14

Android versionName：1.6.0。Production APK、正式 tag / GitHub Release 与 Bocchi 1.1.0 已发布，应用内更新通道已指向 V1.6.0，并完成真实设备在线覆盖升级与数据保留验证。

### 新增

- 音程练习 Product Core：指定低音构造音程，覆盖 26 种音程理论、准确拼写与候选生成。
- MIDI 音程自动判定，沿用 150ms capture、800ms success feedback 与 all-keys-up release gate。
- 固定题数 / 无限练习、低音升降号设置、答案提示 ON / OFF；Grand Staff 常驻，提示 OFF 显示 root，ON 显示 root + target。
- 音程 Result / History / History Detail 持久化与困难音程统计，接入既有练习会话、暂停恢复和 keep-awake。
- Practice Hub 正式音程模块卡与指定低音构造文案。
- Bocchi 的 optional intervalPracticeVisual capability：Practice Hub 蓝色拼贴与 ACTIVE 外围蓝色手账背景 / 前景锚点，保护中性谱面安全区。

### 调整

- Practice Hub 识谱、和弦、音程三张模块卡统一移除摘要 / 状态胶囊，不改变 History / Report 的真实数据。
- 音程 ACTIVE 去除底部两个常驻大信息卡；完成数量靠近题目，保留轻量正确 / 错误 / 暂停 / MIDI 断连反馈。
- 清理用户界面的开发痕迹，维持正式界面调试产物计数为零，QA 工具继续受独立通道限制。
- 通过普通双 parent merge 保留旧 public legacy / bridge / CHANGELOG ancestry 与冻结的音程 checkpoint；不移动旧 v1.5.3 tag。

### 版本与主题兼容

- Android 唯一版本源设为 1.6.0 / versionCode 14，包名和 QA 隔离规则不变。
- Native theme host compatibility 从同一 Android versionName 派生，避免旧固定宿主身份与 App 版本脱节。
- Bocchi SOURCE 1.1.0 的 minAppVersion 为 1.6.0，maxAppVersionExclusive 保持 2.0.0；生产信任密钥不变，source signature 仍为 null。
- 旧 Bocchi 1.0.0 可在 1.6.0 宿主范围内继续使用；缺少 optional Interval capability 时使用 standard fallback。

## 1.5.3 — 2026-09-28 — versionCode 13

Android versionName：1.5.3

### 新增

- 新增完整的个性化主题与外部 `.pftheme` 主题包机制。
- 支持主题包导入、签名验证、安装、激活、更新、删除和故障回退。
- 新增 Production / QA 分离的主题签名信任链。
- 新增设置页主题管理能力。
- 新增“开源项目”GitHub 外部浏览器入口。

### 调整

- “孤独摇滚”从 APK 内置主题迁移为独立外部主题包。
- APK 不再内置孤独摇滚运行时图片资源。
- Release 构建恢复正式更新通道并移除开发调试 Dock。
- 完成部分顶层页面与工具详情主题视觉修正。

### 兼容与升级

- Android versionName：1.5.3
- versionCode：13
- 支持从 V1.5.2 / versionCode 12 直接覆盖升级。
- 已验证 History 与主要练习设置可以保留。

### 外部主题

首个正式外部主题：

`natural516.bocchi`

显示名称：孤独摇滚

主题版本：1.0.0

最低宿主版本：V1.5.3
