import { useMemo, useState } from 'react'
import { usePracticeHistory } from '../hooks/usePracticeHistory'
import {
  formatPracticeDateTime,
  formatPracticeDuration
} from '../utils/practiceRecordStorage'
import {
  type PracticeModule,
  type PracticeSessionRecord
} from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { PracticeReportPanel } from './PracticeReportPanel'
import { getMajorKeySignature } from '../utils/musicKeySignatures'
import { SIGHT_READING_NOTE_POOL_MODE_LABELS } from '../utils/sightReadingSettings'

type HistoryFilter = 'all' | PracticeModule

const filterOptions: Array<{ id: HistoryFilter; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'sight-reading', label: '识谱' },
  { id: 'rhythm', label: '节奏' },
  { id: 'scale', label: '音阶' },
  { id: 'chord', label: '和弦' },
  { id: 'coordination', label: '左右手协调' }
]

const settingLabels: Record<string, string> = {
  clef: '谱号',
  range: '音域',
  staffMode: '谱表模式',
  rangeMode: '音域',
  questionCount: '题数',
  answerTimeLimitSeconds: '每题时限',
  noteNameVisible: '音名提示',
  noteCount: '题型',
  notePoolMode: '音符内容',
  keySignature: '调性',
  keyName: '调性名称',
  pattern: '模板',
  bpm: 'BPM',
  tolerance: '宽容度',
  key: '调性',
  mode: '模式',
  chordType: '和弦类型',
  inversionMode: '转位',
  measureCount: '小节数'
}

const detailLabels: Record<string, string> = {
  correctCount: '正确数',
  wrongCount: '错误数',
  timeoutCount: '超时数',
  averageReactionMs: '平均反应时间',
  highestStreak: '最高连对',
  hardestNote: '最容易错的音',
  mostWrongNote: '最容易错的音',
  mostTimedOutNote: '最容易超时的音',
  weakestNote: '综合薄弱音',
  fastestReactionMs: '最快反应时间',
  slowestReactionMs: '最慢反应时间',
  fixedRange: '固定音域'
}

type HistoryValue = string | number | boolean | null

function formatSettingValue(value: HistoryValue, key = ''): string {
  if (value === null) return '暂无'
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  if (key === 'staffMode' || key === 'clef') {
    if (value === 'treble') return '高音谱表'
    if (value === 'bass') return '低音谱表'
    if (value === 'grand' || value === 'mixed') return '大谱表'
  }
  if (key === 'rangeMode' || key === 'range') {
    if (value === 'common' || value === 'basic') return '常用'
    if (value === 'extended') return '扩展'
    if (value === 'fixed') return '固定音域'
  }
  if (key === 'noteCount') return value === 1 ? '单音' : value === 2 ? '双音' : value === 3 ? '三音' : String(value)
  if (key === 'notePoolMode' && (value === 'diatonic' || value === 'chromatic')) {
    return SIGHT_READING_NOTE_POOL_MODE_LABELS[value]
  }
  if ((key === 'keySignature' || key === 'key') && typeof value === 'string') {
    return getMajorKeySignature(value).displayName
  }
  if (key === 'answerTimeLimitSeconds') return `${value} 秒`
  if (key.endsWith('ReactionMs') && typeof value === 'number') return `${value} ms`
  return String(value)
}

function getSettingsEntries(record: PracticeSessionRecord): Array<[string, HistoryValue]> {
  if (record.module !== 'sight-reading') return Object.entries(record.settings)

  const notePoolMode = record.settings.notePoolMode
  const notePoolEntries: Array<[string, HistoryValue]> =
    notePoolMode === 'diatonic' || notePoolMode === 'chromatic'
      ? [['notePoolMode', notePoolMode]]
      : []

  return [
    ['staffMode', record.settings.staffMode ?? record.settings.clef ?? null],
    ['keySignature', record.settings.keySignature ?? record.keySignature ?? 'C'],
    ...notePoolEntries,
    ['noteCount', record.settings.noteCount ?? 1],
    ['rangeMode', record.settings.rangeMode ?? record.settings.range ?? null],
    ['questionCount', record.settings.questionCount ?? null],
    ['answerTimeLimitSeconds', record.settings.answerTimeLimitSeconds ?? null],
    ['noteNameVisible', record.settings.noteNameVisible ?? null]
  ]
}

