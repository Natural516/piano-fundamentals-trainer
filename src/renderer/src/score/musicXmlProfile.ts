import { childNumber, childText, findChild, findChildren, parseXml, type XmlElement } from './xmlMiniParser'
import { loadMusicXmlDocument } from './musicXmlParser'
import type { ScoreDocument } from './musicXmlTypes'
import { buildScoreTimeV2, mergeTiedPerformanceEventsWithDiagnostics } from './scoreTimeV2'

export const PIANO_TRAINING_MUSICXML_PROFILE_V1 = 'Piano Training MusicXML Profile v1' as const

export interface MusicXmlCapabilityIssue {
  code: string
  message: string
  measure?: string
}

export interface MusicXmlCapabilityResult {
  profileVersion: typeof PIANO_TRAINING_MUSICXML_PROFILE_V1
  trainingSafe: boolean
  supportedFeatures: string[]
  unsupportedFeatures: MusicXmlCapabilityIssue[]
  warnings: MusicXmlCapabilityIssue[]
  reasons: string[]
}

export class UnsupportedMusicXmlProfileError extends Error {
  readonly validation: MusicXmlCapabilityResult

  constructor(validation: MusicXmlCapabilityResult) {
    super(validation.reasons[0] ?? '这份曲谱不符合 Piano Training MusicXML Profile v1')
    this.name = 'UnsupportedMusicXmlProfileError'
    this.validation = validation
  }
}

function elementChildren(element: XmlElement): XmlElement[] {
  return element.children.filter((child): child is XmlElement => typeof child !== 'string')
}

function issueKey(issue: MusicXmlCapabilityIssue): string {
  return `${issue.code}\u0000${issue.measure ?? ''}`
}

