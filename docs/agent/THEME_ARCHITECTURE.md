# Android Theme Architecture

## 1. 当前运行时模型

应用只内置 `light` 与 `dark`。其他完整主题通过 Android 外部主题包安装，并在校验后适配为 `RuntimeThemeDefinition`。`natural516.bocchi` 已迁移为外部主题；`bocchi-dev` 只保留为旧 DEV/QA preference 与 URL 的迁移别名，未安装外部主题时安全回退 Light。

Product UI 只消费运行时定义，不按具体主题 ID 分支。主题切换不得改变页面信息架构、路由、MIDI、练习判定、计时、持久化、History、Updater 或包身份。

## 2. Product layer 与 Theme layer

Product Layer 拥有：

- 页面结构、真实数据、状态、控件与交互；
- Sight / Chord 练习、谱面与反馈语义；
- 工具查询与乐理计算；
- History 聚合、筛选与详情；
- Settings 中的设备、主题管理、版本与更新语义。

Theme Layer 只能拥有：

- 语义 token、色彩、表面、边框与阴影；
- Hero、纸张、胶带、贴纸等非交互图片；
- App 允许的 Visual Recipe、素材 slot 与受限参数。

架构契约关键词保持如下：

- **Product layer** 拥有产品结构、数据和行为。
- **Peer themes** 共享同一套 Product UI，主题之间不存在功能层级差异。
- **Single visual source** 要求同一构图不通过重复人物图或补偿切片重建。
- **Future external-theme compatibility** 由受限 schema、Visual Recipe 与素材 slot 提供。
- **Themes cannot alter business logic**，主题不能改变业务逻辑、判定、计时或持久化语义。

## 3. Registry、Adapter 与 Asset Resolver

`themeRegistry.ts` 的 built-in registry 只有 Light / Dark。外部 `manifest.json` 与 `theme.json` 先经过 schema、recipe、slot、参数、checksum、签名和素材校验，再由 `runtimeThemeAdapter.ts` 适配。`themeAssetResolver.ts` 将已安装包的相对素材路径解析到 Android 私有目录对应的 Capacitor file URL。

Settings 将内置主题与已安装外部主题分开渲染。外部主题的导入、验证、安装、更新、激活和删除由主题管理器处理，不会写回 built-in registry。

## 4. App-owned Visual Recipe

当前 App 内置七类视觉配方：

1. `home-scrapbook-single-hero-v1`
2. `practice-hero-cards-v1`
3. `tools-studio-cards-v1`
4. `history-journal-dashboard-v1`
5. `settings-hero-cards-v1`
6. `practice-decorated-focus-v1`
7. `tool-reference-notebook-v1`

外部包只能引用已知 recipeId，并提供允许的素材 slot 与 token；不能提供 React、HTML、CSS、脚本、selector 或任意布局代码。CSS 通过 `data-theme-recipe-*` 激活配方。历史 `.bocchi-*` class 仅是已批准配方的内部实现名，不代表 themeId 分支。

## 5. 语义 token 与反馈

运行时定义提供应用表面、文本、强调色、边框、导航、按钮与练习反馈 token。`--practice-feedback-success`、`--practice-feedback-danger`、`--practice-feedback-warning` 是共享语义名，但具体值由每个主题独立提供。

Theme Layer 只能改变反馈外观，不能改变 Correct / Wrong / Timeout / Transition 的业务语义、持续时间或判定行为。

## 6. 页面能力边界

- `homeVisual`：单一 Hero、标题与三张卡片装饰；真实数据与跳转仍属 Product。
- `practiceVisual` / `toolsVisual`：顶层页 Hero 与卡片装饰。
- `historyVisual`：Hero 与拼贴；统计、趋势、筛选和记录均属 Product。
- `settingsVisual`：Hero 与卡片装饰；设备状态、主题包管理和版本均属 Product。
- `practiceActiveVisual`：Focus shell 与角落装饰；谱面几何、VexFlow、MIDI、计时和判定不受主题影响。
- `toolDetailVisual`：Reference Notebook skin 与装饰；查询、拼写、结果语义和 native controls 均属 Product。

## 7. 外部素材所有权

`theme-packages/bocchi` 是 `natural516.bocchi` 的唯一素材源。Vite 源码与 APK public assets 不再包含 Bocchi runtime PNG。安装后素材从 App 私有主题目录加载；主题目录缺失、安装完成标记缺失或必要素材损坏时，运行时 fail closed 并回退 Light。

## 8. Light / Dark 隔离

Light / Dark 使用相同 Product DOM 与共享结构，但不会创建或加载外部主题 artwork。未安装任何外部主题时应用必须完整启动到 Light，所有核心产品功能保持可用。

## 9. 视觉单源原则

当批准图片已经包含正确人物、纸张、乐器、背景和遮挡关系时，该图片是对应区域的唯一视觉源。真实 HTML 可以覆盖其上，但不得再通过第二人物图、矩形切片或补偿 mask 重建同一构图。

## 10. 安全与发布边界

Debug 可按 compile gate 接受开发 unsigned 包；QA 只信任 developer key 且拒绝 unsigned；Release 只信任 production key 且拒绝 developer key 与 unsigned。签名私密材料始终位于仓库外，仓库和 APK 只包含相应构建渠道允许的公开信任材料。