function getDetailEntries(record: PracticeSessionRecord): Array<[string, HistoryValue]> {
  if (record.module !== 'sight-reading') return Object.entries(record.details)

  return [
    ['correctCount', record.details.correctCount ?? null],
    ['wrongCount', record.details.wrongCount ?? null],
    ['timeoutCount', record.details.timeoutCount ?? null],
    ['averageReactionMs', record.details.averageReactionMs ?? null],
    ['highestStreak', record.details.highestStreak ?? null],
    ['mostWrongNote', record.details.mostWrongNote ?? record.details.hardestNote ?? null],
    ['mostTimedOutNote', record.details.mostTimedOutNote ?? null],
    ['fastestReactionMs', record.details.fastestReactionMs ?? null],
    ['slowestReactionMs', record.details.slowestReactionMs ?? null]
  ]
}

function getPrimarySettings(record: PracticeSessionRecord): string {
  const entries = getSettingsEntries(record).slice(0, 3)
  return entries.length > 0
    ? entries.map(([key, value]) => `${settingLabels[key] ?? key}: ${formatSettingValue(value, key)}`).join(' · ')
    : '无额外设置'
}

export function PracticeHistoryPage(): JSX.Element {
  const history = usePracticeHistory()
  const [filter, setFilter] = useState<HistoryFilter>('all')
  const [expandedId, setExpandedId] = useState('')
  const [confirmClear, setConfirmClear] = useState(false)
  const filteredRecords = useMemo(
    () => history.records.filter((record) => filter === 'all' || record.module === filter),
    [filter, history.records]
  )

  const handleClear = (): void => {
    if (!confirmClear) {
      setConfirmClear(true)
      return
    }

    if (history.clearAll()) {
      setConfirmClear(false)
      setExpandedId('')
    }
  }

  return (
    <section className="practice-history-page">
      <header className="midi-page-header history-page-header">
        <div>
          <span className="eyebrow">每一轮都有迹可循</span>
          <h2>练习记录</h2>
          <p>本地保存最近 200 次已完成练习。</p>
        </div>
      </header>

      <section className="midi-panel history-toolbar">
        <div className="history-filter-group" aria-label="按练习模块筛选">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              className={filter === option.id ? 'is-active' : ''}
              type="button"
              onClick={() => setFilter(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <AppButton
          className={confirmClear ? 'history-clear-confirm' : ''}
          disabled={history.records.length === 0}
          variant="ghost"
          onClick={handleClear}
        >
          {confirmClear ? '再次点击确认清空' : '清空全部记录'}
        </AppButton>
      </section>

      {history.errorMessage ? <p className="practice-save-error">{history.errorMessage}</p> : null}

      <section className="history-records" aria-live="polite">
        {filteredRecords.length === 0 ? (
          <div className="midi-panel history-empty-state">
            <strong>{history.records.length === 0 ? '暂无练习记录' : '当前筛选下暂无记录'}</strong>
            <p>完成识谱、节奏、音阶、和弦或左右手协调练习后，记录会自动出现在这里。</p>
          </div>
        ) : filteredRecords.map((record) => {
          const expanded = expandedId === record.id
          return (
            <article key={record.id} className={`midi-panel history-record ${expanded ? 'is-expanded' : ''}`}>
              <button
                className="history-record-summary"
                type="button"
                onClick={() => setExpandedId(expanded ? '' : record.id)}
              >
                <span className={`history-module-icon module-${record.module}`} aria-hidden="true">♪</span>
                <div>
                  <small>{record.moduleName}</small>
                  <strong>{record.title}</strong>
                  <p>{getPrimarySettings(record)}</p>
                </div>
                <time>{formatPracticeDateTime(record.endedAt)}</time>
                <span><small>时长</small><strong>{formatPracticeDuration(record.durationMs)}</strong></span>
                <span><small>正确率</small><strong>{record.accuracy}%</strong></span>
                <b aria-hidden="true">{expanded ? '−' : '+'}</b>
              </button>

              {expanded ? (
                <PracticeReportPanel record={record}>
                  <div className="history-detail-grid">
                    <div>
                      <h5>主要设置</h5>
                      {getSettingsEntries(record).map(([key, value]) => (
                        <p key={key}><span>{settingLabels[key] ?? key}</span><strong>{formatSettingValue(value, key)}</strong></p>
                      ))}
                    </div>
                    <div>
                      <h5>模块详情</h5>
                      {getDetailEntries(record).map(([key, value]) => (
                        <p key={key}><span>{detailLabels[key] ?? key}</span><strong>{formatSettingValue(value, key)}</strong></p>
                      ))}
                    </div>
                    <div>
                      <h5>主要错误</h5>
                      {record.mistakes.length > 0 ? record.mistakes.map((mistake) => (
                        <p key={`${mistake.type}-${mistake.label}`}><span>{mistake.label}</span><strong>{mistake.count}</strong></p>
                      )) : <p><span>暂无错误摘要</span><strong>0</strong></p>}
                    </div>
                  </div>
                </PracticeReportPanel>
              ) : null}
            </article>
          )
        })}
      </section>
    </section>
  )
}
