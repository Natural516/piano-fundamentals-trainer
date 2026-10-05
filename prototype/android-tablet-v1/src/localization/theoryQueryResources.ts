import type { ChordQueryGroupId, ChordQueryTypeId } from '../chordQueryTool'

const zhChordTypes: Record<ChordQueryTypeId, string> = {
  major: '大三和弦', minor: '小三和弦', diminished: '减三和弦', augmented: '增三和弦',
  dominant7: '属七和弦', minor7: '小七和弦', major7: '大七和弦', diminished7: '减七和弦', halfDiminished7: '半减七和弦',
  sus4: '挂四和弦', sus2: '挂二和弦', dominant7Sus4: '属七挂四和弦',
  six: '六和弦', minorSix: '小六和弦', add9: '加九和弦', sixNine: '六九和弦',
  dominant9: '属九和弦', minor9: '小九和弦', major9: '大九和弦',
  dominant11: '属十一和弦', minor11: '小十一和弦', major11: '大十一和弦',
  dominant13: '属十三和弦', minor13: '小十三和弦', major13: '大十三和弦',
  dominantFlat5: '属七降五和弦', dominantFlat9: '属七降九和弦', dominantSharp9: '属七升九和弦', power5: '五度和弦'
}
const enChordTypes: Record<ChordQueryTypeId, string> = {
  major: 'Major triad', minor: 'Minor triad', diminished: 'Diminished triad', augmented: 'Augmented triad',
  dominant7: 'Dominant seventh chord', minor7: 'Minor seventh chord', major7: 'Major seventh chord',
  diminished7: 'Diminished seventh chord', halfDiminished7: 'Half-diminished seventh chord',
  sus4: 'Suspended fourth', sus2: 'Suspended second', dominant7Sus4: 'Dominant seventh suspended fourth',
  six: 'Sixth chord', minorSix: 'Minor sixth chord', add9: 'Add ninth', sixNine: 'Six-nine chord',
  dominant9: 'Dominant ninth', minor9: 'Minor ninth', major9: 'Major ninth',
  dominant11: 'Dominant eleventh', minor11: 'Minor eleventh', major11: 'Major eleventh',
  dominant13: 'Dominant thirteenth', minor13: 'Minor thirteenth', major13: 'Major thirteenth',
  dominantFlat5: 'Dominant seventh flat fifth', dominantFlat9: 'Dominant seventh flat ninth',
  dominantSharp9: 'Dominant seventh sharp ninth', power5: 'Power chord'
}
const zhGroups: Record<ChordQueryGroupId, string> = {
  'basic-triads': '基础三和弦', sevenths: '七和弦', suspended: '挂留和弦', 'sixths-added': '六和弦 / 加音',
  ninths: '九和弦', elevenths: '十一和弦', thirteenths: '十三和弦', 'altered-dominants': '变化属和弦', other: '其他'
}
const enGroups: Record<ChordQueryGroupId, string> = {
  'basic-triads': 'Basic triads', sevenths: 'Seventh chords', suspended: 'Suspended chords', 'sixths-added': 'Sixths / added tones',
  ninths: 'Ninth chords', elevenths: 'Eleventh chords', thirteenths: 'Thirteenth chords', 'altered-dominants': 'Altered dominant chords', other: 'Other'
}

