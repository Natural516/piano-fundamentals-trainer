const assert = require('node:assert/strict')
const path = require('node:path'), ts = require('typescript')
const { execFileSync } = require('node:child_process')
const { read, oldFile, namedNodes, mainPath } = require('./android-localization-remaining-contract.cjs')
const root = path.resolve(__dirname, '..'), prefix = 'prototype/android-tablet-v1/src/'
const mainPolicy = {
  screens: ['E', 'Legacy route metadata; visible titles use stable route ID resources; QA dock retains this inventory'],
  productNavigation: ['E', 'Legacy metadata; BottomNavigation displays navigation resources by stable ID'],
  presentMidiStatus: ['E', 'Only ReviewDock consumes this legacy presenter; production uses presentLocalizedMidiStatus'],
  NOTE_POOL_LABELS: ['E', 'Unused legacy table; current settings use resource IDs'],
  formatChordKeyName: ['E', 'Unused legacy key formatter; current practice and queries use stable-key localization adapters'],
  NotationPaper: ['E', 'Legacy default; every production invocation supplies an explicit localized label'],
  PracticeHubScreen: ['B', 'Approved theme-only Hero headline and small text; standard module cards already localized'],
  THEORY_TOOLS: ['E', 'Legacy metadata values; tools UI projects title/description from stable resource IDs'],
  ToolsHubScreen: ['B', 'Approved themed visual slogan, intentionally deferred'],
  ChordPracticeScreen: ['E', 'Static QA-only preview labels; live production runtime uses localized presentation'],
  HistoryScreen: ['B', 'Approved themed history visual headline, intentionally deferred'],
  SETTINGS_THEME_OPTIONS: ['E', 'Legacy metadata; visible built-in names project from stable Light/Dark IDs'],
  SettingsScreen: ['B', 'Approved themed Settings hero caption, intentionally deferred'],
  ReviewDock: ['E', 'QA/development-only review UI; absent from production build']
}
const filePolicy = {
  'ChordGrandStaff.tsx': ['E', 'Legacy aria/font-error defaults; production Chord caller supplies localized values'],
  'chordPracticeMocks.ts': ['E', 'QA-only preview fixtures'],
  'chordQueryTool.ts': ['D', 'Legacy catalog labels; stable type/group IDs drive theoryQuery presentation'],
  'intervalQueryTool.ts': ['D', 'Legacy theory result compatibility strings; stable facts drive theoryQuery presentation'],
  'scaleKeySignatureTool.ts': ['D', 'Legacy key metadata; stable key IDs drive theoryQuery presentation'],
  'updaterCore.ts': ['D', 'Legacy controlled error text; UI now projects stable error codes, not raw Chinese messages'],
  'practiceHubProjection.ts': ['E', 'Removed summary presentation compatibility output; not rendered by current Hub'],
  'historyProjection.ts': ['D', 'Legacy projection contract; normal UI uses localized fact-based presenters'],
  'sightReadingIntegration.ts': ['D', 'Legacy controlled failures and formatters; display uses localized status IDs'],
  'sightReadingPresentation.ts': ['D', 'Legacy Chinese presenter retained for compatibility; production uses localization adapter'],
  'chordPractice/persistence.ts': ['D', 'Legacy repository warning string; UI displays localized warning by structured status'],
  'chordPractice/historyProjection.ts': ['D', 'Legacy projection labels; structured facts and localized history presenter'],
  'chordPractice/presentation.ts': ['D', 'Legacy presenter compatibility; production uses chordPracticePresentation'],
  'chordPractice/reportDetailProjection.ts': ['D', 'Legacy report projection; structured facts preserve historical data'],
  'intervalPractice/persistence.ts': ['D', 'Legacy repository warning; normal UI renders warning from stable load status'],
  'intervalPractice/historyProjection.ts': ['D', 'Legacy timestamp/summary projection compatibility'],
  'intervalPractice/presentation.ts': ['D', 'Legacy interval presenter; localized adapter owns current UI'],
  'intervalPractice/stages.ts': ['D', 'Legacy stage captions; status ID resources own current UI'],
  'musicTheory/intervals/catalog.ts': ['D', 'Canonical Chinese snapshot names frozen; locale never changes durable V1 facts'],
  'musicTheory/chords/catalog.ts': ['D', 'Canonical catalog label compatibility; theory IDs and notation stay authoritative'],
  'musicTheory/chords/productContract.ts': ['D', 'Frozen legacy product mode names; structured localized presentation'],
  'musicTheory/chords/spelling.ts': ['D', 'Legacy theory quality description, not a locale identity'],
  'theme/themePackageRuntime.ts': ['D', 'Frozen stable-code error compatibility map; new theme UI projects those codes'],
  'theme/themeRegistry.ts': ['E', 'Legacy built-in display metadata; production projects names from stable IDs'],
  'theme/runtimeThemeAdapter.ts': ['D', 'Controlled schema diagnostics; UI uses codes. composedHome.memo separately classified B']
}
function literals(source, file) {
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const result = []
  function visit(n) {
    if (ts.isStringLiteralLike(n) || ts.isJsxText(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      const value = n.text.trim()
      if (/[\u3400-\u9fff]/.test(value)) result.push({ value, line: ast.getLineAndCharacterOfPosition(n.getStart(ast)).line + 1 })
    }
    ts.forEachChild(n, visit)
  }
  visit(ast); return result
}
function audit() {
  const evidence = []
  const files = execFileSync('rg', ['--files', prefix, '-g', '*.ts', '-g', '*.tsx'], { cwd: root, encoding: 'utf8' }).trim().split(/\r?\n/).map(f => f.replaceAll('\\', '/'))
  for (const file of files) {
    const source = read(file), entries = literals(source, file)
    if (!entries.length) continue
    if (file.startsWith(prefix + 'localization/')) {
      if (file === prefix + 'localization/LanguageSetting.tsx') {
        require('./android-language-selector-contract.cjs').assertB6PresentationOnly()
        assert.deepEqual(entries.map(entry => entry.value), ['中文'], 'exact approved language autonym, not an untranslated UI string')
        for (const entry of entries) evidence.push({ file, ...entry, category: 'C', reason: 'B6 approved fixed language autonym; never translated and exact selector source delta is verified' })
        continue
      }
      assert.ok(/Resources\.ts$|\/resources\.ts$/.test(file), 'unclassified localization literal: ' + file)
      for (const entry of entries) evidence.push({ file, ...entry, category: 'A', reason: 'Explicit Chinese locale resource; paired English resource tested without fallback' })
    } else if (file === mainPath) {
      const analysis = require('./android-sight-analysis-contract.cjs'); analysis.assertAnalysisDelta()
      const normalizedOwners = namedNodes(analysis.normalize(mainPath, source))
      const old = namedNodes(oldFile(mainPath))
      for (const [owner, { n, ast }] of namedNodes(source)) {
        const found = literals(n.getText(ast), file)
        if (!found.length) continue
        assert.ok(mainPolicy[owner], 'unclassified normal-user literal owner: ' + owner)
        const normalized = normalizedOwners.get(owner)
        assert.deepEqual(literals(normalized.n.getText(normalized.ast), file).map(e => e.value), literals(old.get(owner).n.getText(old.get(owner).ast), file).map(e => e.value), owner + ' only exact approved analysis metadata may be added')
        for (const entry of found) evidence.push({ file, owner, ...entry, line: entry.line + ast.getLineAndCharacterOfPosition(n.getStart(ast)).line, category: mainPolicy[owner][0], reason: mainPolicy[owner][1] })
      }
    } else {
      const relative = file.slice(prefix.length), rule = filePolicy[relative]
      assert.ok(rule, 'unclassified source: ' + relative)
      assert.deepEqual(entries.map(e => e.value), literals(oldFile(file), file).map(e => e.value), relative + ' allowlist must not grow silently')
      for (const entry of entries) evidence.push({ file, ...entry, category: entry.value === '一步一步，靠近喜欢的音乐。' ? 'B' : rule[0], reason: entry.value === '一步一步，靠近喜欢的音乐。' ? 'Approved composedHome.memo visual slogan deferred' : rule[1] })
    }
  }
  return evidence
}
const englishPolicy = {
  ProductHeader: { 'PIANO FUNDAMENTALS': ['C', 'Frozen product wordmark, not a translated navigation title'] },
  IntervalPracticeActiveScreen: { 'PIANO FUNDAMENTALS': ['C', 'Frozen product wordmark'] },
  ChordPracticeScreen: { 'PIANO FUNDAMENTALS': ['C', 'Frozen product wordmark'] },
  PracticeHubScreen: { PRACTICE: ['B', 'Existing fixed visual eyebrow; no change to approved visual hierarchy'] },
  ChordModeSelectScreen: { 'CHORD PRACTICE': ['B', 'Existing fixed visual eyebrow in frozen Practice presentation'] },
  ToolsHubScreen: { 'THEORY REFERENCE': ['B', 'Existing fixed visual eyebrow, including standard layout, retained for visual review'] },
  HistoryScreen: Object.fromEntries(['PRACTICE JOURNAL','RECENT PRACTICE','PRACTICE TREND'].map(value=>[value,['B','Existing fixed visual eyebrow in frozen History presentation; functional labels are localized']])),
  SettingsScreen: { 'MY FAVORITE SETUP': ['B','Approved themed hero eyebrow'], Android: ['C','Platform proper name'], GitHub: ['C','Service proper name'] },
  ThemePackageDialog: { '– &lt;': ['C','Compatibility inequality notation, not language text'] },
  ThemeInfoDialog: { '– &lt;': ['C','Compatibility inequality notation, not language text'] },
  UpdateScreen: { KiB: ['C','Standard data-size unit; numerical progress unchanged'] }
}
function auditEnglish() {
  const result=[]
  for (const [owner,{n,ast}] of namedNodes(read(mainPath))) {
    function visit(node) {
      const value = ts.isJsxText(node) ? node.text.trim() : ts.isJsxAttribute(node) && ['title','aria-label','placeholder','alt'].includes(node.name.getText(ast)) && node.initializer && ts.isStringLiteral(node.initializer) ? node.initializer.text : ''
      if (/[a-z]/i.test(value)) {
        const rule = owner==='ReviewDock' ? ['E','QA-only diagnostic UI'] : englishPolicy[owner]?.[value]
        assert.ok(rule,'unclassified hardcoded English UI: '+owner+' / '+value)
        result.push({file:mainPath,owner,value,line:ast.getLineAndCharacterOfPosition(node.getStart(ast)).line+1,category:rule[0],reason:rule[1]})
      }
      ts.forEachChild(node,visit)
    }
    visit(n)
  }
  return result
}
module.exports = { audit, auditEnglish, literals, mainPolicy, filePolicy }
if (require.main === module) console.log(JSON.stringify(audit(), null, 2))
