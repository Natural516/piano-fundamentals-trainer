import { AppCard } from './AppCard'

const recentRecords = [
  {
    title: '音阶练习（C大调）',
    accuracy: '92%',
    time: '15分钟前',
    tone: 'cyan'
  },
  {
    title: '和弦练习（大三和弦）',
    accuracy: '85%',
    time: '45分钟前',
    tone: 'amber'
  },
  {
    title: '节奏与切分（切分节奏）',
    accuracy: '78%',
    time: '1小时前',
    tone: 'violet'
  }
]

export function RightInfoPanel(): JSX.Element {
  return (
    <aside className="right-panel" aria-label="练习信息">
      <AppCard as="section" className="info-card today-card">
        <h3>今日练习统计</h3>
        <div className="today-stat-layout">
          <div className="progress-ring" aria-label="完成度 75%">
            <span>75%</span>
            <small>完成度</small>
          </div>
          <dl className="stat-list">
            <div>
              <dt>练习时长</dt>
              <dd>45 分钟</dd>
            </div>
            <div>
              <dt>完成练习</dt>
              <dd>5 个板块</dd>
            </div>
            <div>
              <dt>正确率</dt>
              <dd>87%</dd>
            </div>
          </dl>
        </div>
      </AppCard>

      <AppCard as="section" className="info-card records-card">
        <h3>最近练习记录</h3>
        <div className="record-list">
          {recentRecords.map((record) => (
            <article key={record.title} className="record-item">
              <span className={`record-icon tone-${record.tone}`} aria-hidden="true">
                ♪
              </span>
              <div>
                <strong>{record.title}</strong>
                <p>正确率 {record.accuracy}</p>
              </div>
              <time>{record.time}</time>
            </article>
          ))}
        </div>
      </AppCard>
    </aside>
  )
}