export const theoryQueryResources = {
  'zh-CN': {
    noteName: '音名', accidental: '变音记号', octave: '八度',
    accidentals: { flat: '降号', natural: '还原号', sharp: '升号' },
    chord: {
      title: '和弦查询', reference: 'CHORD REFERENCE', description: '选择根音和和弦类型，查看规范名称与完整理论构成音。',
      conditions: '和弦查询条件', type: '和弦类型', symbol: 'CHORD SYMBOL', tones: '理论构成音',
      result: '{{chordName}} 查询结果', composition: '{{root}} {{chordName}}理论构成音',
      selector: '{{suffix}} · {{chordName}}', types: zhChordTypes, groups: zhGroups
    },
    interval: {
      title: '音程查询', reference: 'INTERVAL REFERENCE', description: '选择起始音与目标音，查看音程名称、方向与等音程参考。',
      conditions: '音程查询条件', start: '起始音', target: '目标音', pitchAccidental: '{{pitch}} 变音记号',
      resultEyebrow: 'INTERVAL RESULT', result: '{{intervalName}}查询结果', facts: '结果信息',
      direction: '方向', degree: '度数', quality: '性质', semitones: '半音数',
      directions: { ascending: '上行', descending: '下行', same: '同高' },
      relationships: { 'same-written': '同音', enharmonic: '等音同高' },
      qualities: { perfect: '纯', major: '大', minor: '小', augmented: '增', diminished: '减',
        doublyAugmented: '倍增', doublyDiminished: '倍减', triplyAugmented: '三倍增', triplyDiminished: '三倍减',
        multipleAugmented: '{{count}}倍增', multipleDiminished: '{{count}}倍减' },
      degrees: { 1: '一度', 2: '二度', 3: '三度', 4: '四度', 5: '五度', 6: '六度', 7: '七度', 8: '八度',
        9: '九度', 10: '十度', 11: '十一度', 12: '十二度', 13: '十三度' },
      degreeName: '{{number}}度', name: '{{quality}}{{degree}}', descendingName: '下行{{intervalName}}',
      referenceEyebrow: 'ENHARMONIC INTERVALS', references: '等音程参考',
      referenceHelp: '保持 {{count}} 个半音不变，比较相邻级数的理论命名。',
      semitoneCount: '{{count}} 个半音', current: '当前'
    },
    scale: {
      title: '音阶与调号', reference: 'SCALE / KEY SIGNATURE REFERENCE', description: '选择主音，查看自然大调的规范音名与五线谱调号。',
      conditions: '音阶查询条件', tonic: '主音', type: '音阶类型', major: '自然大调', minor: '小调',
      composition: '音阶构成', relatedKeys: '关系调', relativeMinor: '相对小调', signature: '调号', signatureEyebrow: 'KEY SIGNATURE',
      scaleTitle: '{{tonic}} 自然大调', compositionLabel: '{{keyName}}音阶构成', signatureLabel: '{{keyName}}调号大谱表'
    }
  },
  en: {
    noteName: 'Note name', accidental: 'Accidental', octave: 'Octave',
    accidentals: { flat: 'Flat', natural: 'Natural', sharp: 'Sharp' },
    chord: {
      title: 'Chord Query', reference: 'CHORD REFERENCE', description: 'Choose a root and chord type to see its name and complete theoretical spelling.',
      conditions: 'Chord query conditions', type: 'Chord type', symbol: 'CHORD SYMBOL', tones: 'Chord tones',
      result: '{{chordName}} query result', composition: 'Chord tones for {{root}} {{chordName}}',
      selector: '{{suffix}} · {{chordName}}', types: enChordTypes, groups: enGroups
    },
    interval: {
      title: 'Interval Query', reference: 'INTERVAL REFERENCE', description: 'Choose a starting and target note to see the interval, direction and enharmonic references.',
      conditions: 'Interval query conditions', start: 'Starting note', target: 'Target note', pitchAccidental: '{{pitch}} accidental',
      resultEyebrow: 'INTERVAL RESULT', result: '{{intervalName}} query result', facts: 'Interval facts',
      direction: 'Direction', degree: 'Degree', quality: 'Quality', semitones: 'Semitones',
      directions: { ascending: 'Ascending', descending: 'Descending', same: 'Same pitch' },
      relationships: { 'same-written': 'Same written pitch', enharmonic: 'Enharmonic pitches' },
      qualities: { perfect: 'Perfect', major: 'Major', minor: 'Minor', augmented: 'Augmented', diminished: 'Diminished',
        doublyAugmented: 'Doubly augmented', doublyDiminished: 'Doubly diminished', triplyAugmented: 'Triply augmented', triplyDiminished: 'Triply diminished',
        multipleAugmented: '{{count}}-times augmented', multipleDiminished: '{{count}}-times diminished' },
      degrees: { 1: 'unison', 2: 'second', 3: 'third', 4: 'fourth', 5: 'fifth', 6: 'sixth', 7: 'seventh', 8: 'octave',
        9: 'ninth', 10: 'tenth', 11: 'eleventh', 12: 'twelfth', 13: 'thirteenth' },
      degreeName: '{{number}}', name: '{{quality}} {{degree}}', descendingName: 'Descending {{intervalName}}',
      referenceEyebrow: 'ENHARMONIC INTERVALS', references: 'Enharmonic interval references',
      referenceHelp_one: 'Compare neighboring interval degrees at the same distance of {{count}} semitone.',
      referenceHelp_other: 'Compare neighboring interval degrees at the same distance of {{count}} semitones.',
      semitoneCount_one: '{{count}} semitone', semitoneCount_other: '{{count}} semitones', current: 'Current'
    },
    scale: {
      title: 'Scale & Key Signature', reference: 'SCALE / KEY SIGNATURE REFERENCE', description: 'Choose a tonic to see the major scale spelling and staff key signature.',
      conditions: 'Scale query conditions', tonic: 'Tonic', type: 'Scale type', major: 'Major scale', minor: 'Minor',
      composition: 'Scale notes', relatedKeys: 'Related key', relativeMinor: 'Relative minor', signature: 'Key signature', signatureEyebrow: 'KEY SIGNATURE',
      scaleTitle: '{{tonic}} Major scale', compositionLabel: 'Scale notes for {{keyName}}', signatureLabel: '{{keyName}} key signature on the grand staff'
    }
  }
} as const
