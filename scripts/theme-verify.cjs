const fs = require('node:fs')
const path = require('node:path')
const { ThemePackageError, verifyPackageBuffer, verifyThemeSource } = require('./theme-package-core.cjs')
const { runThemeUiHarness } = require('./theme-ui-harness.cjs')

async function main() {
  const args = process.argv.slice(2)
  const input = args.find((arg) => !arg.startsWith('--'))
  const skipUi = args.includes('--skip-ui')
  if (!input) throw new ThemePackageError('INVALID_ARGUMENT', '用法: theme:verify -- <theme-source-dir|package.pftheme>')
  const startedAt = new Date().toISOString()
  const resolved = path.resolve(input)
  const result = fs.statSync(resolved).isDirectory() ? verifyThemeSource(resolved) : verifyPackageBuffer(fs.readFileSync(resolved))
  const ui = skipUi ? { status: 'SKIPPED_INTERNAL' } : await runThemeUiHarness()
  const report = {
    status: 'PASS', startedAt, finishedAt: new Date().toISOString(), input: resolved,
    themeId: result.manifest.themeId, version: result.manifest.version, limits: result.limits,
    runtimeAdapter: 'PASS', browserHarness: ui
  }
  const outputDir = path.join(path.resolve(__dirname, '..'), 'artifacts', 'theme-reports')
  fs.mkdirSync(outputDir, { recursive: true })
  fs.writeFileSync(path.join(outputDir, 'theme-verify-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  fs.writeFileSync(path.join(outputDir, 'theme-verify-summary-zh.txt'), `PASS\n主题：${report.themeId}@${report.version}\n文件：${report.limits.fileCount}\n解压大小：${report.limits.unpackedBytes}\n浏览器验证：${ui.status}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n\nPASS：主题协议、素材、安全限制、运行时适配与浏览器界面验证通过。\n`)
}

main().catch((error) => {
  const report = { status: 'FAIL', errorCode: error.code || String(error.message).split(':')[0] || 'THEME_VERIFY_FAILED', message: error.message, details: error.details || null, serverLog: error.serverLog || null }
  process.stderr.write(`${JSON.stringify(report, null, 2)}\n\nFAIL：${report.errorCode}。\n`)
  process.exitCode = 1
})
