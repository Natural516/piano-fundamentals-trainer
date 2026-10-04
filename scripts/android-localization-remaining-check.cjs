const assert = require('node:assert/strict'), path = require('node:path'), Module = require('node:module'), ts = require('typescript')
const React = require('react'), { act } = require('react-test-renderer')
const { execFileSync } = require('node:child_process')
const guard = require('./android-localization-remaining-contract.cjs')
const { mounted, ui, text, contains, businessBytes, translator } = require('./android-localization-shell-check.cjs')
const { audit, auditEnglish } = require('./android-localization-residual-audit.cjs')
const root = path.resolve(__dirname, '..'), actual = guard.read(guard.mainPath), nodes = guard.namedNodes(actual)
const declaration = name => nodes.get(name).n.getText(nodes.get(name).ast)
const transpile = (source, filename) => ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText
function compile(source, file) {
  const m = new Module(path.join(root, file), module); m.filename = path.join(root, file); m.paths = Module._nodeModulePaths(path.dirname(m.filename))
  m._compile(transpile(source, m.filename), m.filename); return m.exports
}
const themeSource = guard.read('prototype/android-tablet-v1/src/theme/themePackageRuntime.ts')
const themeAst = ts.createSourceFile('theme.ts', themeSource, ts.ScriptTarget.Latest, true)
const themeClass = themeAst.statements.find(n => ts.isClassDeclaration(n) && n.name.text === 'ThemeRuntimeManager').getText(themeAst)
// Test fixture sets stable state; Vite's development-only source-loading branch is not invoked.
const { ThemeRuntimeManager } = compile(themeClass.replaceAll('import.meta.env.DEV', 'false'), 'prototype/android-tablet-v1/src/theme/__remaining_contract__.tsx')
const components = compile(`
import { useState, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppLocale } from './localization/LocaleProvider'
import { presentThemeError, presentUpdaterError, formatThemeInstalledAt } from './localization/remainingPresentation'
const { Icon, ProductHeader, useUpdaterUi, useAppNavigation, useThemeRuntime } = require('../../../scripts/android-localization-shell-check.cjs').ui
${['THEME_PACKAGE_STAGE_LABELS','ThemePackageDialog','ThemeInfoDialog','updaterStatusCopy','UpdateScreen','ThemeRecoveryMessage'].map(declaration).join('\n')}
export { ThemePackageDialog, ThemeInfoDialog, UpdateScreen, ThemeRecoveryMessage }
`, guard.mainPath)
const { UpdaterController } = require('../prototype/android-tablet-v1/src/updaterCore.ts')
const { presentThemeError, presentUpdaterError } = require('../prototype/android-tablet-v1/src/localization/remainingPresentation.ts')
const { localizationResources } = require('../prototype/android-tablet-v1/src/localization/resources.ts')
const { createLocalizationInstance } = require('../prototype/android-tablet-v1/src/localization/localizationService.ts')
const record = { themeId: 'natural516.bocchi', name: '孤独摇滚 Original name', subtitle: '作者原文 ♭', version: '1.1.0', themeApiVersion: 1, trustKeyId: 'PRODUCTION-original', installedAt: '2026-10-02T08:00:00Z', minAppVersion: '1.6.0', maxAppVersionExclusive: '2.0.0', packageSha256: '51EE74CF07190B97693E52F01A3A5E1596DFE2DAB63449728AE13B6CE4378B09' }
const external = { id: record.themeId, displayName: record.name, subtitle: record.subtitle, source: 'external', version: record.version, capabilities: { settingsVisual: { kind: 'standard' }, intervalPracticeVisual: { assets: { activeBorder: 'original-active-border.png' } } } }
function themeFixture(extra = {}) {
  const manager = new ThemeRuntimeManager(external, () => external), calls = []
  manager.state = { ready: true, activeTheme: external, installed: [record], inspection: null, progressStage: null, errorCode: null, pendingActivation: false, ...extra }
  for (const name of ['initialize','selectBuiltIn','selectThemeId','activateExternal','inspectPackage','installInspected','verify','remove','recoverExternal']) manager[name] = async () => { calls.push(name); throw new Error('NOT_A_LOCALE_ACTION') }
  return { manager, calls }
}
const manifest = { schemaVersion: 1, packageId: 'com.pianofundamentals.trainer', versionName: '1.6.0', versionCode: 14, apkUrl: 'https://github.com/Natural516/piano-fundamentals-trainer/releases/download/v1.6.0/piano-fundamentals-trainer-1.6.0-vc14-production.apk', apkSha256: 'E484EC1ECBAE38D45F481B4F073D633419D78F7BF8222FD90AA245F18D5706A0', apkSizeBytes: 6556830, publishedAt: '2026-10-02T08:00:00Z', releaseNotes: ['服务器中文原文，保持不变。', 'Source-owned original release notes'] }
function updaterFixture(status = 'updateAvailable') {
  const calls = [], ports = {}
  for (const name of ['getInstalledPackageInfo','fetchManifest','invalidateSelection','downloadAndVerify','cancelDownload','getInstallCapability','openInstallSettings','installVerifiedArtifact']) ports[name] = async () => { calls.push(name); throw new Error('NOT_A_LOCALE_ACTION') }
  const controller = new UpdaterController('https://github.com/Natural516/piano-fundamentals-trainer/releases/latest/download/latest.json', ports)
  controller.state = { status, installed: { packageId: manifest.packageId, versionName: '1.5.3', versionCode: 13 }, manifest, progress: { percent: 42.5, receivedBytes: 2786652, totalBytes: 6556830 }, errorCode: status === 'error' ? 'MANIFEST_NETWORK_ERROR' : null, errorMessage: status === 'error' ? '暂时无法获取更新信息，请稍后重试。' : null, retryAction: status === 'error' ? 'check' : null }
  controller.verified = { token: 'UNCHANGED_AUTHORIZATION', sha256: manifest.apkSha256 }
  function Owner() {
    const [, rerender] = React.useState(0)
    React.useEffect(() => controller.subscribe(() => rerender(n => n + 1)), [])
    return React.createElement(ui.UpdaterUiContext.Provider, { value: { controller, snapshot: controller.snapshot } }, React.createElement(components.UpdateScreen))
  }
  return { controller, calls, Owner }
}
const tests = [], test = (id, description, run) => tests.push({ id, description, run })
async function roundTrip(h, labels) {
  if (labels?.[0]) contains(h.getText(), labels[0])
  await h.switchTo('en'); if (labels?.[1]) contains(h.getText(), labels[1])
  await h.switchTo('zh-CN'); if (labels?.[0]) contains(h.getText(), labels[0])
}
test('R1', 'actual Settings theme page preserves built-in and external identity', () => mounted('settings', async h => { await roundTrip(h, ['外观','Appearance']); contains(h.getText(), record.name); assert.deepEqual(h.pointerCalls, []) }, { theme: external, installed: [record] }))
test('R2', 'actual import/inspection/information dialogs render zh/en accessibility and actions', async () => {
  for (const info of [false, true]) {
    const f = themeFixture(info ? {} : { inspection: { ...record, signatureStatus: 'VERIFIED' } })
    await mounted('chord-flow', h => roundTrip(h, info ? ['主题信息','Theme information'] : ['安装主题','Install theme']), { render: () => React.createElement(info ? components.ThemeInfoDialog : components.ThemePackageDialog, { manager: f.manager, record, active: true, onClose() {} }) })
    assert.deepEqual(f.calls, [])
  }
})
test('R3', 'theme IDs, installed facts and optional slot URLs survive locale round trip', async () => {
  const f = themeFixture(), before = JSON.stringify(f.manager.snapshot)
  await mounted('chord-flow', async h => { await roundTrip(h, ['选择主题包','Choose theme package']); assert.equal(JSON.stringify(f.manager.snapshot), before); assert.equal(f.manager.snapshot.activeTheme, external) }, { render: () => React.createElement(components.ThemePackageDialog, { manager: f.manager, onClose() {} }) })
})
test('R4', 'metadata/source text remains verbatim in English', async () => {
  const f = themeFixture({ inspection: { ...record, signatureStatus: 'VERIFIED' } })
  await mounted('chord-flow', async h => { await h.switchTo('en'); for (const v of [record.name,record.subtitle,record.version,record.minAppVersion,record.maxAppVersionExclusive]) contains(h.getText(), v) }, { render: () => React.createElement(components.ThemePackageDialog, { manager: f.manager, onClose() {} }) })
})
test('R5', 'actual subscribed Theme UI locale switch invokes no manager action and writes only preference', async () => {
  const f = themeFixture()
  await mounted('chord-flow', async h => { const before = businessBytes(h.backend), writes = h.backend.writes.length; await roundTrip(h); assert.deepEqual(f.calls, []); assert.deepEqual(businessBytes(h.backend), before); assert.equal(h.backend.writes.length-writes, 2) }, { render: () => React.createElement(components.ThemeInfoDialog, { manager: f.manager, record, active: true, onClose() {} }) })
})
test('R6', 'Theme API, recipes, PNGs, package/signature/trust and native business are byte frozen; exact B5 presentation delta verified', () => guard.assertFrozenDiff(guard.base, ['theme-packages','theme-api','android','prototype/android-tablet-v1/src/theme']))
test('R7', 'approved visible artwork/headlines remain identical and intentionally deferred', () => {
  const previous = guard.namedNodes(guard.oldFile(guard.mainPath))
  for (const name of ['HomeScreen','PracticeHubScreen','ToolsHubScreen','HistoryScreen','SettingsScreen']) assert.equal(declaration(name), previous.get(name).n.getText(previous.get(name).ast))
})
test('R8', 'actual updater page is bilingual with unchanged current/target version notation', async () => {
  const f = updaterFixture()
  await mounted('chord-flow', async h => { await roundTrip(h, ['下载更新','Download update']); contains(h.getText(),'V1.5.3 · 13'); contains(h.getText(),'V1.6.0 · 14') }, { render: () => React.createElement(f.Owner) })
})
test('R9', 'all 10 updater statuses mount in both locales with existing disabled/action rules', async () => {
  for (const status of Object.keys(localizationResources.en.updater.states)) {
    const f = updaterFixture(status)
    await mounted('chord-flow', async h => { const button = () => h.renderer.root.findAllByType('button').find(b => /is-wide/.test(b.props.className)); const disabled = button().props.disabled; await roundTrip(h, [translator('zh-CN','updater')('states.'+status+'.title'),translator('en','updater')('states.'+status+'.title')]); assert.equal(button().props.disabled, disabled); assert.deepEqual(f.calls,[]) }, { render: () => React.createElement(f.Owner) })
  }
})
test('R10', 'updater snapshot/version/hash/authorization/progress remain identical', async () => {
  for (const status of ['downloading','readyToInstall','installPermissionRequired','installerLaunched','error']) {
    const f = updaterFixture(status), before = JSON.stringify(f.controller.snapshot), auth = f.controller.verified
    await mounted('chord-flow', async h => { await roundTrip(h); assert.equal(JSON.stringify(f.controller.snapshot),before); assert.equal(f.controller.verified,auth) }, { render: () => React.createElement(f.Owner) })
  }
})
test('R11', 'locale switching calls no network/download/installer/native port or reset', async () => {
  const f = updaterFixture(), state = f.controller.state
  await mounted('chord-flow', async h => { const bytes = businessBytes(h.backend); await roundTrip(h); assert.deepEqual(f.calls,[]); assert.equal(f.controller.state,state); assert.deepEqual(businessBytes(h.backend),bytes) }, { render: () => React.createElement(f.Owner) })
})
test('R12', 'server notes stay exact source text; surrounding accessibility translates', async () => {
  const f = updaterFixture()
  await mounted('chord-flow', async h => { await h.switchTo('en'); assert.deepEqual(h.renderer.root.findAllByType('li').map(text), manifest.releaseNotes); assert.equal(h.renderer.root.findByProps({className:'update-release-notes'}).props['aria-label'], translator('en','updater')('notesLabel')) }, { render: () => React.createElement(f.Owner) })
})
test('R13', 'all stable Theme and Updater reasons have explicit English; unknown reason stays generic', () => {
  for (const ns of ['themeManagement','updater']) for (const code of Object.keys(localizationResources.en[ns].errors)) assert.equal((ns==='updater'?presentUpdaterError:presentThemeError)(code,translator('en',ns)), localizationResources.en[ns].errors[code])
  assert.equal(presentThemeError('RAW_SECRET',translator('en','themeManagement')), translator('en','themeManagement')('failed'))
})
test('R14', 'version/signing/updater release contracts and production source are frozen', () => execFileSync('git',['diff','--exit-code',guard.base,'--','android/version.properties','scripts/android-release-preparation-check.cjs','prototype/android-tablet-v1/src/updaterCore.ts','prototype/android-tablet-v1/src/androidUpdater.ts','prototype/android-tablet-v1/src/updaterManifestSource.ts'],{cwd:root}))
test('R15', 'Android Web TS/TSX Chinese inventory and visible fixed English JSX are classified', () => { const evidence = [...audit(),...auditEnglish()]; assert.ok(evidence.length > 100); for (const e of evidence) assert.ok(e.category && e.reason && e.line) })
test('R16', 'no unclassified user-owned Chinese literal remains in migrated UI', () => { for (const name of guard.changed) assert.doesNotMatch(declaration(name), /[\u3400-\u9fff]/); audit() })
test('R17', 'allowlist preserves approved literals exactly, with per-item reasons instead of grep zero', () => { const evidence = audit(); for (const category of ['A','B','D','E']) assert.ok(evidence.some(e=>e.category===category)); assert.ok(evidence.some(e=>e.value.includes('暂无'))) })
test('R18', 'React keys and action/disabled identities remain source-frozen', () => {
  const previous = guard.namedNodes(guard.oldFile(guard.mainPath))
  const attrs = source => { const ast = ts.createSourceFile('x.tsx',source,99,true,ts.ScriptKind.TSX), result=[]; function visit(n) { if (ts.isJsxAttribute(n) && ['key','disabled','onClick'].includes(n.name.getText(ast))) { const value=n.getText(ast); if (!value.includes('setStatus')) result.push(value) } if (ts.isPropertyAssignment(n) && ['run','disabled'].includes(n.name.getText(ast))) result.push(n.getText(ast)); ts.forEachChild(n,visit) } visit(ast); return result }
  for (const name of ['ThemePackageDialog','ThemeInfoDialog','UpdateScreen','AndroidAppBootstrap']) assert.deepEqual(attrs(declaration(name)),attrs(previous.get(name).n.getText(previous.get(name).ast)),name)
})
test('R19', 'every unrelated production declaration and core lifecycle is byte-frozen', () => {
  assert.equal(guard.normalizeB46Main(actual),guard.oldFile(guard.mainPath))
  guard.assertRendererDisplayOnly()
  execFileSync('git',['diff','--exit-code',guard.base,'--','src',':(exclude)'+guard.rendererPath,'prototype/android-tablet-v1/src/chordPractice','prototype/android-tablet-v1/src/intervalPractice','prototype/android-tablet-v1/src/musicTheory'],{cwd:root})
  const old=guard.namedNodes(guard.oldFile(guard.mainPath))
  const effect = source => { const a=ts.createSourceFile('x.tsx',source,99,true,ts.ScriptKind.TSX), r=[];function f(n){if(ts.isCallExpression(n)&&n.expression.getText(a)==='useEffect')r.push(n.getText(a));ts.forEachChild(n,f)}f(a);return r }
  assert.deepEqual(effect(declaration('AndroidAppBootstrap')),effect(old.get('AndroidAppBootstrap').n.getText(old.get('AndroidAppBootstrap').ast)))
  for (const name of ['ThemePackageDialog','ThemeInfoDialog']) { const calls = source => { const a=ts.createSourceFile('x.tsx',source,99,true,ts.ScriptKind.TSX),r=[];function f(n){if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&n.expression.expression.getText(a)==='manager')r.push(n.getText(a));ts.forEachChild(n,f)}f(a);return r };assert.deepEqual(calls(declaration(name)),calls(old.get(name).n.getText(old.get(name).ast))) }
})
test('R20', 'B5 permits exact native resources/two unnamed MIDI fallbacks only; native behavior unchanged', () => require('./android-localization-native-contract.cjs').assertNativePresentationOnly())
test('R21', 'all new leaves exist explicitly in English with placeholder parity and fallback disabled', () => {
  const leaves=(o,p='')=>Object.entries(o).flatMap(([k,v])=>typeof v==='string'?[[p+k,v]]:leaves(v,p+k+'.'))
  for (const ns of ['themeManagement','updater']) {
    const zh=leaves(localizationResources['zh-CN'][ns]),en=leaves(localizationResources.en[ns]);assert.deepEqual(zh.map(v=>v[0]),en.map(v=>v[0]));const instance=createLocalizationInstance('en');instance.options.fallbackLng=false;const t=instance.getFixedT('en',ns);assert.equal(instance.options.fallbackLng,false)
    for (let i=0;i<zh.length;i++) { assert.ok(en[i][1]);assert.deepEqual([...zh[i][1].matchAll(/{{([^}]+)}}/g)].map(m=>m[1]).sort(),[...en[i][1].matchAll(/{{([^}]+)}}/g)].map(m=>m[1]).sort());assert.equal(t(en[i][0],{percent:42}),en[i][1].replaceAll('{{percent}}','42')) }
  }
})
test('R22', 'font error prop is optional only and shared geometry/effects remain identical', () => { guard.assertRendererDisplayOnly(); assert.ok(declaration('MusicStaffRenderer').includes('fontErrorLabel={t(\'fontFailed\')}')) })
test('R23', 'local CSS adjustment is exact append-only wrapping, not geometry or global responsive', () => assert.equal(guard.stripB46Css(guard.read('prototype/android-tablet-v1/src/styles.css')),guard.oldFile('prototype/android-tablet-v1/src/styles.css')))
test('R24', 'async verification status keeps reason facts and rerenders in the current locale', async () => {
  const f=themeFixture();let resolve;f.manager.verify=()=>new Promise(r=>{resolve=r})
  await mounted('chord-flow',async h=>{await act(async()=>h.renderer.root.findAllByType('button').find(b=>text(b)==='验证主题').props.onClick());contains(h.getText(),'正在验证主题');await h.switchTo('en');contains(h.getText(),'Verifying theme');await act(async()=>resolve());contains(h.getText(),'Theme integrity verified');await h.switchTo('zh-CN');contains(h.getText(),'主题完整');assert.deepEqual(f.calls,[])},{render:()=>React.createElement(components.ThemeInfoDialog,{manager:f.manager,record,active:true,onClose(){}})})
})
test('R25', 'delete confirmation translates without deleting or changing active pointer', async () => {
  const f=themeFixture();await mounted('chord-flow',async h=>{await act(async()=>h.renderer.root.findAllByType('button').find(b=>text(b)==='删除主题').props.onClick());await roundTrip(h,['确认删除（将先切换浅色）','The app will switch to Light first.']);assert.deepEqual(f.calls,[]);assert.equal(f.manager.snapshot.activeTheme,external)},{render:()=>React.createElement(components.ThemeInfoDialog,{manager:f.manager,record,active:true,onClose(){}})})
})
test('R26', 'all seven import stages translate without native revalidation', async () => {
  for (const stage of Object.keys(localizationResources.en.themeManagement.stages)) {const f=themeFixture({progressStage:stage});await mounted('chord-flow',h=>roundTrip(h,[translator('zh-CN','themeManagement')('stages.'+stage),translator('en','themeManagement')('stages.'+stage)]),{render:()=>React.createElement(components.ThemePackageDialog,{manager:f.manager,onClose(){}})});assert.deepEqual(f.calls,[])}
})
test('R27', 'Theme recovery message is bilingual without new lifecycle or theme business action',()=>mounted('chord-flow',h=>roundTrip(h,['主题恢复','Theme recovery']),{render:()=>React.createElement(components.ThemeRecoveryMessage)}))
test('R28', 'actual bootstrap loading/failure changes language without retry/reinitializing or leaking raw errors', async () => {
  const { buildBootstrap } = compile(`import { useState,useEffect } from 'react'; import { useTranslation } from 'react-i18next';
    const { useThemeRuntime } = require('../../../scripts/android-localization-shell-check.cjs').ui;
    export function buildBootstrap(dependencies) {
      const { ThemeRuntimeManager, createBrowserAndroidSightReadingRuntime } = dependencies;
      const SHOW_DEVELOPMENT_TOOLS=false, resolveInitialThemeId=()=> 'light',resolveTheme=()=>({id:'light'}),Capacitor={isNativePlatform:()=>false};
      function App(){return <div>RUNTIME_READY</div>}
      ${declaration('AndroidAppBootstrap')}
      return AndroidAppBootstrap
    }`,guard.mainPath)
  let reject, constructions=0, initializations=0, factories=0
  const f=themeFixture()
  f.manager.initialize=async()=>{initializations++}
  const Component=buildBootstrap({ThemeRuntimeManager:class { constructor(){constructions++;return f.manager} },createBrowserAndroidSightReadingRuntime:()=>{factories++;return new Promise((_,r)=>{reject=r})}})
  await mounted('chord-flow',async h=>{await roundTrip(h,[localizationResources['zh-CN'].common.loading,localizationResources.en.common.loading]);assert.deepEqual([constructions,initializations,factories],[1,1,1]);await act(async()=>reject(new Error('RAW_PRIVATE_RUNTIME_EXCEPTION')));await roundTrip(h,[localizationResources['zh-CN'].common.initFailed,localizationResources.en.common.initFailed]);assert.doesNotMatch(h.getText(),/RAW_PRIVATE_RUNTIME_EXCEPTION/);assert.deepEqual([constructions,initializations,factories],[1,1,1])},{render:()=>React.createElement(Component)})
})
if (require.main === module) void (async()=> {let passed=0;for(const t of tests){try{await t.run();passed++;console.log(`PASS ${t.id} ${t.description}`)}catch(e){console.error(`FAIL ${t.id} ${t.description}\n${e.stack}`)}}console.log(`\n${passed}/${tests.length} B4.6 remaining presentation checks PASS`);if(passed!==tests.length)process.exitCode=1})()
