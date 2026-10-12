# 产品截图来源

## 当前正式 Android 1.7.2：报告与识谱分析

采集日期：2026-10-12。真实 Lenovo TB375FC 横屏，2944 × 1840，正式 `com.pianofundamentals.trainer`，1.7.2 / versionCode 17，内置浅色 / Light，分别采集中文与 English。APK SHA-256：`896a3f7abd0b1e15fda10d952c8e52475eea67b831909b75809ce6f715f795ce`。

来自保留的真实用户 History，不是 QA 夹具或浏览器。四张 PNG 都是 Android `screencap` 原始截图的逐字节副本；未裁切、缩放、重压缩、替字、拼接、重绘或生成 UI。Pillow 完整解码验证尺寸与有效像素。保留设备系统灰色笔形快捷入口，不是开发工具。

| 文件 | 语言 | 字节 | SHA-256 |
| --- | --- | ---: | --- |
| [android-v1.7.2-sight-analysis.png](android-v1.7.2-sight-analysis.png) | 中文 | 405417 | `e7f0a76ca5092504572476a76211d6d6b0297d78bfba05ea0c88f8a22ddddc20` |
| [android-v1.7.2-sight-report.png](android-v1.7.2-sight-report.png) | 中文 | 290202 | `5960450523f0d70f193ae4d27d4fc2f0299e2fe6d56a750e90144e3238f766d1` |
| [android-v1.7.2-en-sight-analysis.png](android-v1.7.2-en-sight-analysis.png) | English | 462093 | `c9dea3da0051bcfdcb1af2082aeab399df385004c97997f844a75c010e74a6ca` |
| [android-v1.7.2-en-sight-report.png](android-v1.7.2-en-sight-report.png) | English | 303429 | `033ed7a8c9b8e8f91788c08cb1e1220cf4ca119db29bc2237a9bdffaec9eb6db` |

升级前后可见 History 均为 46 条、累计 2323 题，识谱 44 条；最近报告仍为 100/100、正确 96、错误 4、超时 0、平均 1.24 秒、最高连对 25。原中文与 Bocchi 1.1.0 在截图后恢复，主要练习设置核对保持一致。未卸载、清空或注入正式 History，没有对私有数据库字节进行审计。

真实长期分析显示最近 10 次完整练习的 10 行相对慢反应排名，首位高音谱号 D5（1.38 秒，18 次正确样本）。高音谱号 E4 未进入该 Top 10，但出现在单次报告（1.59 秒，4 次正确样本）。没有预设排名或修改记录。图中每个谱号、音名、样本数与时间均来自实际保存的数据。

主 README 的首页与三个练习运行页保留下面真实 1.7.1 来源，因这些页面未改变；报告与分析使用本批 1.7.2 画面，不将旧空榜截图改名充当新版。

## 历史正式 Android 1.7.1（保留未变页面）

采集日期：2026-10-12。设备为 Lenovo TB375FC，横屏 2944 × 1840。App 为正式 `com.pianofundamentals.trainer`，版本 1.7.1 / versionCode 16，未使用 QA 或浏览器模拟。安装 APK 的 SHA-256 与 GitHub 正式 Release 完全一致：`2838f94a68603698a0a02e04b2a2bce54ffee825f8c2c4710b6b1885af442e2a`。

本批每种语言均采集首页、三个练习 ACTIVE、History、单次识谱报告和长期识谱分析，使用内置浅色 / Light 主题，连接真实 Roland FP-30X Bluetooth MIDI。主 README 每种语言展示首页、单次报告、长期分析，三个运行画面放在折叠区；History 作为补充保留在本目录。

全部原始 PNG 来自 Android `screencap`。未裁切、缩放、拼接、替字、降色、重绘或生成 UI。展示副本仅重压缩 PNG IDAT：解压扫描行完全一致，其它数据块逐字节保留。Pillow 完整解码确认原始图与展示图的 RGBA 像素完全相同。右侧灰色笔形浮动按钮是设备系统快捷入口，保留真实画面；不是 QA/debug 工具。

