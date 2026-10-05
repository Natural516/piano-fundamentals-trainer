const fs = require('node:fs')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const main = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/main.tsx'), 'utf8')
const themeResources = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/themeManagementResources.ts'), 'utf8')
const settingsResources = fs.readFileSync(path.join(root, 'prototype/android-tablet-v1/src/localization/shellResources.ts'), 'utf8')
const checks = [
  '导入主题包', '选择主题包', '安装', '更新主题', '主题信息', '验证主题', '删除主题',
  '尚未安装外部主题', '主题完整', '正在检查签名', '正在检查素材', '确认删除'
]
// Display copy now belongs to the explicit bilingual namespace, not domain identity.
for (const text of checks) if (!(main + themeResources + settingsResources).includes(text)) throw new Error(`Missing Settings theme management text: ${text}`)
const options = main.slice(main.indexOf('const SETTINGS_THEME_OPTIONS'), main.indexOf('function SettingsThemeOption'))
if (/bocchi-dev|natural516\.bocchi/.test(options)) throw new Error('external Bocchi must not be an ordinary built-in option')
if (!/themeRuntime\.installed\.map\(\(record\)/.test(main)) throw new Error('installed external themes must render from runtime records')
console.log(`PASS android theme settings (${checks.length + 2}/${checks.length + 2})`)
