const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const base = '5d4ed3bda5a7493726b4741b36a40786992346c7'
const mainPath = 'prototype/android-tablet-v1/src/main.tsx'
const rendererPath = 'src/renderer/src/components/MusicStaffRenderer.tsx'
const read = file => require('./android-repository-cleanup-contract.cjs').read(file)
const oldFile = (file, ref = base) => execFileSync('git', ['show', ref + ':' + file], { cwd: root, encoding: 'utf8', maxBuffer: 64*1024*1024 }).replaceAll('\r\n', '\n')
const astOf = source => ts.createSourceFile(mainPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
function namedNodes(source) {
  const ast = astOf(source), nodes = new Map()
  for (const n of ast.statements) {
    if ((ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isTypeAliasDeclaration(n)) && n.name) nodes.set(n.name.text, { n, ast })
    if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) nodes.set(d.name.getText(ast), { n, ast })
  }
  return nodes
}
const changed = ['THEME_PACKAGE_STAGE_LABELS','ThemePackageDialog','ThemeInfoDialog','updaterStatusCopy','UpdateScreen','ThemeRecoveryBoundary','AndroidAppBootstrap']
const added = ['MusicStaffRenderer','ThemeRecoveryMessage']
const original = oldFile(mainPath), previous = namedNodes(original)
// Earlier stage source guards exclude ONLY explicitly authorized B4.6 presentation declarations.
// The new B4.6 suite separately freezes every other declaration and the effects/actions within these.
function normalizeB46Main(source) {
  source = require('./android-repository-cleanup-contract.cjs').normalize(mainPath, source)
  if (!source.includes("from './localization/remainingPresentation'")) return source
  const nodes = namedNodes(source)
  const replacements = [...changed,...added].map(name => {
    const entry = nodes.get(name); assert.ok(entry, name)
    return { start: entry.n.getStart(entry.ast), end: entry.n.end, value: added.includes(name) ? '' : previous.get(name).n.getText(previous.get(name).ast) }
  }).sort((a,b)=>b.start-a.start)
  for (const r of replacements) source = source.slice(0,r.start)+r.value+source.slice(r.end)
  source = source.replace(/^import \{ presentThemeError, formatThemeInstalledAt, presentUpdaterError \} from '\.\/localization\/remainingPresentation'\n/m,'')
    .replace('MusicStaffRenderer as BaseMusicStaffRenderer','MusicStaffRenderer')
    .replace("import { ThemeRuntimeManager, type InstalledThemeRecord", "import { THEME_PACKAGE_ERRORS, ThemeRuntimeManager, type InstalledThemeRecord")
  // Removing new declarations leaves only their separating newlines; preserve the pre-B4.6 layout.
  source = source.replace(/\n{3,}(?=class ThemeRecoveryBoundary)/, '\n\n')
  return source
}
function assertRendererDisplayOnly(ref = base) {
  const renderer = require('./android-sight-analysis-contract.cjs').normalize(rendererPath, read(rendererPath)).replace('  fontErrorLabel?: string\n','').replace('{props.fontErrorLabel ?? fontError}','{fontError}')
  assert.equal(renderer,oldFile(rendererPath,ref),'shared renderer permits ONLY optional localized error text')
}
function assertFrozenDiff(ref, paths) {
  const cleanup = require('./android-repository-cleanup-contract.cjs'); cleanup.assertCleanupDelta()
  const analysis = require('./android-sight-analysis-contract.cjs')
  analysis.assertAnalysisDelta()
  const analysisExclusions = analysis.allowedPaths.filter(file => paths.some(scope => file === scope || file.startsWith(scope + '/')))
  // New reviewed files have no historical blob; assertAnalysisDelta pins each exact digest above.
  const analysisAdditionExclusions = analysis.additionPaths.filter(file => paths.some(scope => file === scope || file.startsWith(scope + '/')))
  for (const file of analysisExclusions) {
    // Keep the original historical baseline comparison after reversing exact approved hunks.
    const normalized = analysis.normalize(file, read(file))
    if (file !== rendererPath) assert.equal(normalized, oldFile(file, ref), file + ' unchanged beyond exact analysis delta')
  }
  const native = require('./android-localization-native-contract.cjs')
  // B5 separately freezes every native byte except the exact verified resources/two display calls.
  native.assertNativePresentationOnly()
  const exit = require('./android-practice-early-exit-contract.cjs')
  exit.assertEarlyExitDelta()
  const sightRuntime = 'prototype/android-tablet-v1/src/sightReadingIntegration.ts'
  assert.equal(exit.normalizeEarlyExitRuntime(read(sightRuntime)), oldFile(sightRuntime, ref), 'only the exact reviewed early-exit runtime delta is allowed')
  const homePresentation = 'prototype/android-tablet-v1/src/localization/homePresentation.ts'
  const englishExclusions = []
  if (paths.includes(homePresentation)) {
    const english = require('./android-readme-english-presentation-contract.cjs')
    english.assertReadmeEnglishDelta()
    assert.equal(english.normalize(homePresentation, read(homePresentation)), english.normalize(homePresentation, oldFile(homePresentation, ref)), 'only the exact reviewed English Home presentation delta is allowed')
    englishExclusions.push(':(exclude)' + homePresentation)
  }
  const candidate = require('./android-release-candidate-version-contract.cjs')
  assert.equal(candidate.normalizeCandidateVersion(read(candidate.VERSION_PATH)), oldFile(candidate.VERSION_PATH, ref), 'candidate metadata is the only version-file delta')
  execFileSync('git',['diff','--exit-code',ref,'--',...paths,...cleanup.allowedPaths.map(f => ':(exclude)' + f),':(exclude)'+candidate.VERSION_PATH,':(exclude)'+rendererPath,':(exclude)'+sightRuntime,...englishExclusions,...analysisExclusions.map(f => ':(exclude)'+f),...analysisAdditionExclusions.map(f => ':(exclude)'+f),...[...native.allowedPaths].map(f => ':(exclude)'+f)],{cwd:root})
  assertRendererDisplayOnly(ref)
}
const cssSuffix = "/* Theme/update English wrapping only; practice and artwork geometry stay frozen. */\n.theme-manager-modal__card header > span,\n.theme-manager-modal__card dd,\n.update-card .version-line strong,\n.update-release-notes {\n  min-width: 0;\n  overflow-wrap: anywhere;\n}\n.theme-manager-modal__card footer {\n  flex-wrap: wrap;\n}\n.theme-manager-modal__card small,\n.update-card p,\n.update-security-note {\n  white-space: normal;\n  line-height: 1.6;\n}";
function stripB46Css(source) {
  source = require('./android-sight-analysis-contract.cjs').normalize('prototype/android-tablet-v1/src/styles.css', source)
  source=require('./android-language-selector-contract.cjs').stripClickChoiceCss(source)
  if (!source.includes('/* Theme/update English wrapping only;')) return source
  assert.ok(source.endsWith('\n\n'+cssSuffix+'\n'),'only exact B4.6 CSS suffix is allowed')
  return source.slice(0,-('\n\n'+cssSuffix+'\n').length)+'\n'
}
module.exports={base,mainPath,rendererPath,read,oldFile,namedNodes,normalizeB46Main,assertRendererDisplayOnly,assertFrozenDiff,stripB46Css,changed,added}
