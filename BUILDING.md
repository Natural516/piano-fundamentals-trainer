# Building

本页面向开发者。普通用户请从 [GitHub Releases](https://github.com/Natural516/piano-fundamentals-trainer/releases/latest) 下载 APK，无需自行构建。

## 环境

- Node.js 与 npm：安装项目依赖，使用仓库的 `package-lock.json`。
- Android Studio / Android SDK 与适用于当前 Gradle wrapper 的 JDK：用于原生 Android 构建。
- 在 `android/local.properties` 中配置本机 SDK 路径；这是机器相关配置，不应加入公开仓库。

具体 Android 插件与依赖版本见 `android/build.gradle`、`android/gradle/wrapper/gradle-wrapper.properties` 和 `package.json`，不以本文另立版本源。

## 安装依赖与公开验证

在仓库根目录执行（Windows PowerShell）：

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run test:android-release-preparation
npm.cmd run test:android-interval-theory
```

公开验证入口以 `package.json` 已定义的命令为准。本仓库没有 `test:public` 命令；不要用不存在的命令替代实际检查。

## 构建 Debug APK

```powershell
npm.cmd run android:apk:debug
npm.cmd run test:android-shell
npm.cmd run android:verify:debug
```

`android:apk:debug` 构建 Android Web UI、同步 Capacitor，再运行 Gradle `assembleDebug`。默认输出为 `android/app/build/outputs/apk/debug/app-debug.apk`。

`test:android-shell` 需要上述 Debug APK 已存在；它不是无需构建产物即可运行的纯源码检查。

Debug APK 用于开发，不是正式下载产物。Debug 与正式应用签名不同，不应直接覆盖用户的正式安装，更不要为了测试要求用户清除正式应用数据。

## 其它入口

- Web UI 本地预览：`npm.cmd run prototype:android`。
- Android Web UI 构建：`npm.cmd run build:prototype:android`。
- 专项检查见 `package.json` 的 `test:android-*` 命令。
- 原生签名与维护者 Release 操作见 [android/RELEASE_SIGNING.md](android/RELEASE_SIGNING.md)。官方私钥不在公开仓库中，普通贡献者不应尝试复制官方签名身份。

本文是命令说明，不代表列出的所有构建或设备验证已在当前文档改版中重新执行。
