import { practiceModules, quickActions } from '../data'
import type { PageId, PracticeModule, QuickAction } from '../types'
import { AppButton } from './AppButton'
import { AppCard } from './AppCard'
import { CardIllustration } from './CardIllustrations'

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
    <AppCard as="article" interactive className={`practice-card accent-${module.accent}`}>
      <div className="practice-card__copy">
        <span className="module-number">{module.number}</span>
        <h3>{module.title}</h3>
        <p>{module.description}</p>
        <AppButton className="primary-button" onClick={() => onNavigate(module.id)}>
          开始练习 →
        </AppButton>
      </div>
      <CardIllustration kind={module.visual} />
    </AppCard>
  )
}

function QuickActionButton({
  action,
  onNavigate
}: {
  action: QuickAction
  onNavigate: (page: PageId) => void
}): JSX.Element {
  return (
    <AppButton className="quick-action" variant="secondary" onClick={() => onNavigate(action.id)}>
      <span className="quick-action__glyph" aria-hidden="true">
        {action.glyph}
      </span>
      <span>
        <strong>{action.title}</strong>
        <small>{action.description}</small>
      </span>
    </AppButton>
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
          <div className="session-chip">
            <span>当前练习概览</span>
            <strong>75%</strong>
          </div>
        </header>

        <div className="section-heading">
          <h3>选择你想要练习的板块</h3>
        </div>

        <div className="practice-grid">
          {practiceModules.map((module) => (
            <PracticeCard key={module.id} module={module} onNavigate={onNavigate} />
          ))}
        </div>

        <section className="quick-actions" aria-labelledby="quick-actions-title">
          <h3 id="quick-actions-title">快捷功能</h3>
          <div className="quick-action-grid">
            {quickActions.map((action) => (
              <QuickActionButton key={action.id} action={action} onNavigate={onNavigate} />
            ))}
          </div>
        </section>
      </section>
    </div>
  )
}
