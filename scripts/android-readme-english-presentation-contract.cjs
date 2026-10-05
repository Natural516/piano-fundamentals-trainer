const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { execFileSync } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const base = 'ef49c4802ec30c6d908bfcdb932816b6bc359c51'
const edits = {
  'prototype/android-tablet-v1/src/main.tsx': [
    ["  const { t } = useTranslation('home')", "  const { t } = useTranslation('home')\n  const { t: chordT } = useTranslation('chordPractice')"],
    ['  const recentDisplay = presentHomeRecentPractice(recentPractice, t)', "  const recentChordDisplay = recentPractice?.module === 'chord'\n    ? presentChordHistorySummary(chordHistory.records.find(record => record.recordId === recentPractice.recordId), recentPractice.modeSummary, chordT)\n    : undefined\n  const recentDisplay = presentHomeRecentPractice(recentPractice, t, recentChordDisplay)"],
    ['<h1 id="history-dashboard-title">每一次坚持，<br />都让梦想更靠近。</h1>', '<h1 id="history-dashboard-title">{t(\'journalHeadlineFirst\')}<br />{t(\'journalHeadlineSecond\')}</h1>']
  ],
  'prototype/android-tablet-v1/src/localization/homePresentation.ts': [
    ['item: MixedPracticeHistoryItem | null, t: MidiTranslator)', 'item: MixedPracticeHistoryItem | null, t: MidiTranslator, chordModeDisplay?: string)'],
    ['  // Chord modeSummary has no stable mode identity in this projection. Keep its original text,\n  // rather than parse Chinese display text or expand this batch into Chord/History localization.', '  // Use display derived from the matching report\'s stable facts when available.\n  // A caller with only a legacy projection retains its text; never parse or rewrite it.'],
    ['mode: item.modeSummary, progress', 'mode: chordModeDisplay ?? item.modeSummary, progress']
  ],
  'prototype/android-tablet-v1/src/localization/intervalFlowResources.ts': [
    ['', "    journalHeadlineFirst: '每一次坚持，', journalHeadlineSecond: '都让梦想更靠近。',\n"],
    ['', "    journalHeadlineFirst: 'Every practice session', journalHeadlineSecond: 'brings your dreams closer.',\n"]
  ]
}
function normalize(file, source) {
  source = source.replaceAll('\r\n', '\n')
  for (const [old, value] of edits[file] ?? []) source = source.replace(value, old)
  return source
}
function assertReadmeEnglishDelta() {
  for (const file of Object.keys(edits)) {
    const previous = execFileSync('git', ['show', base + ':' + file], {cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).replaceAll('\r\n','\n')
    const actual = fs.readFileSync(path.join(root,file),'utf8').replaceAll('\r\n','\n')
    for (const [, value] of edits[file]) assert.equal(actual.split(value).length - 1, 1, 'exact authorized presentation delta: ' + file)
    assert.equal(normalize(file,actual),previous, 'no changes beyond the explicit English screenshot presentation delta: ' + file)
    assert.throws(() => assert.equal(normalize(file,actual+'\n// unauthorized mutation\n'),previous))
  }
}
module.exports = {normalize,assertReadmeEnglishDelta}
