/** App-owned B4.1 copy only. Device/port names and theme-author metadata are interpolation values. */
export const shellResources = {
  'zh-CN': {
    navigation: {
      home: '首页', practice: '练习', tools: '工具', history: '记录', settings: '设置',
      primary: '主要导航', back: '返回', openMidi: '打开 MIDI 设备', homeTitle: '今天，读几页新音符', historyTitle: '练习记录',
      landscapeTitle: '请横放平板', landscapeDescription: 'Android V1 专为钢琴谱架上的横屏使用设计。'
    },
    settings: {
      device: '设备', deviceDescription: 'MIDI 输入设备', appearance: '外观', appearanceDescription: '适合谱架距离阅读',
      about: '关于', edition: '个人版', theme: '显示主题', currentTheme: '当前：{{name}}',
      light: '浅色', lightDescription: '明亮清晰', dark: '深色', darkDescription: '低光舒适',
      noExternalThemes: '尚未安装外部主题', importTheme: '导入主题包', themeInfo: '主题信息',
      externalSummary: '{{subtitle}} · {{version}} · 已验证',
      currentVersion: '当前版本', versionCode: 'versionCode {{code}}', personalEdition: 'Android Tablet Personal Edition',
      checkUpdates: '检查更新', updateDescription: '查看版本与更新状态', updateAvailable: '发现新版本',
      updateVerified: '已验证', updateProcessing: '处理中', updateNeedsAttention: '需要检查',
      appUpdates: '应用内更新', qaUpdateDescription: '与正式版独立安装；正式更新通道已关闭', unavailable: '不可用',
      openSource: '开源项目', heroLabel: '孤独摇滚主题设置主视觉', heroAlt: '红发吉他手主题插画'
    },
    midi: {
      title: 'MIDI 输入', device: 'MIDI 设备', readyLabel: 'MIDI 输入就绪', canStart: '可以开始练习',
      notReady: 'MIDI 未就绪', selectInput: '请选择输入端口', retrySelection: '请重新选择 MIDI 设备',
      noOutput: '此设备没有可用的 MIDI 输入，请选择其他设备', needPort: '请选择设备的 MIDI 输入端口',
      invalidPort: '该端口已不可用，请重新选择', removed: '设备已断开，请重新连接',
      openFailed: '无法连接，请检查设备后重试', scanFailed: '扫描未完成，请检查蓝牙后重试',
      bluetoothOffUsb: '蓝牙已关闭；也可以连接 USB MIDI 设备',
      unsupportedLabel: '不支持 MIDI', unsupportedDetail: '此设备无法接收 MIDI 输入',
      permissionLabel: '需要权限', permissionDetail: '允许附近设备后扫描',
      deniedLabel: '权限被拒绝', deniedDetail: '请重新授权附近设备',
      bluetoothOffLabel: '蓝牙已关闭', bluetoothOffDetail: '请先打开系统蓝牙',
      idleLabel: 'MIDI 未连接', idleDetail: '连接 USB MIDI 或扫描 Bluetooth MIDI',
      scanningLabel: '正在扫描', scanningDetail: '查找 Bluetooth MIDI 设备',
      foundLabel: '已发现设备', foundDetail: '请选择 MIDI 设备连接', connecting: '正在连接',
      connectedDevice: '{{deviceName}} 已连接', connectedDetail: '{{transport}} · {{readiness}}', inputPaused: '输入已暂停',
      disconnectedLabel: 'MIDI 已断开', disconnectedDetail: '可重新扫描并连接', errorLabel: 'MIDI 连接错误', errorDetail: '请检查设备连接后重试',
      unsupportedAction: '此设备不支持', disconnect: '断开 MIDI', stopScan: '停止扫描', refresh: '刷新 MIDI 设备',
      heroDescription: '{{detail}}。支持 Bluetooth MIDI 和 USB MIDI；一次连接一个输入设备。',
      connectionMethod: '连接方式', notSelected: '尚未选择', input: 'MIDI 输入', ready: '已就绪', pending: '尚未就绪',
      inputWithPort: '{{readiness}} · 端口 {{port}}', practiceState: '练习状态', canPractice: '可以练习', connectFirst: '请连接设备',
      devices: '发现的 MIDI 设备', devicesFound: '{{count}} 个候选', inputPort: 'MIDI 输入端口',
      deviceInputPort: '{{deviceName}} MIDI 输入端口', selectPort: '请选择端口', connected: '已连接', noInputPort: '无输入端口', connect: '连接',
      candidateDetail: '{{transport}} · {{manufacturer}}', helpTitle: '连接你的 MIDI 设备',
      help: 'USB MIDI：用数据线连接后刷新设备。Bluetooth MIDI：打开设备和系统蓝牙，允许附近设备权限后扫描。',
      bluetoothPermission: 'Bluetooth MIDI 需要附近设备权限；不影响 USB MIDI。',
      bluetoothOffAvailableUsb: '系统蓝牙已关闭；仍可使用 USB MIDI。', bluetoothUnsupported: '此设备不支持 Bluetooth MIDI；请尝试 USB MIDI。',
      scan: '扫描 MIDI 设备', allowDevices: '允许附近设备'
    }
  },
  en: {
    navigation: {
      home: 'Home', practice: 'Practice', tools: 'Tools', history: 'History', settings: 'Settings',
      primary: 'Main navigation', back: 'Back', openMidi: 'Open MIDI devices', homeTitle: 'Read a few new notes today', historyTitle: 'Practice history',
      landscapeTitle: 'Rotate your tablet', landscapeDescription: 'Android V1 is designed for landscape use on a piano music stand.'
    },
    settings: {
      device: 'Device', deviceDescription: 'MIDI input device', appearance: 'Appearance', appearanceDescription: 'Readable from your music stand',
      about: 'About', edition: 'Personal edition', theme: 'Theme', currentTheme: 'Current: {{name}}',
      light: 'Light', lightDescription: 'Bright and clear', dark: 'Dark', darkDescription: 'Comfortable in low light',
      noExternalThemes: 'No external themes installed', importTheme: 'Import theme package', themeInfo: 'Theme information',
      externalSummary: '{{subtitle}} · {{version}} · Verified',
      currentVersion: 'Current version', versionCode: 'versionCode {{code}}', personalEdition: 'Android Tablet Personal Edition',
      checkUpdates: 'Check for updates', updateDescription: 'View version and update status', updateAvailable: 'Update available',
      updateVerified: 'Verified', updateProcessing: 'In progress', updateNeedsAttention: 'Needs attention',
      appUpdates: 'App updates', qaUpdateDescription: 'Installed separately from production; the production update channel is disabled', unavailable: 'Unavailable',
      openSource: 'Open source', heroLabel: 'Bocchi theme Settings illustration', heroAlt: 'Red-haired guitarist theme illustration'
    },
    midi: {
      title: 'MIDI Input', device: 'MIDI device', readyLabel: 'MIDI input ready', canStart: 'Ready to practice',
      notReady: 'MIDI not ready', selectInput: 'Select an input port', retrySelection: 'Select a MIDI device again',
      noOutput: 'This device has no available MIDI input. Select another device.', needPort: 'Select the device’s MIDI input port',
      invalidPort: 'This port is no longer available. Select another port.', removed: 'The device was disconnected. Reconnect it.',
      openFailed: 'Could not connect. Check your device and try again.', scanFailed: 'Scanning did not finish. Check Bluetooth and try again.',
      bluetoothOffUsb: 'Bluetooth is off. You can also connect a USB MIDI device.',
      unsupportedLabel: 'MIDI not supported', unsupportedDetail: 'This device cannot receive MIDI input',
      permissionLabel: 'Permission needed', permissionDetail: 'Allow nearby devices to scan',
      deniedLabel: 'Permission denied', deniedDetail: 'Allow access to nearby devices again',
      bluetoothOffLabel: 'Bluetooth is off', bluetoothOffDetail: 'Turn on system Bluetooth first',
      idleLabel: 'MIDI not connected', idleDetail: 'Connect USB MIDI or scan for Bluetooth MIDI',
      scanningLabel: 'Scanning', scanningDetail: 'Looking for Bluetooth MIDI devices',
      foundLabel: 'Devices found', foundDetail: 'Select a MIDI device to connect', connecting: 'Connecting',
      connectedDevice: 'Connected: {{deviceName}}', connectedDetail: '{{transport}} · {{readiness}}', inputPaused: 'Input paused',
      disconnectedLabel: 'MIDI disconnected', disconnectedDetail: 'Scan again to reconnect', errorLabel: 'MIDI connection error', errorDetail: 'Check the device connection and try again',
      unsupportedAction: 'Not supported on this device', disconnect: 'Disconnect MIDI', stopScan: 'Stop scanning', refresh: 'Refresh MIDI devices',
      heroDescription: '{{detail}} — supports Bluetooth MIDI and USB MIDI, with one input device connected at a time.',
      connectionMethod: 'Connection', notSelected: 'Not selected', input: 'MIDI input', ready: 'Ready', pending: 'Not ready',
      inputWithPort: '{{readiness}} · Port {{port}}', practiceState: 'Practice status', canPractice: 'Ready to practice', connectFirst: 'Connect a device',
      devices: 'Discovered MIDI devices', devicesFound_one: '{{count}} candidate', devicesFound_other: '{{count}} candidates', inputPort: 'MIDI input port',
      deviceInputPort: 'MIDI input port for {{deviceName}}', selectPort: 'Select a port', connected: 'Connected', noInputPort: 'No input port', connect: 'Connect',
      candidateDetail: '{{transport}} · {{manufacturer}}', helpTitle: 'Connect your MIDI device',
      help: 'USB MIDI: connect a data cable, then refresh devices. Bluetooth MIDI: turn on your instrument and system Bluetooth, allow nearby devices, then scan.',
      bluetoothPermission: 'Bluetooth MIDI needs nearby-device permission. USB MIDI is unaffected.',
      bluetoothOffAvailableUsb: 'System Bluetooth is off. USB MIDI is still available.', bluetoothUnsupported: 'This device does not support Bluetooth MIDI. Try USB MIDI.',
      scan: 'Scan MIDI devices', allowDevices: 'Allow nearby devices'
    }
  }
} as const
