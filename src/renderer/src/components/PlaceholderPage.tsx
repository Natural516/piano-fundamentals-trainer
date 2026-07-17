interface PlaceholderPageProps {
  title: string
  onBackHome: () => void
}

export function PlaceholderPage({ title, onBackHome }: PlaceholderPageProps): JSX.Element {
  return (
    <section className="placeholder-page">
      <div className="placeholder-panel">
        <span className="placeholder-kicker">Piano Fundamentals Trainer</span>
        <h2>{title}</h2>
        <p>该功能将在后续阶段开发</p>
        <button className="primary-button" type="button" onClick={onBackHome}>
          返回首页
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </section>
  )
}
