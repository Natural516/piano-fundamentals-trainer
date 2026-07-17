const whiteKeys = Array.from({ length: 14 }, (_, index) => index)
const blackKeyOffsets = [0.7, 1.7, 3.7, 4.7, 5.7, 7.7, 8.7, 10.7, 11.7, 12.7]

export function VirtualKeyboard(): JSX.Element {
  return (
    <div className="keyboard-preview" aria-label="小型虚拟钢琴键盘预览">
      <div className="white-keys">
        {whiteKeys.map((key) => (
          <span key={key} className="white-key" />
        ))}
      </div>
      {blackKeyOffsets.map((offset) => (
        <span
          key={offset}
          className="black-key"
          style={{ left: `${(offset / whiteKeys.length) * 100}%` }}
        />
      ))}
    </div>
  )
}
