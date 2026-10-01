import type { MusicAccidental } from '../../../../src/sightReading/musicKeySignatures'
import type { MusicNotationPitch } from '../../../../src/sightReading/musicNotationTypes'
import { formatWrittenPitch } from '../musicTheory/chords'
import type { IntervalSpelledNote } from '../musicTheory/intervals'
import type {
  IntervalNotationModel,
  IntervalPracticePageModel,
  IntervalPracticeState
} from './types'

const ZONE_LABELS = Object.freeze({
  LOW_EXTENSION: '低音扩展区',
  CORE: '核心读谱区',
  HIGH_EXTENSION: '高音扩展区'
})

export function toIntervalNotationPitch(note: IntervalSpelledNote): MusicNotationPitch {
  const accidental: MusicAccidental = note.accidental === 1 ? '#' : note.accidental === -1 ? 'b' : null
  return Object.freeze({
    midiNumber: note.soundingMidi,
    letter: note.letter,
    accidental,
    octave: note.octave,
    spelling: formatWrittenPitch(note),
    vexFlowKey: `${note.letter.toLowerCase()}${accidental ?? ''}/${note.octave}`,
    displayAccidental: accidental,
    clef: note.soundingMidi >= 60 ? 'treble' : 'bass'
  })
}

function createNotationModel(state: IntervalPracticeState): IntervalNotationModel {
  const { root, target, intervalType } = state.currentQuestion
  const targetVisible = state.settings.answerHint
  const unisonUsesSingleNotehead = root.soundingMidi === target.soundingMidi
    && root.letter === target.letter
    && root.accidental === target.accidental
    && root.octave === target.octave
  const notes = !targetVisible || unisonUsesSingleNotehead
    ? [toIntervalNotationPitch(root)]
    : [toIntervalNotationPitch(root), toIntervalNotationPitch(target)]
  return Object.freeze({
    ariaLabel: targetVisible
      ? `${intervalType.chineseName}：${formatWrittenPitch(root)} 与 ${formatWrittenPitch(target)}`
      : `${intervalType.chineseName}：低音 ${formatWrittenPitch(root)}`,
    notes: Object.freeze(notes),
    answerLabel: targetVisible ? `${formatWrittenPitch(root)} + ${formatWrittenPitch(target)}` : null,
    targetVisible,
    unisonUsesSingleNotehead
  })
}

export function presentIntervalPractice(state: IntervalPracticeState): IntervalPracticePageModel {
  const { currentQuestion } = state
  const { intervalType, root } = currentQuestion
  const rootLabel = formatWrittenPitch(root)
  const prompt = `请按出以 ${rootLabel} 为低音的${intervalType.chineseName}音程`
  return Object.freeze({
    questionId: currentQuestion.questionId,
    intervalName: intervalType.chineseName,
    prompt,
    rootLabel,
    zone: currentQuestion.zone,
    zoneLabel: ZONE_LABELS[currentQuestion.zone],
    notation: createNotationModel(state)
  })
}
