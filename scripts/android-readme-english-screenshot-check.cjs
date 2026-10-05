const assert = require('node:assert/strict')
const React = require('react')
const { mounted, translator, businessBytes, text } = require('./android-localization-shell-check.cjs')
const { assertReadmeEnglishDelta } = require('./android-readme-english-presentation-contract.cjs')
const { presentChordMode } = require('../prototype/android-tablet-v1/src/localization/chordPracticePresentation.ts')
const { CHORD_SEQUENTIAL_MAJOR_KEY_IDS } = require('../prototype/android-tablet-v1/src/musicTheory/chords/index.ts')
const { projectMixedPracticeHistory } = require('../prototype/android-tablet-v1/src/mixedHistoryProjection.ts')
const { presentHomeRecentPractice } = require('../prototype/android-tablet-v1/src/localization/homePresentation.ts')
const { APP_PREFERENCES_KEY } = require('../prototype/android-tablet-v1/src/localization/appPreferences.ts')
const record = {schemaVersion:1,recordId:'existing-zh-record',module:'chord',startedAtEpochMs:100,endedAtEpochMs:300,
  completionReason:'stopped',practiceMode:'sequential',sequentialKey:'C',plannedQuestionCount:20,completedQuestions:1,
  firstPassCompleteQuestions:1,arpeggioErrors:0,blockErrors:0,totalErrors:0,longestFirstPassStreak:1,practiceDurationMs:200,
  timingSummary:Object.fromEntries(['questionStartLatencyMs','arpeggioDurationMs','switchToBlockLatencyMs','blockLandingSpreadMs'].map(id=>[id,{sampleCount:1,medianMs:100}]))}
const tests = []
const test = (name, run) => tests.push({name,run})
const cjk = /[\u3400-\u9fff]/
test('Home uses existing report facts for English; locale round trip retains record/index/settings and owner', async () => mounted('home',async h=>{
  const records=JSON.stringify(h.chordHistory.records), bytes=businessBytes(h.backend), calls=[...h.plugin.calls], refresh=[...h.refreshCalls], writes=h.backend.writes.length
  assert.match(h.getText(),/循序练习 · C 大调/)
  await h.switchTo('en');assert.match(h.getText(),/Progressive practice · C Major/);assert.doesNotMatch(h.getText(),cjk)
  await h.switchTo('zh-CN');assert.match(h.getText(),/循序练习 · C 大调/)
  assert.equal(JSON.stringify(h.chordHistory.records),records);assert.deepEqual(businessBytes(h.backend),bytes)
  assert.deepEqual(h.backend.writes.slice(writes).map(w=>w.key),[APP_PREFERENCES_KEY,APP_PREFERENCES_KEY])
  assert.deepEqual(h.plugin.calls,calls);assert.deepEqual(h.refreshCalls,refresh);assert.deepEqual(h.lifecycle(),{mounts:1,unmounts:0})
},{chordRecords:[record]}))
test('all existing major keys and both stable Chord modes display English without parsing legacy text',()=>{
  for(const mode of ['sequential','comprehensive'])for(const key of CHORD_SEQUENTIAL_MAJOR_KEY_IDS){
    const report={...record,practiceMode:mode,sequentialKey:mode==='sequential'?key:null}
    const item=projectMixedPracticeHistory([],[report])[0], before=JSON.stringify(report)
    const modeDisplay=presentChordMode(report.practiceMode,report.sequentialKey,translator('en','chordPractice'))
    const display=presentHomeRecentPractice(item,translator('en','home'),modeDisplay)
    assert.doesNotMatch(display.title+display.detail,cjk);assert.equal(JSON.stringify(report),before)
  }
})
test('projection-only legacy caller remains verbatim; no translation guesses or durable rewrites',()=>{
  const item=projectMixedPracticeHistory([],[record])[0]
  const before=JSON.stringify(item), display=presentHomeRecentPractice(item,translator('en','home'))
  assert.ok(display.detail.includes(item.modeSummary));assert.equal(JSON.stringify(item),before)
})
test('actual Light History renders English hero and existing records without CJK; Chinese wording preserved',async()=>{
  const theme={id:'light',source:'builtin',capabilities:{historyVisual:{kind:'standard'}}}
  await mounted('chord-flow',async h=>{
    const before=businessBytes(h.backend), original=JSON.stringify(record), writes=h.backend.writes.length
    assert.match(h.getText(),/每一次坚持，/)
    await h.switchTo('en');assert.match(h.getText(),/Every practice session/);assert.match(h.getText(),/brings your dreams closer\./)
    assert.match(h.getText(),/Progressive practice · C Major/);assert.doesNotMatch(h.getText(),cjk)
    assert.equal(h.renderer.root.findByProps({id:'history-dashboard-title'}).findAllByType('br').length,1)
    await h.switchTo('zh-CN');assert.match(h.getText(),/每一次坚持，/);assert.match(h.getText(),/都让梦想更靠近。/)
    assert.deepEqual(businessBytes(h.backend),before);assert.equal(JSON.stringify(record),original)
    assert.deepEqual(h.backend.writes.slice(writes).map(w=>w.key),[APP_PREFERENCES_KEY,APP_PREFERENCES_KEY])
  },{theme,render:({runtime,theme,ui})=>React.createElement(ui.HistoryScreen,{
    runtime,theme,chordHistory:{status:'ready',records:[record]},chordPersistence:{refresh:async()=>{}},
    intervalHistory:{status:'ready',records:[]},intervalPersistence:{refresh:async()=>{}},filter:'all',onFilterChange:()=>{},
    onOpenChordReport:()=>{throw Error('not a locale action')},onOpenIntervalReport:()=>{throw Error('not a locale action')}
  })})
})
test('hero keys exist explicitly in both locales with fallback disabled',()=>{
  for(const locale of ['zh-CN','en'])for(const key of ['journalHeadlineFirst','journalHeadlineSecond']){
    const value=translator(locale,'intervalPractice')(key)
    assert.notEqual(value,key);assert.ok(value.trim());if(locale==='en')assert.doesNotMatch(value,cjk)
  }
})
test('exact three-file presentation delta preserves every other source byte and rejects mutations',assertReadmeEnglishDelta)
;(async()=>{
  let passed=0
  for(const {name,run} of tests){try{await run();passed++;console.log('PASS '+name)}catch(error){console.error('FAIL '+name+'\n'+error.stack)}}
  console.log(`${passed}/${tests.length} README English screenshot presentation checks PASS`)
  if(passed!==tests.length)process.exitCode=1
})()
