# natural516.bocchi 外部主题源码

本目录是 `natural516.bocchi` 的唯一主题素材与数据源，包含：

当前 SOURCE 发布准备版本为 `1.1.0`，兼容宿主范围为 `[1.6.0, 2.0.0)`。此目录尚未生成或发布 1.1.0 Production 签名包，source manifest 的 signature 保持 null；已发布的 1.0.0 包保持不变。

- `manifest.json`：主题包元数据、兼容范围和签名声明来源。
- `theme.json`：语义 token、App-owned Visual Recipe ID 与素材 slot 映射。
- `assets/`：已验收页面实际使用的运行时素材，不把图片复制进 App bundle。

Interval 仅使用 `intervalPracticeVisual` / `interval-blue-notebook-v1` 两个 optional slot：
`hubCardCollage` → `assets/interval-practice/hub-collage.png`，原始「蓝色音乐手账拼贴.png」SHA-256 `fbee69a0a6fe897dc705b6cc84e16311de5e115f50840b971349193376efa93e`；
`activeBorder` → `assets/interval-practice/active-border.png`，原始「蓝色手帐拼贴透明边框.png」SHA-256 `d664dd3bde8ca2f49f5cb1217bde27887ccc5274ae606e60b5a5cec9192dce46`。
两份原图字节不变；参考截图不进入运行时包。无 Preparation / Result / History Detail slot，不接受 geometry 或业务参数。
- `preview/cover.png`：主题管理界面使用的非业务预览图。

应用仓库只内置 Light / Dark。Bocchi 的 DOM、CSS、响应式规则、谱面保护、Hero seam、装订孔和卡片几何仍由 App-owned Visual Recipe 实现；主题包只提供数据、token 与图片素材。

验证源码：

`npm.cmd run theme:verify -- theme-packages/bocchi`

生成 QA 开发签名包：

`npm.cmd run theme:pack -- theme-packages/bocchi --out artifacts/theme-packages --key-id pft-theme-dev-2026-01 --private-key-file E:\PianoThemeKeys\dev\pft-theme-dev-2026-01-private.pem --channel qa`

生成正式签名包：

`npm.cmd run theme:pack -- theme-packages/bocchi --out artifacts/theme-packages --key-id pft-theme-prod-2026-01 --private-key-file E:\PianoThemeKeys\production\pft-theme-prod-2026-01-private.pem --channel production`

`.pftheme` 是构建 artifact，不进入 Git。私钥必须始终保存在仓库外。
