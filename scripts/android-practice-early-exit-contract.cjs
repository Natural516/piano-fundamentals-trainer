const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const { createHash } = require('node:crypto')
const root = path.resolve(__dirname, '..')
// Fixed reviewed B7 checkpoint. These exact, authored deltas are the ONLY new behavior allowed.
const base = '48f5168a7dbb266cf1a22c0617e3e2ea41647ac5'
const mainEdits = [
  {
    "old": "import { LanguageSetting } from './localization/LanguageSetting'",
    "value": "import { LanguageSetting } from './localization/LanguageSetting'\nimport { PracticeEarlyExitDialog, usePracticeEarlyExit } from './PracticeEarlyExitDialog'"
  },
  {
    "old": "  onRequestEnd: () => void\n  onSessionComplete:",
    "value": "  onRequestEnd: (saveReport?: boolean) => void\n  onSessionComplete:"
  },
  {
    "old": "  useEffect(() => {\n    const handleBackRequest = (): void => {\n      runtime.pause()\n      setShowEarlyEnd(true)\n    }\n    window.addEventListener('interval-request-end', handleBackRequest)\n    return () => window.removeEventListener('interval-request-end', handleBackRequest)\n  }, [runtime])\n",
    "value": "  const earlyExit = usePracticeEarlyExit({\n    open: showEarlyEnd,\n    isPaused: () => runtime.snapshot.status === 'SUSPENDED',\n    pause: () => runtime.pause(),\n    resume: () => runtime.resume(),\n    show: () => setShowEarlyEnd(true),\n    hide: () => setShowEarlyEnd(false)\n  })\n"
  },
  {
    "old": "  const requestEnd = (): void => {\n    runtime.pause()\n    setShowEarlyEnd(true)\n  }\n  const continuePractice = (): void => {\n    setShowEarlyEnd(false)\n    runtime.resume()\n  }\n",
    "value": "  const requestEnd = earlyExit.request\n"
  },
  {
    "old": "      {showEarlyEnd ? (\n        <div className=\"early-end-backdrop\">\n          <section aria-labelledby=\"interval-early-end-title\" aria-modal=\"true\" className=\"early-end-dialog\" role=\"dialog\">\n            <span className=\"early-end-dialog__icon\"><Icon name=\"stop\" /></span>\n            <div><span className=\"eyebrow\">{t('title')}</span><h1 id=\"interval-early-end-title\">{t('endTitle')}</h1><p>{snapshot.questionCount === 'endless' ? t('endEndless', { count: snapshot.completedQuestions }) : t('endFixed', { completed: snapshot.completedQuestions, total: snapshot.questionCount })}</p></div>\n            <div className=\"early-end-dialog__actions\"><button className=\"secondary-action\" type=\"button\" onClick={continuePractice}>{t('continuePractice')}</button><button className=\"primary-action\" type=\"button\" onClick={onRequestEnd}>{t('endViewResult')}</button></div>\n          </section>\n        </div>\n      ) : null}",
    "value": "      {showEarlyEnd ? (\n        <PracticeEarlyExitDialog moduleTitle={t('title')} completed={snapshot.completedQuestions} total={snapshot.questionCount ?? practiceState.settings.questionCount} icon={<Icon name=\"stop\" />} onCancel={earlyExit.cancel} onSave={() => onRequestEnd()} onDiscard={() => onRequestEnd(false)} />\n      ) : null}"
  },
  {
    "old": "  onExplicitEnd: () => void",
    "value": "  onExplicitEnd: (saveReport?: boolean) => void"
  },
  {
    "old": "  const [settingsOpen, setSettingsOpen] = useState(false)\n  const livePresentation",
    "value": "  const [settingsOpen, setSettingsOpen] = useState(false)\n  const [showEarlyEnd, setShowEarlyEnd] = useState(false)\n  const livePresentation"
  },
  {
    "old": "    : t(snapshot.counters.completedQuestions > 0 ? 'endSave' : 'end')",
    "value": "    : t('end')"
  },
  {
    "old": "  const leavePractice = (): void => {\n    onExplicitEnd()\n  }",
    "value": "  const earlyExit = usePracticeEarlyExit({\n    open: showEarlyEnd,\n    isPaused: () => runtime.snapshot.status === 'SUSPENDED',\n    pause: () => runtime.pause(),\n    resume: () => runtime.resume(),\n    show: () => setShowEarlyEnd(true),\n    hide: () => setShowEarlyEnd(false)\n  })\n  const leavePractice = (): void => {\n    if (runtime.snapshot.status === 'SESSION_COMPLETE') onExplicitEnd()\n    else earlyExit.request()\n  }"
  },
  {
    "old": "      {settingsOpen ? (\n        <ChordSettingsDrawer",
    "value": "      {showEarlyEnd ? (\n        <PracticeEarlyExitDialog moduleTitle={t(`modes.${mode}`)} completed={snapshot.counters.completedQuestions} total={snapshot.questionCount} icon={<Icon name=\"stop\" />} onCancel={earlyExit.cancel} onSave={() => onExplicitEnd()} onDiscard={() => onExplicitEnd(false)} />\n      ) : null}\n      {settingsOpen ? (\n        <ChordSettingsDrawer"
  },
  {
    "old": "  onStopAndSave: () => void",
    "value": "  onStopAndSave: (saveReport?: boolean) => void"
  },
  {
    "old": "  const requestEnd = (): void => {\n    runtime.pause()\n    navigate('sight-early-end')\n  }\n  const continuePractice = (): void => {\n    runtime.resume()\n    navigate(getPracticeScreen(runtime))\n  }\n  const stopAndSave = (): void => {\n    onStopAndSave()\n  }\n",
    "value": "  const earlyExit = usePracticeEarlyExit({\n    open: showEarlyEndConfirm,\n    isPaused: () => runtime.snapshot.isPaused,\n    pause: () => runtime.pause(),\n    resume: () => runtime.resume(),\n    show: () => navigate('sight-early-end'),\n    hide: () => navigate(getPracticeScreen(runtime))\n  })\n  const requestEnd = earlyExit.request\n"
  },
  {
    "old": "      {showEarlyEndConfirm ? (\n        <div className=\"early-end-backdrop\">\n          <section aria-labelledby=\"early-end-title\" aria-modal=\"true\" className=\"early-end-dialog\" role=\"dialog\">\n            <span className=\"early-end-dialog__icon\"><Icon name=\"stop\" /></span>\n            <div>\n              <span className=\"eyebrow\">{t('title')}</span>\n              <h1 id=\"early-end-title\">{t('endTitle')}</h1>\n              <p>{t('endProgress', { completed: snapshot.completedQuestions, total: settings.questionCount })}<br />{t('endHelp')}</p>\n            </div>\n            <div className=\"early-end-dialog__actions\">\n              <button className=\"secondary-action\" type=\"button\" onClick={continuePractice}>{t('continuePractice')}</button>\n              <button className=\"primary-action\" type=\"button\" onClick={stopAndSave}>{t('endSave')}</button>\n            </div>\n          </section>\n        </div>\n      ) : null}",
    "value": "      {showEarlyEndConfirm ? (\n        <PracticeEarlyExitDialog moduleTitle={t('title')} completed={snapshot.completedQuestions} total={settings.questionCount} icon={<Icon name=\"stop\" />} onCancel={earlyExit.cancel} onSave={() => onStopAndSave()} onDiscard={() => onStopAndSave(false)} />\n      ) : null}"
  },
  {
    "old": "  const endSightPractice = useCallback((): void => {\n    const active = activeSessionHost.current\n    runtime.stop()",
    "value": "  const endSightPractice = useCallback((saveReport = true): void => {\n    const active = activeSessionHost.current\n    runtime.stop(saveReport)"
  },
  {
    "old": "  const endChordPractice = useCallback((): void => {",
    "value": "  const endChordPractice = useCallback((saveReport = true): void => {"
  },
  {
    "old": "      if (finalizedNow) void chordPersistence.finalize(active.id, chordRuntime.snapshot, 'stopped')",
    "value": "      if (finalizedNow && saveReport) void chordPersistence.finalize(active.id, chordRuntime.snapshot, 'stopped')"
  },
  {
    "old": "  const endIntervalPractice = useCallback((): void => finalizeIntervalPractice('STOPPED'), [finalizeIntervalPractice])",
    "value": "  const endIntervalPractice = useCallback((saveReport = true): void => {\n    if (saveReport) { finalizeIntervalPractice('STOPPED'); return }\n    const active = activeSessionHost.current\n    intervalRuntime.stop()\n    if (active?.module === 'interval') activeSessionHost.end(active.id)\n    navigate('interval-practice')\n  }, [activeSessionHost, finalizeIntervalPractice, intervalRuntime])"
  },
  {
    "old": "      if (currentScreen === 'sight-early-end' && currentSnapshot.status === 'running') {\n        runtime.resume()\n        navigate(getPracticeScreen(runtime))\n        return\n      }\n\n      if (practiceScreens.includes(currentScreen) && currentSnapshot.status === 'running') {\n        runtime.pause()\n        navigate('sight-early-end')\n        return\n      }\n",
    "value": "      if ((currentScreen === 'sight-early-end' || practiceScreens.includes(currentScreen)) && currentSnapshot.status === 'running') {\n        window.dispatchEvent(new CustomEvent('practice-request-end'))\n        return\n      }\n"
  },
  {
    "old": "      if (currentScreen === 'chord-practice') {\n        endChordPractice()",
    "value": "      if (currentScreen === 'chord-practice') {\n        window.dispatchEvent(new CustomEvent('practice-request-end'))"
  },
  {
    "old": "      if (currentScreen === 'interval-active') {\n        window.dispatchEvent(new CustomEvent('interval-request-end'))",
    "value": "      if (currentScreen === 'interval-active') {\n        window.dispatchEvent(new CustomEvent('practice-request-end'))"
  }
]
const runtimeEdits = [
  {
    "old": "  private observedReport: SightReadingSessionReport | null = null",
    "value": "  private observedReport: SightReadingSessionReport | null = null\n  private discardingReport = false"
  },
  {
    "old": "      if (report && report !== this.observedReport) {",
    "value": "      if (report && report !== this.observedReport) {\n        if (this.discardingReport) {\n          // Mark only this discarded report observed, so later notifications cannot save it.\n          this.observedReport = report\n          this.notify()\n          return\n        }"
  },
  {
    "old": "  stop(): SightReadingSessionReport | null {\n    return this.controller.stop()\n  }",
    "value": "  stop(saveReport = true): SightReadingSessionReport | null {\n    this.discardingReport = !saveReport\n    try {\n      return this.controller.stop()\n    } finally {\n      this.discardingReport = false\n    }\n  }"
  }
]
const clean = text => text.replaceAll('\r\n','\n')
// Pin the reviewed additions independently of Git tracking state, never to current HEAD.
const reviewedAdditionDigests = {
  'prototype/android-tablet-v1/src/PracticeEarlyExitDialog.tsx': '8b769cb3f74ab4ceb6aa40cc0a6df5dc3bf7851c539b6ebb5b499520615409dc',
  'prototype/android-tablet-v1/src/localization/practiceExitResources.ts': '1c5146f9586537444690568aae67c8650eee353164c34dc6b761781bf7a3d10d'
}
const reviewedAdditionPaths = Object.keys(reviewedAdditionDigests)
function assertReviewedAdditions() {
  const digest = source => createHash('sha256').update(clean(source)).digest('hex')
  for (const [file, expected] of Object.entries(reviewedAdditionDigests)) {
    const actual = fs.readFileSync(path.join(root, file), 'utf8')
    assert.equal(digest(actual), expected, file + ': exact reviewed addition, tracked or untracked')
    assert.notEqual(digest(actual + '\n// unauthorized mutation\n'), expected)
  }
}
function reverse(source, edits) {
  source = clean(source)
  for (const edit of [...edits].reverse()) {
    if (source.includes(edit.value)) source = source.replace(edit.value, edit.old)
  }
  return source
}
const normalizeEarlyExitMain = source => reverse(require('./android-readme-english-presentation-contract.cjs').normalize('prototype/android-tablet-v1/src/main.tsx', source), mainEdits)
const normalizeEarlyExitRuntime = source => reverse(source, runtimeEdits)
const resourceEdits = [
  { old: "import { updaterResources } from './updaterResources'", value: "import { updaterResources } from './updaterResources'\nimport { practiceExitResources } from './practiceExitResources'" },
  { old: "  'zh-CN': {", value: "  'zh-CN': {\n    practiceExit: practiceExitResources['zh-CN']," },
  { old: "  en: {", value: "  en: {\n    practiceExit: practiceExitResources.en," }
]
const serviceEdits = [{ old: "'updater'], defaultNS", value: "'updater', 'practiceExit'], defaultNS" }]
const normalizeEarlyExitResources = source => reverse(require('./android-sight-analysis-contract.cjs').normalize('prototype/android-tablet-v1/src/localization/resources.ts', source), resourceEdits)
const normalizeEarlyExitService = source => reverse(require('./android-sight-analysis-contract.cjs').normalize('prototype/android-tablet-v1/src/localization/localizationService.ts', source), serviceEdits)
function assertEarlyExitDelta() {
  const screenshot = require('./android-readme-english-presentation-contract.cjs')
  screenshot.assertReadmeEnglishDelta()
  assertReviewedAdditions()
  for (const [file, edits] of [
    ['prototype/android-tablet-v1/src/main.tsx', mainEdits],
    ['prototype/android-tablet-v1/src/sightReadingIntegration.ts', runtimeEdits],
    ['prototype/android-tablet-v1/src/localization/resources.ts', resourceEdits],
    ['prototype/android-tablet-v1/src/localization/localizationService.ts', serviceEdits]
  ]) {
    const actual = screenshot.normalize(file, clean(fs.readFileSync(path.join(root,file),'utf8')))
    const previous = clean(execFileSync('git',['show',base+':'+file],{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}))
    let expected = previous
    for (const edit of edits) { assert.ok(expected.includes(edit.old),file+' exact baseline delta'); expected=expected.replace(edit.old,edit.value) }
    assert.equal(actual,expected,file+' permits only explicit early-exit changes')
    assert.equal(reverse(actual,edits),previous)
    assert.throws(()=>assert.equal(reverse(actual+'\n// unauthorized mutation\n',edits),previous))
  }
}
module.exports={base,normalizeEarlyExitMain,normalizeEarlyExitRuntime,normalizeEarlyExitResources,normalizeEarlyExitService,assertEarlyExitDelta,reviewedAdditionPaths}
