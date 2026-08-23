interface PlaceholderPageProps {
  title: string
}

export function PlaceholderPage({ title }: PlaceholderPageProps): JSX.Element {
  return (
    <section className="placeholder-page">
      <div className="placeholder-panel">
        <span className="placeholder-kicker">钢琴基本功训练器</span>
        <h2>{title}</h2>
        <p>该功能将在后续阶段开发</p>
      </div>
    </section>
  )
}