| 文件 / 页面 | 语言 | 原始字节 | 展示字节 | 展示 PNG SHA-256 |
| --- | --- | ---: | ---: | --- |
| [android-v1.7.1-home.png](android-v1.7.1-home.png) | 中文 | 412490 | 388444 | `1e81e6b4b246e10ee5571dd3c5e8cb5e8600e3fe06d23906a924f2a29b0808a0` |
| [android-v1.7.1-sight-reading.png](android-v1.7.1-sight-reading.png) | 中文 | 118044 | 111759 | `c2e073d4302727fa46347d6a514e11eb9f83cc290ea8049cff9f639705270b1e` |
| [android-v1.7.1-chord-practice.png](android-v1.7.1-chord-practice.png) | 中文 | 177179 | 165996 | `97aafaaaaf07dc4f946069b7f00c7c8f2350f993be6004cdbf94b9a45c45dca2` |
| [android-v1.7.1-interval-practice.png](android-v1.7.1-interval-practice.png) | 中文 | 120710 | 113435 | `4517d2f0e9b4df5b3238bdb03425f8efc6b01a495381fe0becc220d8267657ef` |
| [android-v1.7.1-history.png](android-v1.7.1-history.png) | 中文 | 672047 | 617393 | `d5a320b2a2a494a165b2b3fe6108b2d939c179a5530de32e8a65405dcd9c4550` |
| [android-v1.7.1-sight-report.png](android-v1.7.1-sight-report.png) | 中文 | 258080 | 239395 | `edd69635810685606655a82196d81e007c20bf822b350b138ab3666746e5f9ac` |
| [android-v1.7.1-sight-analysis.png](android-v1.7.1-sight-analysis.png) | 中文 | 230101 | 214312 | `b1f08ef0c9810125b099d2993939a15d1577460dccad4427b8095c97860ee4c0` |
| [android-v1.7.1-en-home.png](android-v1.7.1-en-home.png) | English | 414944 | 389358 | `87bd7c8dc5cc9c012f63a6302c8acf3874e5c3c59f024a01cc0f98abb09398e0` |
| [android-v1.7.1-en-sight-reading.png](android-v1.7.1-en-sight-reading.png) | English | 120258 | 112858 | `d76de8cf9d83d3373a3a96cd5e5dad8f608001c4ed9aa19b0716356c1e6460f6` |
| [android-v1.7.1-en-chord-practice.png](android-v1.7.1-en-chord-practice.png) | English | 187486 | 174986 | `24959b498326a0cb91fffb27c77234624a13e59558b4c964448ee8fd828766c4` |
| [android-v1.7.1-en-interval-practice.png](android-v1.7.1-en-interval-practice.png) | English | 128363 | 120096 | `be9ad0d79143972f079ec8460af9b9b2f2e5719ff3666a1be07b47372993f248` |
| [android-v1.7.1-en-history.png](android-v1.7.1-en-history.png) | English | 680568 | 626421 | `c7cb44259e8f5ef8983a300b1ea1e5c1e2588cd0651dd3df0de9ebcbe3c55519` |
| [android-v1.7.1-en-sight-report.png](android-v1.7.1-en-sight-report.png) | English | 262153 | 240162 | `23589f6447b2da6dbb7d39d0419ed8432b442b9f3c72d67336a3df97ad23c3ad` |
| [android-v1.7.1-en-sight-analysis.png](android-v1.7.1-en-sight-analysis.png) | English | 229566 | 211729 | `191a5e26c84e6ca5c9d96f2bae46a8a7fc95b26bf0e90b442d055fc7f17ced1a` |

### 真实数据与保护核对

