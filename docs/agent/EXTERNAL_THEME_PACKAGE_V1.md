# External Theme Package v1

## 1. 当前状态

External Theme Package v1 已实现 Android 导入、原生安全验证、私有目录安装、更新、激活、删除、持久化、last-known-good 与故障回退。应用内置主题仅为 Light / Dark；`natural516.bocchi` 是首个完整外部主题源码。

## 2. 包结构

`.pftheme` 是确定性 ZIP container，包含：

- `manifest.json`
- `theme.json`
- `checksums.json`
- `signature.ed25519`（签名渠道）
- 自包含 `assets/`
- 自包含 `preview/`

checksums 使用 SHA-256 lowercase hex；路径为 NFC、`/` 分隔的 UTF-8 相对路径并按 bytes 排序。构建拒绝脚本、CSS、HTML、SVG、WASM、嵌套压缩包、symlink、unsafe path、case collision 与 duplicate normalized path。

## 3. 源码所有权

`theme-packages/bocchi` 是 `natural516.bocchi` 的唯一源码与素材源，不再存在 `source-map.json`，也不依赖 `prototype/android-tablet-v1/src/assets/themes/bocchi`。生成的 `.pftheme` 位于 `artifacts/theme-packages`，属于构建产物，不进入 Git。

## 4. 安装生命周期

1. Settings 通过 Android `ACTION_OPEN_DOCUMENT` 选择包。
2. Native validator 对 archive、路径、大小、条目、manifest、schema、checksum、signature 与 recipe 合约 fail closed 校验。
3. 校验成功后解压到 App 私有 staging 目录。
4. 完整验证通过后原子发布版本目录并写入 `INSTALL_COMPLETE.json`。
5. Theme Store 记录已安装版本、active 与 last-known-good。
6. Web runtime 通过 Capacitor plugin 读取记录，并把素材解析到 App 私有 file URL。

更新使用同一套完整验证与原子发布流程；旧版本不能覆盖新版本。删除活动主题前会切回安全 built-in 主题。

## 5. Visual Recipe 与数据协议

Product UI 只消费 `RuntimeThemeDefinition`。不可信的 `ExternalThemeDefinitionV1` 必须经过 schema、recipe、slot、参数、token 和 asset resolver 校验后才能进入运行时。

Visual Recipe 由 App 持有。主题包不能注入代码或任意布局，只能引用已注册 recipeId、提供允许的素材 slot、受限参数与语义 token。

## 6. 信任矩阵

- Debug：developer key；unsigned 是否允许由显式 compile gate 决定。
- QA：developer key；unsigned=false。
- Release：production key；不接受 developer key；unsigned=false。

Production keyId：`pft-theme-prod-2026-01`。

QA dev-signed 包必须 QA PASS / Release FAIL；production-signed 包必须 QA FAIL / Release PASS；unsigned 与 unknown key 在 QA / Release 均 FAIL。

## 7. 故障恢复

启动时会重新确认活动外部主题的安装记录、版本目录、`INSTALL_COMPLETE.json` 和 required assets。任何一项缺失或损坏都会：

- 记录 failed theme id、version 与原因；
- 回退 Light；
- 保持 Product、MIDI、练习、History、Tools、Settings 与 Updater 可用；
- 不白屏、不清除正式业务数据。

## 8. Bocchi 外部主题

`natural516.bocchi` 使用七类 App-owned recipe，覆盖 Home、Practice、Tools、History、Settings、两类 ACTIVE 与三个 Tool Detail。图片只从安装后的外部主题目录加载，APK 中保留 recipe DOM/CSS 与通用渲染引擎，不包含其 runtime PNG。

## 9. 常用命令

```text
npm.cmd run test:theme-runtime
npm.cmd run theme:verify -- theme-packages/bocchi
npm.cmd run theme:pack -- theme-packages/bocchi --out artifacts/theme-packages --key-id <key-id> --private-key-file <repository-external-key-path> --channel qa|production
npm.cmd run test:theme-trust-matrix
npm.cmd run test:android-theme-package-native
npm.cmd run test:android-theme-package-security
npm.cmd run test:android-theme-store
npm.cmd run test:android-theme-recovery
npm.cmd run test:android-theme-settings
npm.cmd run test:android-theme-asset-audit
```

`theme:verify` 校验源码并运行 Playwright UI harness；`--skip-ui` 仅供 pack/container 内部复验与确定性测试，不替代视觉验收。

## 10. Release trust 验证

Release 不需要借用 QA 信任，也不允许 debug signing fallback。`ThemeTrustStoreTest` 的 Release variant 验证 production package、dev package、unsigned 与 unknown key 的互斥结果。生产签名私密材料不进入仓库、APK、主题源码或报告。
