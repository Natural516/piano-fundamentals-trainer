export const updaterResources = {
  "zh-CN": {
    "title": "检查更新",
    "reading": "正在读取",
    "processing": "处理中…",
    "cancel": "取消下载",
    "download": "下载更新",
    "install": "交给系统安装",
    "settings": "打开系统设置",
    "waiting": "等待系统安装确认",
    "cannotContinue": "无法继续",
    "retryDownload": "重新下载",
    "retryInstall": "重试安装",
    "retryCheck": "重新检查",
    "checkAgain": "再次检查",
    "check": "检查更新",
    "current": "当前版本",
    "target": "目标版本",
    "notesLabel": "版本说明",
    "notesTitle": "本次更新",
    "noNotes": "此版本没有附加说明。",
    "progress": "下载进度 {{percent}}%",
    "permissionRecheck": "我已返回，重新检查授权",
    "securityNote": "安装始终由 Android 系统确认。更新失败不会影响离线练习与本地记录。",
    "states": {
      "idle": {
        "eyebrow": "更新状态",
        "title": "检查应用更新",
        "detail": "仅在你点击后连接公开的 HTTPS 更新服务。"
      },
      "checking": {
        "eyebrow": "正在检查",
        "title": "正在获取更新信息",
        "detail": "练习、记录与 MIDI 功能不会被更新检查阻塞。"
      },
      "upToDate": {
        "eyebrow": "更新状态",
        "title": "当前没有可用的新版本",
        "detail": "版本判断只使用 Android versionCode。"
      },
      "updateAvailable": {
        "eyebrow": "发现更新",
        "title": "有新的应用版本",
        "detail": "下载后还会验证大小、哈希、包名、版本与永久签名。"
      },
      "downloading": {
        "eyebrow": "正在下载",
        "title": "正在下载更新包",
        "detail": "更新包保存在应用私有缓存中，下载完成前不可安装。"
      },
      "verifying": {
        "eyebrow": "安全验证",
        "title": "正在验证更新包",
        "detail": "所有验证步骤都必须通过，没有跳过按钮。"
      },
      "readyToInstall": {
        "eyebrow": "验证完成",
        "title": "更新包可以交给系统安装",
        "detail": "点击后仍需在 Android 系统安装器中明确确认。"
      },
      "installPermissionRequired": {
        "eyebrow": "需要系统授权",
        "title": "允许此应用安装更新",
        "detail": "打开系统设置并授权后，返回应用重新确认，再次点击安装。"
      },
      "installerLaunched": {
        "eyebrow": "系统安装器",
        "title": "已打开 Android 系统安装器",
        "detail": "这不代表安装已经成功；完成后重新打开应用确认真实版本。"
      },
      "error": {
        "eyebrow": "更新未完成",
        "title": "暂时无法完成这次更新操作",
        "detail": "该问题只影响更新功能，练习与本地记录仍可正常使用。"
      }
    },
    "errors": {
      "MANIFEST_NETWORK_ERROR": "暂时无法获取更新信息，请稍后重试。",
      "MANIFEST_INVALID": "更新信息格式无效，未提供安装。",
      "MANIFEST_UNSUPPORTED_SCHEMA": "此更新信息需要更高版本的应用支持。",
      "PACKAGE_ID_MISMATCH": "更新包与当前应用不匹配。",
      "NO_UPDATE": "当前已经是最新版本。",
      "MANIFEST_OLDER_THAN_INSTALLED": "服务器没有比当前版本更新的安装包。",
      "DOWNLOAD_NETWORK_ERROR": "更新包下载失败，请重新下载。",
      "DOWNLOAD_SIZE_MISMATCH": "更新包大小校验失败，请重新下载。",
      "APK_SHA256_MISMATCH": "更新包完整性校验失败，不能安装。",
      "APK_PACKAGE_MISMATCH": "更新包不属于当前应用，不能安装。",
      "APK_VERSION_MISMATCH": "更新包版本与更新信息不一致。",
      "APK_DOWNGRADE_REJECTED": "不能安装相同或更旧的版本。",
      "APK_SIGNER_MISMATCH": "更新包签名与永久信任身份不一致。",
      "APK_ARCHIVE_INVALID": "下载的文件不是有效的 Android 安装包。",
      "APK_SIGNER_INSPECTION_UNAVAILABLE": "无法确认更新包的当前签名，不能安装。",
      "INSTALL_PERMISSION_REQUIRED": "需要在 Android 系统设置中允许此应用安装更新。",
      "INSTALL_PLATFORM_UNSUPPORTED": "此 Android 设备无法使用受支持的系统安装流程。",
      "INSTALL_LAUNCH_FAILED": "无法打开 Android 系统安装器，请稍后重试。",
      "UPDATER_CONFIGURATION_ERROR": "更新服务尚未配置，其他功能仍可正常使用。",
      "INSTALLED_PACKAGE_INFO_ERROR": "无法读取当前安装版本，已停止更新检查。"
    }
  },
  "en": {
    "title": "Check for updates",
    "reading": "Reading version",
    "processing": "Processing…",
    "cancel": "Cancel download",
    "download": "Download update",
    "install": "Open Android installer",
    "settings": "Open Android settings",
    "waiting": "Waiting for Android installation confirmation",
    "cannotContinue": "Cannot continue",
    "retryDownload": "Download again",
    "retryInstall": "Retry installation",
    "retryCheck": "Check again",
    "checkAgain": "Check again",
    "check": "Check for updates",
    "current": "Current version",
    "target": "Target version",
    "notesLabel": "Release notes",
    "notesTitle": "What is new",
    "noNotes": "No release notes were provided.",
    "progress": "Download progress {{percent}}%",
    "permissionRecheck": "I have returned — check permission again",
    "securityNote": "Android always asks you to confirm installation. Update failures do not affect offline practice or local history.",
    "states": {
      "idle": {
        "eyebrow": "Update status",
        "title": "Check for app updates",
        "detail": "The public HTTPS update service is contacted only when you choose to check."
      },
      "checking": {
        "eyebrow": "Checking",
        "title": "Fetching update information",
        "detail": "Update checks do not block practice, history or MIDI."
      },
      "upToDate": {
        "eyebrow": "Update status",
        "title": "No newer version is available",
        "detail": "Versions are compared using Android versionCode."
      },
      "updateAvailable": {
        "eyebrow": "Update available",
        "title": "A new app version is available",
        "detail": "The download must pass size, hash, package, version and signature checks."
      },
      "downloading": {
        "eyebrow": "Downloading",
        "title": "Downloading the update",
        "detail": "The package is kept in private app cache. Installation is unavailable until the download finishes."
      },
      "verifying": {
        "eyebrow": "Security checks",
        "title": "Verifying the update",
        "detail": "Every verification step must pass. There is no skip option."
      },
      "readyToInstall": {
        "eyebrow": "Verified",
        "title": "Ready for the Android installer",
        "detail": "You must still confirm installation in the Android system installer."
      },
      "installPermissionRequired": {
        "eyebrow": "Permission needed",
        "title": "Allow this app to install updates",
        "detail": "Grant permission in Android settings, return here, then choose to install again."
      },
      "installerLaunched": {
        "eyebrow": "Android installer",
        "title": "Android installer opened",
        "detail": "This does not confirm a successful installation. Reopen the app afterwards to check its version."
      },
      "error": {
        "eyebrow": "Update not completed",
        "title": "This update action could not be completed",
        "detail": "Only updating is affected. Practice and local history remain available."
      }
    },
    "errors": {
      "MANIFEST_NETWORK_ERROR": "Could not fetch update information. Please try again later.",
      "MANIFEST_INVALID": "The update information is invalid. Installation is unavailable.",
      "MANIFEST_UNSUPPORTED_SCHEMA": "This update information requires a newer app version.",
      "PACKAGE_ID_MISMATCH": "The update package does not match this app.",
      "NO_UPDATE": "You are already using the latest version.",
      "MANIFEST_OLDER_THAN_INSTALLED": "The server has no package newer than the installed version.",
      "DOWNLOAD_NETWORK_ERROR": "The update download failed. Please try again.",
      "DOWNLOAD_SIZE_MISMATCH": "The update size does not match. Please download it again.",
      "APK_SHA256_MISMATCH": "The update integrity check failed. Installation is blocked.",
      "APK_PACKAGE_MISMATCH": "The package does not belong to this app. Installation is blocked.",
      "APK_VERSION_MISMATCH": "The package version does not match the update information.",
      "APK_DOWNGRADE_REJECTED": "The same or an older version cannot be installed.",
      "APK_SIGNER_MISMATCH": "The package signer does not match the trusted identity.",
      "APK_ARCHIVE_INVALID": "The downloaded file is not a valid Android package.",
      "APK_SIGNER_INSPECTION_UNAVAILABLE": "The package signer could not be confirmed. Installation is blocked.",
      "INSTALL_PERMISSION_REQUIRED": "Allow this app to install updates in Android settings.",
      "INSTALL_PLATFORM_UNSUPPORTED": "This device cannot use the supported Android installation flow.",
      "INSTALL_LAUNCH_FAILED": "Could not open the Android installer. Please try again later.",
      "UPDATER_CONFIGURATION_ERROR": "The update service is not configured. Other features are still available.",
      "INSTALLED_PACKAGE_INFO_ERROR": "Could not read the installed version. The update check has stopped."
    }
  }
} as const
