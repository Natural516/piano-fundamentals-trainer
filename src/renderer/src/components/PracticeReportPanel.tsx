import type { ReactNode } from 'react'
import type { PracticeSessionRecord } from '../utils/practiceRecordTypes'
import { AppButton } from './AppButton'
import { PracticeStatGrid } from './PracticeStatGrid'

interface PracticeReportPanelProps {
  record: PracticeSessionRecord
  children?: ReactNode
  onBackHome?: () => void
  onRepeat?: () => void
}

export function PracticeReportPanel({
  record,
  children,
  onBackHome,
  onRepeat
}: PracticeReportPanelProps): JSX.Element {
  return (
    <section className="practice-report-panel">
      <div className="practice-report-heading">
        <div>
          <span>{record.moduleName}</span>
          <h4>{record.title}</h4>
        </div>
        <strong>{record.status === 'completed' ? '已完成' : '已停止'}</strong>
      </div>

      <PracticeStatGrid
        items={[
          { label: '正确率', value: `${record.accuracy}%` },
          { label: '总事件', value: record.totalEvents },
          { label: '正确', value: record.correctEvents },
          { label: '错音', value: record.wrongNoteCount },
          { label: '漏音', value: record.missingNoteCount },
          { label: '多音', value: record.extraNoteCount },
          { label: '早弹', value: record.earlyCount },
          { label: '晚弹', value: record.lateCount },
          { label: '休止错误', value: record.restErrorCount },
          { label: '同步警告', value: record.syncWarningCount },
          { label: '平均偏移', value: typeof record.averageOffsetMs === 'number' ? `${record.averageOffsetMs}ms` : '-' }
        ]}
      />

      {children}

      {onBackHome || onRepeat ? (
        <div className="practice-report-actions">
          {onRepeat ? <AppButton onClick={onRepeat}>再练一次</AppButton> : null}
          {onBackHome ? <AppButton variant="secondary" onClick={onBackHome}>返回首页</AppButton> : null}
        </div>
      ) : null}
    </section>
  )
}