export function validatePianoTrainingMusicXml(source: string): MusicXmlCapabilityResult {
  const supported = new Set<string>()
  const unsupported = new Map<string, MusicXmlCapabilityIssue>()
  const warnings = new Map<string, MusicXmlCapabilityIssue>()
  const addUnsupported = (issue: MusicXmlCapabilityIssue): void => {
    unsupported.set(issueKey(issue), issue)
  }
  const addWarning = (issue: MusicXmlCapabilityIssue): void => {
    warnings.set(issueKey(issue), issue)
  }

  let root: XmlElement
  try {
    root = parseXml(source)
  } catch (error) {
    addUnsupported({ code: 'INVALID_XML', message: error instanceof Error ? error.message : 'MusicXML 无法解析' })
    return buildResult(supported, unsupported, warnings)
  }

  if (root.tag !== 'score-partwise') {
    addUnsupported({
      code: root.tag === 'score-timewise' ? 'SCORE_TIMEWISE' : 'UNSUPPORTED_ROOT',
      message: `仅支持 score-partwise，当前根元素为 ${root.tag}`
    })
    return buildResult(supported, unsupported, warnings)
  }
  supported.add('score-partwise')

  const parts = findChildren(root, 'part')
  if (parts.length !== 1) {
    addUnsupported({ code: 'MULTI_PART', message: `严格练习只支持 exactly one Part，当前为 ${parts.length} Parts` })
  } else {
    supported.add('exactly-one-part')
  }

  for (const part of parts) {
    let effectiveStaves = 1
    let seenGrandStaffClefs = false
    const measures = findChildren(part, 'measure')
    if (measures.length === 0) {
      addUnsupported({ code: 'EMPTY_PART', message: '严格练习要求乐谱 Part 至少包含一个小节。' })
    }
    measures.forEach((measure, sequenceIndex) => {
      const displayMeasure = measure.attributes.number?.trim() || String(sequenceIndex + 1)
      if (measure.attributes.implicit === 'yes' || displayMeasure === '0') {
        supported.add('pickup-measure-stable-identity')
        addWarning({ code: 'PICKUP_MEASURE', measure: displayMeasure, message: '弱起小节使用 stableMeasureId 与 sequenceIndex 定位。' })
      }
      let timeBearingContentSeen = false
      let previousNote: XmlElement | null = null

      for (const child of elementChildren(measure)) {
        if (child.tag === 'attributes') {
          if (timeBearingContentSeen) {
            addUnsupported({
              code: 'MID_MEASURE_ATTRIBUTES',
              measure: displayMeasure,
              message: 'Profile v1 仅支持小节边界处的 divisions / key / time 属性变化。'
            })
          } else {
            supported.add('measure-boundary-attributes')
          }
          const divisions = childNumber(child, 'divisions')
          if (divisions !== null && (!Number.isFinite(divisions) || divisions <= 0)) {
            addUnsupported({ code: 'INVALID_DIVISIONS', measure: displayMeasure, message: 'divisions 必须为正数。' })
          }
          const staves = childNumber(child, 'staves')
          if (staves !== null) effectiveStaves = staves
          if (effectiveStaves < 1 || effectiveStaves > 2) {
            addUnsupported({ code: 'UNSUPPORTED_STAFF_COUNT', measure: displayMeasure, message: 'Profile v1 仅支持一行谱表或钢琴大谱表（两行）。' })
          }
          if (findChild(child, 'transpose')) {
            addUnsupported({ code: 'TRANSPOSING_SCORE', measure: displayMeasure, message: 'Profile v1 不支持移调乐器 transpose 语义。' })
          }
          const clefs = findChildren(child, 'clef')
          if (clefs.some((clef) => !['G', 'F'].includes(childText(clef, 'sign')))) {
            addUnsupported({ code: 'UNSUPPORTED_CLEF', measure: displayMeasure, message: '严格钢琴练习只支持已验证的 G/F 谱号。' })
          }
          if (effectiveStaves === 2) {
            const signatures = new Set(clefs.map((clef) => `${Number(clef.attributes.number) || 1}:${childText(clef, 'sign')}`))
            if (signatures.has('1:G') && signatures.has('2:F')) seenGrandStaffClefs = true
          }
          continue
        }

        if (child.tag === 'direction') {
          const sound = findChild(child, 'sound')
          const tempo = sound ? Number(sound.attributes.tempo) : NaN
          const directionOffset = childNumber(child, 'offset') ?? 0
          if (Number.isFinite(tempo)) {
            if (timeBearingContentSeen || directionOffset !== 0) {
              addUnsupported({ code: 'MID_MEASURE_TEMPO', measure: displayMeasure, message: 'Profile v1 仅支持小节边界 Tempo Map 变化。' })
            } else if (tempo <= 0) {
              addUnsupported({ code: 'INVALID_TEMPO', measure: displayMeasure, message: 'tempo 必须为正数。' })
            } else {
              supported.add('tempo-map-measure-boundary')
            }
          }
          const directionType = findChild(child, 'direction-type')
          if (directionType && elementChildren(directionType).some((entry) => !['metronome', 'words'].includes(entry.tag))) {
            addUnsupported({ code: 'UNSUPPORTED_DIRECTION', measure: displayMeasure, message: '包含当前未验证的演奏方向记号。' })
          }
          continue
        }

        if (child.tag === 'note') {
          timeBearingContentSeen = true
          const staff = childNumber(child, 'staff') ?? 1
          if (staff < 1 || staff > effectiveStaves) {
            addUnsupported({ code: 'INVALID_STAFF_REFERENCE', measure: displayMeasure, message: `音符引用 staff ${staff}，但当前有效谱表数为 ${effectiveStaves}。` })
          }
          if (findChild(child, 'grace')) {
            addUnsupported({ code: 'GRACE_NOTE', measure: displayMeasure, message: 'Grace Note 尚未验证，不能进入严格练习。' })
          }
          if (findChild(child, 'cue')) {
            addUnsupported({ code: 'CUE_NOTE', measure: displayMeasure, message: 'Cue Note 尚未验证。' })
          }
          const duration = childNumber(child, 'duration')
          if (!findChild(child, 'grace') && (duration === null || duration <= 0)) {
            addUnsupported({ code: 'INVALID_NOTE_DURATION', measure: displayMeasure, message: '普通音符与休止必须包含正 duration。' })
          }
          const pitch = findChild(child, 'pitch')
          if (pitch) {
            const step = childText(pitch, 'step')
            const octave = childNumber(pitch, 'octave')
            if (!/^[A-G]$/.test(step) || octave === null) {
              addUnsupported({ code: 'INVALID_PITCH', measure: displayMeasure, message: '音高必须包含有效 step 与 octave。' })
            }
          }
          if (findChild(child, 'chord')) {
            const previousIsRest = previousNote ? Boolean(findChild(previousNote, 'rest')) : false
            const previousStaff = previousNote ? childNumber(previousNote, 'staff') ?? 1 : null
            const previousVoice = previousNote ? childText(previousNote, 'voice') || '1' : null
            const currentVoice = childText(child, 'voice') || '1'
            if (!previousNote || previousIsRest || previousStaff !== staff || previousVoice !== currentVoice) {
              addUnsupported({
                code: 'UNSAFE_CHORD_TONE',
                measure: displayMeasure,
                message: 'chord 音必须紧随同 voice、同 staff 的普通音符，才能可靠共享 onset。'
              })
            }
          }
          const timeModification = findChild(child, 'time-modification')
          if (timeModification) {
            const actual = childNumber(timeModification, 'actual-notes')
            const normal = childNumber(timeModification, 'normal-notes')
            const noteType = childText(child, 'type')
            if (actual === 3 && normal === 2 && Boolean(noteType)) supported.add('verified-triplet-3-2')
            else addUnsupported({ code: 'UNSUPPORTED_TUPLET', measure: displayMeasure, message: 'Profile v1 仅验证含 note type 的 3:2 tuplet。' })
          }
          const notations = findChild(child, 'notations')
          if (notations) {
            for (const notation of elementChildren(notations)) {
              if (notation.tag === 'tied') {
                supported.add('tie')
                continue
              }
              if (notation.tag === 'tuplet' && timeModification) continue
              addUnsupported({ code: 'UNSUPPORTED_NOTATION', measure: displayMeasure, message: `未验证的 notation: ${notation.tag}` })
            }
          }
          if (findChild(child, 'beam')) supported.add('beam')
          if (findChildren(child, 'dot').length > 0) supported.add('dot')
          if (findChild(child, 'rest')) supported.add('standard-rest')
          if (findChild(child, 'chord')) supported.add('chord')
          previousNote = child
          continue
        }

        if (child.tag === 'backup' || child.tag === 'forward') {
          timeBearingContentSeen = true
          previousNote = null
          supported.add('backup-forward')
          continue
        }
        if (child.tag === 'harmony') {
          supported.add('harmony')
          continue
        }
        if (child.tag === 'barline') {
          if (findChild(child, 'repeat') || findChild(child, 'ending')) {
            addUnsupported({ code: 'REPEAT_NAVIGATION', measure: displayMeasure, message: '反复与 ending 导航尚未进入 canonical performance semantics。' })
          }
          continue
        }
        if (!['print', 'sound'].includes(child.tag)) {
          addWarning({ code: 'IGNORED_LAYOUT_ELEMENT', measure: displayMeasure, message: `已忽略不影响判题的元素 ${child.tag}。` })
        }
      }
    })

    if (effectiveStaves === 2) {
      supported.add('one-part-grand-staff')
      if (!seenGrandStaffClefs) {
        addUnsupported({ code: 'UNVERIFIED_GRAND_STAFF', message: '两行谱表缺少已验证的 staff 1 G clef / staff 2 F clef 结构。' })
      }
    } else {
      supported.add('one-part-single-staff')
    }
  }

  if (unsupported.size === 0) {
    try {
      const document = loadMusicXmlDocument(source)
      const time = buildScoreTimeV2(document)
      const tieDiagnostics = mergeTiedPerformanceEventsWithDiagnostics(time.events).warnings
      for (const warning of tieDiagnostics) {
        addUnsupported({ code: `TIE_${warning.code}`, message: warning.message })
      }
      const voices = new Set(time.events.map((event) => event.voice))
      if (voices.size > 1) supported.add('verified-multi-voice')
    } catch (error) {
      addUnsupported({ code: 'SCORE_MODEL_FAILED', message: error instanceof Error ? error.message : 'ScoreModel 构建失败' })
    }
  }

  return buildResult(supported, unsupported, warnings)
}

function buildResult(
  supported: Set<string>,
  unsupported: Map<string, MusicXmlCapabilityIssue>,
  warnings: Map<string, MusicXmlCapabilityIssue>
): MusicXmlCapabilityResult {
  const unsupportedFeatures = [...unsupported.values()]
  return {
    profileVersion: PIANO_TRAINING_MUSICXML_PROFILE_V1,
    trainingSafe: unsupportedFeatures.length === 0,
    supportedFeatures: [...supported].sort(),
    unsupportedFeatures,
    warnings: [...warnings.values()],
    reasons: unsupportedFeatures.map((issue) => issue.message)
  }
}

export function loadTrainingSafeMusicXmlDocument(source: string): {
  document: ScoreDocument
  validation: MusicXmlCapabilityResult
} {
  const validation = validatePianoTrainingMusicXml(source)
  if (!validation.trainingSafe) throw new UnsupportedMusicXmlProfileError(validation)
  const document = loadMusicXmlDocument(source)
  document.trainingProfile = validation
  return { document, validation }
}
