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

interface PracticeHistoryPageProps {
  onBackHome: () => void
}

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
  questionCount: '题数',
  noteNameVisible: '音名提示',
  pattern: '模板',
  bpm: 'BPM',
  tolerance: '宽容度',
  key: '调性',
  mode: '模式',
  chordType: '和弦类型',
  inversionMode: '转位',
  measureCount: '小节数'
}

function formatSettingValue(value: string | number | boolean): string {
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  return String(value)
}

function getPrimarySettings(record: PracticeSessionRecord): string {
  const entries = Object.entries(record.settings).slice(0, 3)
  return entries.length > 0
    ? entries.map(([key, value]) => `${settingLabels[key] ?? key}: ${formatSettingValue(value)}`).join(' · ')
    : '无额外设置'
}

export function PracticeHistoryPage({ onBackHome }: PracticeHistoryPageProps): JSX.Element {
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
          <span className="eyebrow">Practice History</span>
          <h2>练习记录</h2>
          <p>本地保存最近 200 次已完成练习。</p>
        </div>
        <AppButton className="secondary-inline-button" variant="secondary" onClick={onBackHome}>
          返回首页
        </AppButton>
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
                      {Object.entries(record.settings).map(([key, value]) => (
                        <p key={key}><span>{settingLabels[key] ?? key}</span><strong>{formatSettingValue(value)}</strong></p>
                      ))}
                    </div>
                    <div>
                      <h5>模块详情</h5>
                      {Object.entries(record.details).map(([key, value]) => (
                        <p key={key}><span>{key}</span><strong>{value === null ? '-' : formatSettingValue(value)}</strong></p>
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
