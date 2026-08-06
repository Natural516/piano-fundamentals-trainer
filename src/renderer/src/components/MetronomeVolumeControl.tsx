interface MetronomeVolumeControlProps {
  id: string
  value: number
  onChange: (volume: number) => void
}

export function MetronomeVolumeControl({ id, onChange, value }: MetronomeVolumeControlProps): JSX.Element {
  return (
    <label className="header-metronome-volume" htmlFor={id}>
      <span>节拍器音量</span>
      <input
        aria-label="节拍器音量"
        id={id}
        max="100"
        min="0"
        type="range"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <strong>{value}%</strong>
    </label>
  )
}

