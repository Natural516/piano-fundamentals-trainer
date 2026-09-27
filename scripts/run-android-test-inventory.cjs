const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const outputDir = path.resolve(process.argv[2] || path.join(root, 'artifacts/android-test-inventory'))
const packageJson = require(path.join(root, 'package.json'))
const names = Object.keys(packageJson.scripts).filter((name) => name.startsWith('test:android-') && name !== 'test:android-all-inventory').sort()
fs.mkdirSync(outputDir, { recursive: true })
const log = []
const results = []
for (const name of names) {
  process.stdout.write(`===== ${name} =====\n`)
  const run = process.platform === 'win32'
    ? spawnSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm.cmd run ${name}`], { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 })
    : spawnSync('npm', ['run', name], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const output = `${run.stdout || ''}${run.stderr || ''}`
  process.stdout.write(output)
  log.push(`===== ${name} =====\n${output}\n===== RESULT ${name} = ${run.status} =====\n`)
  results.push({ name, exitCode: run.status, signal: run.signal || null, error: run.error?.message || null })
}
fs.writeFileSync(path.join(outputDir, '全部Android测试清单.log'), log.join('\n'))
fs.writeFileSync(path.join(outputDir, '全部Android测试清单.json'), `${JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2)}\n`)
console.table(results)
if (results.some((result) => result.exitCode !== 0)) process.exitCode = 1
