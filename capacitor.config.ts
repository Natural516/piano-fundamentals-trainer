import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.pianofundamentals.trainer',
  appName: '钢琴基本功训练器',
  webDir: 'dist/android-tablet-prototype',
  backgroundColor: '#f4f1e9',
  loggingBehavior: 'debug',
  android: {
    allowMixedContent: false,
    backgroundColor: '#f4f1e9',
    minWebViewVersion: 60
  }
}

export default config