- History 前后均为 46 条记录、累计 2323 题；识谱筛选为 44 条。原有最近一条报告仍为 100/100、正确 96、错误 4、超时 0、正确率 96%。
- 单次报告有真实易错音与长思考音；长期分析基于最近 10 次完整练习，有易错音，长思考音当前如实显示“暂无明显长思考音 / No clear slow-response notes yet”。没有制造结果或注入数据。
- 所有六个截图临时会话均未作答、未发送模拟 MIDI，在完成 0 题时结束并选择不保存。
- 识谱可见配置前后为大谱表 / C 大调 / 100 题 / 固定 5 秒。设置面板只读确认单音、调内音、音名隐藏；没有操作这些控件。
- 和弦只读设置为 C 大调、20 题、构成音开启；没有修改设置。中英文运行图均为循序模式第 1 题、0 完成。
- 音程配置前后为答案提示 ON、低音包含升降号 OFF、20 题。
- 原主题 Bocchi 1.1.0 与中文语言已恢复；MIDI 从原先未连接临时连接后恢复未连接；最终停在首页。
- 核对范围为实际可见 UI、记录总数、摘要及设置；没有对正式 App 私有数据库进行字节审计，不声称数据库字节完全一致。
- 未安装或重建 APK，未修改正式 Release、签名、主题包或更新入口。公开图片无账号、通知、密钥、诊断、IP、ADB 标识或本地路径。

## 历史 Android 1.6.0 截图

原 README 的四张产品截图来自 Lenovo TB375FC 横屏、正式 Android 1.6.0 应用，统一使用内置浅色主题；不是设计稿、浏览器模拟或生成图。原始截图为 2944 × 1840 PNG，未裁切、未覆盖文字、未重绘 UI。

| 文件 | 页面 | SHA-256 |
| --- | --- | --- |
| `android-v1.6.0-home.png` | 首页 | `98274E9F8DFDCDF2798434B24A1071A6B6E52BC32E2B94F7A84E73F46650C23B` |
| `android-v1.6.0-sight-reading.png` | 识谱练习运行中 | `F1837CC1BA24EB20B4DC70121797F4817C64501D11255ABA11D6027622C4B6A3` |
| `android-v1.6.0-chord-practice.png` | 和弦练习运行中 | `6ECDAE759EFD7252CB30938CD5C302D148EF62A98B6EEB09369A5C546F1A477D` |
| `android-v1.6.0-history.png` | 已有练习记录 | `5F4271B302B883787981899C5D9802F04D06DC737183978E705847ADE5B84636` |

展示图仅对 PNG 的 IDAT 数据进行无损重压缩：解压后的扫描行完全一致，所有其它 PNG 数据块（包括尺寸与颜色信息）逐字节保留。未缩放、降色或修改任何 UI 像素。

| 页面 | 原始 PNG 字节 | 展示 PNG 字节 |
| --- | ---: | ---: |
| 首页 | 389967 | 369285 |
| 识谱练习 | 114456 | 108528 |
| 和弦练习 | 171283 | 161515 |
| 练习记录 | 659601 | 610243 |

采集日期：2026-10-02。识谱/和弦截图时连接真实 Roland FP-30X MIDI，未作答；取图后丢弃内存中的临时练习，没有点击结束保存。前后可见历史记录与主要设置已核对；取图后恢复原选中的 Bocchi 1.1.0 主题。这些画面展示产品界面，不代表新增演奏测试、所有设备兼容或训练效果证明。

原有 `android-v1.5.3-home.png`、`android-v1.5.3-settings.png` 保留作为历史版本画面，不再是 README 的核心截图。主题素材与源代码的许可边界见 [第三方说明](../../THIRD_PARTY_NOTICES.md)。

## 历史英文开发截图

`android-development-en-home.png`、`android-development-en-sight-reading.png`、`android-development-en-chord-practice.png`、`android-development-en-history.png` 是之前真实 QA native package + release-mode Web 开发构建的英文画面，不是最终正式 APK。保留历史文件，不再用作当前 README 主展示。
