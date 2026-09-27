# natural516.bocchi 外部主题源码

本目录是 `natural516.bocchi` 的唯一主题素材与数据源，包含：

- `manifest.json`：主题包元数据、兼容范围和签名声明来源。
- `theme.json`：语义 token、App-owned Visual Recipe ID 与素材 slot 映射。
- `assets/`：十个已验收页面实际使用的运行时素材。
- `preview/cover.png`：主题管理界面使用的非业务预览图。

应用仓库只内置 Light / Dark。Bocchi 的 DOM、CSS、响应式规则、谱面保护、Hero seam、装订孔和卡片几何仍由 App-owned Visual Recipe 实现；主题包只提供数据、token 与图片素材。

验证源码：

`npm.cmd run theme:verify -- theme-packages/bocchi`

生成 QA 开发签名包：

`npm.cmd run theme:pack -- theme-packages/bocchi --out artifacts/theme-packages --key-id pft-theme-dev-2026-01 --private-key-file E:\PianoThemeKeys\dev\pft-theme-dev-2026-01-private.pem --channel qa`

生成正式签名包：

`npm.cmd run theme:pack -- theme-packages/bocchi --out artifacts/theme-packages --key-id pft-theme-prod-2026-01 --private-key-file E:\PianoThemeKeys\production\pft-theme-prod-2026-01-private.pem --channel production`

`.pftheme` 是构建 artifact，不进入 Git。私钥必须始终保存在仓库外。
