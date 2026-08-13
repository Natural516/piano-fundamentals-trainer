import type { ChordContentCategory, ChordTrainingContent } from './chordTypes'

export const CHORD_CONTENT_CATEGORY_LABELS: Record<ChordContentCategory, string> = {
  triad: '三和弦识别',
  seventh: '七和弦识别',
  progression: '和弦连接',
  arpeggio: '分解和弦',
  '4536251': '4536251进行'
}

export const CHORD_TRAINING_CONTENTS: ChordTrainingContent[] = [
  { id: 'triad-identification', name: '调内自然三和弦', description: '当前大调内的七个自然三和弦与转位随机练习。', difficulty: 'basic', category: 'triad', inputStyle: 'block' },
  { id: 'seventh-identification', name: '调内七和弦识别', description: '当前大调内的大七、属七、小七与半减七和弦。', difficulty: 'intermediate', category: 'seventh', inputStyle: 'block' },
  { id: 'progression-1451', name: 'I–IV–V–I', description: '基础主功能和弦连接。', difficulty: 'intermediate', category: 'progression', inputStyle: 'block', progressionId: 'I-IV-V-I' },
  { id: 'progression-1564', name: 'I–V–vi–IV', description: '常见流行和声进行。', difficulty: 'intermediate', category: 'progression', inputStyle: 'block', progressionId: 'I-V-vi-IV' },
  { id: 'progression-251', name: 'ii–V–I', description: '属功能解决连接。', difficulty: 'intermediate', category: 'progression', inputStyle: 'block', progressionId: 'ii-V-I' },
  { id: 'progression-1645', name: 'I–vi–IV–V', description: '循环式基础和弦连接。', difficulty: 'intermediate', category: 'progression', inputStyle: 'block', progressionId: 'I-vi-IV-V' },
  { id: 'broken-1451', name: 'I–IV–V–I 分解和弦', description: '按顺序逐音完成每个和弦。', difficulty: 'intermediate', category: 'arpeggio', inputStyle: 'arpeggio', progressionId: 'I-IV-V-I' },
  { id: '4536251-block', name: '4536251 柱式', description: 'IV–V–iii–vi–ii–V–I 柱式和弦进行。', difficulty: 'challenge', category: '4536251', inputStyle: 'block', progressionId: '4536251' },
  { id: '4536251-arpeggio', name: '4536251 分解', description: 'IV–V–iii–vi–ii–V–I 逐音分解练习。', difficulty: 'challenge', category: '4536251', inputStyle: 'arpeggio', progressionId: '4536251' }
]

export function getChordTrainingContent(id: string): ChordTrainingContent {
  return CHORD_TRAINING_CONTENTS.find((content) => content.id === id) ?? CHORD_TRAINING_CONTENTS[0]
}
