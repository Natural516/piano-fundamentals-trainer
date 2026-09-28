# Changelog

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
