import { practiceModules } from '../data'
import type { PageId, PracticeModule } from '../types'
import { AppCard } from './AppCard'

interface HomePageProps {
  onNavigate: (page: PageId) => void
}

function PracticeCard({
  module,
  onNavigate
}: {
  module: PracticeModule
  onNavigate: (page: PageId) => void
}): JSX.Element {
  return (
    <AppCard
      as="article"
      aria-label={`进入${module.title}`}
      className={`practice-card practice-card--text-only practice-card--clickable accent-${module.accent}`}
      interactive
      role="button"
      tabIndex={0}
      onClick={() => onNavigate(module.id)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onNavigate(module.id)
        }
      }}
    >
      <div className="practice-card__copy">
        <span className="module-number">{module.number}</span>
        <h3>{module.title}</h3>
        <p>{module.description}</p>
      </div>
    </AppCard>
  )
}

export function HomePage({ onNavigate }: HomePageProps): JSX.Element {
  return (
    <div className="home-layout">
      <section className="home-main">
        <header className="home-header">
          <div>
            <span className="eyebrow">欢迎回来，继续你的练习吧！</span>
            <h2>钢琴基本功训练器</h2>
            <p>Piano Fundamentals Trainer</p>
          </div>
        </header>

        <div className="section-heading">
          <h3>选择你想要练习的板块</h3>
        </div>

        <div className="practice-grid">
          {practiceModules.map((module) => (
            <PracticeCard key={module.id} module={module} onNavigate={onNavigate} />
          ))}
          <button className="home-action-card" type="button" onClick={() => onNavigate('training-plan')}>
            <strong>今日训练</strong>
            <small>查看并执行今日计划</small>
          </button>
          <button className="home-action-card" type="button" onClick={() => onNavigate('analytics')}>
            <strong>AI 钢琴助理</strong>
            <small>基于记录的解释、建议与复盘</small>
          </button>
        </div>

      </section>
    </div>
  )
}
