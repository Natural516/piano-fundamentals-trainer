# Security

普通用户的安装说明见 [README](README.md)。本页集中说明安装包、更新与主题包的验证边界。

## 正式 APK 与签名

Android 正式应用的包名为 `com.pianofundamentals.trainer`。兼容的覆盖升级必须沿用正式签名身份，版本序号必须递增。Debug APK 不具有正式签名身份。

永久 Release certificate SHA-256：

```text
19:3D:A3:16:AE:F6:A2:2F:9C:15:D1:01:9E:25:87:E7:25:85:8A:70:8B:D0:07:7A:D8:58:98:CD:65:57:96:32
```

公开证书指纹不是私钥。永久签名私钥、密码和真实 keystore 配置必须保管在仓库外，不能提交到 Git，也不能贴入 Issue、日志或截图。维护者基础设施说明见 [android/RELEASE_SIGNING.md](android/RELEASE_SIGNING.md)；当前应用版本应读取 `android/version.properties`，而不是沿用历史工程文档中的阶段版本。

## 下载完整性与应用内更新

正式下载入口为 [GitHub Releases](https://github.com/Natural516/piano-fundamentals-trainer/releases)。SHA-256 校验用于检测文件字节是否与发布信息一致；它不能单独替代签名与来源验证。

应用内更新由用户主动检查。原生 HTTPS 获取 manifest 后，现有 strict parser 验证格式与版本；下载 APK 时检查包名、版本、文件大小、SHA-256 与当前正式 signer。仅通过验证的包才可交给 Android 系统安装，启动安装器不等于已经安装成功。

canonical manifest 地址：

```text
https://github.com/Natural516/piano-fundamentals-trainer/releases/latest/download/latest.json
```

维护者的单一配置源为 `android/updater.properties`。不要为了网络问题关闭 HTTPS、修改信任规则、放宽 manifest parser 或跳过 APK 校验。

## 外部主题

`.pftheme` 导入会检查受信任签名、包内容与兼容范围；外部包不执行任意业务代码，也不能改变题目、判定或练习统计。主题包与 APK 是不同产物，不共享私钥用途。主题架构见 [DEVELOPMENT](DEVELOPMENT.md)。

## 数据与问题反馈

练习记录和主要设置保存在设备本地。分享截图、日志或问题报告前，应检查是否包含个人信息、网络标识或凭据。不要在公开反馈中附带私钥、密码或完整设备数据；若需敏感信息协助排查，先与维护者确认安全提交方式。
