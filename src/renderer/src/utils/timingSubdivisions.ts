export interface PolyrhythmPoint {
  position: number
  left: boolean
  right: boolean
}

export function createEqualSubdivisionPositions(parts: number, beatCount = 1): number[] {
  if (!Number.isInteger(parts) || parts < 1 || !Number.isInteger(beatCount) || beatCount < 1) return []

  return Array.from({ length: parts * beatCount }, (_, index) => index / parts)
}

export function createPolyrhythmPoints(
  leftParts: number,
  rightParts: number,
  beatCount = 1
): PolyrhythmPoint[] {
  const leftPositions = new Set(createEqualSubdivisionPositions(leftParts, beatCount))
  const rightPositions = new Set(createEqualSubdivisionPositions(rightParts, beatCount))
  const positions = [...new Set([...leftPositions, ...rightPositions])].sort((left, right) => left - right)

  return positions.map((position) => ({
    position,
    left: leftPositions.has(position),
    right: rightPositions.has(position)
  }))
}
