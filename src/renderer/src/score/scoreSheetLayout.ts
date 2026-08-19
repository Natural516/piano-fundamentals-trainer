export const SCORE_SHEET_MAX_MEASURES_PER_SYSTEM = 4
export const SCORE_SHEET_PORTRAIT_BREAKPOINT = 720
export const SCORE_SHEET_MIN_MEASURE_WIDTH = 164
export const SCORE_SHEET_MAX_MEASURE_WIDTH = 232
export const SCORE_SHEET_SYSTEM_SIDE_MARGIN = 28
export const SCORE_SHEET_PORTRAIT_SIDE_MARGIN = 18
export const SCORE_SHEET_GRAND_SYSTEM_HEIGHT = 216
export const SCORE_SHEET_SINGLE_SYSTEM_HEIGHT = 126
export const SCORE_SHEET_SYSTEM_GAP = 12

export interface ScoreSheetSystemLayout {
  index: number
  measureNumbers: number[]
  measureWidth: number
  startX: number
  top: number
}

export interface ScoreSheetLayout {
  height: number
  measuresPerSystem: number
  sideMargin: number
  systemHeight: number
  systems: ScoreSheetSystemLayout[]
  width: number
}

function safeViewportWidth(viewportWidth: number): number {
  return Math.max(320, Math.floor(Number.isFinite(viewportWidth) ? viewportWidth : 0))
}

export function getScoreMeasuresPerSystem(viewportWidth: number): number {
  const width = safeViewportWidth(viewportWidth)
  const portrait = width <= SCORE_SHEET_PORTRAIT_BREAKPOINT
  const sideMargin = portrait ? SCORE_SHEET_PORTRAIT_SIDE_MARGIN : SCORE_SHEET_SYSTEM_SIDE_MARGIN
  const fitted = Math.floor((width - sideMargin * 2) / SCORE_SHEET_MIN_MEASURE_WIDTH)
  const responsiveMaximum = portrait ? 2 : SCORE_SHEET_MAX_MEASURES_PER_SYSTEM
  return Math.max(1, Math.min(responsiveMaximum, fitted))
}

export function buildScoreSheetLayout(
  measureNumbers: number[],
  viewportWidth: number,
  grandStaff: boolean
): ScoreSheetLayout {
  const width = safeViewportWidth(viewportWidth)
  const measuresPerSystem = getScoreMeasuresPerSystem(width)
  const sideMargin = width <= SCORE_SHEET_PORTRAIT_BREAKPOINT
    ? SCORE_SHEET_PORTRAIT_SIDE_MARGIN
    : SCORE_SHEET_SYSTEM_SIDE_MARGIN
  const systemHeight = grandStaff ? SCORE_SHEET_GRAND_SYSTEM_HEIGHT : SCORE_SHEET_SINGLE_SYSTEM_HEIGHT
  const usableWidth = width - sideMargin * 2
  const systems: ScoreSheetSystemLayout[] = []

  for (let offset = 0; offset < measureNumbers.length; offset += measuresPerSystem) {
    const systemMeasures = measureNumbers.slice(offset, offset + measuresPerSystem)
    const measureWidth = Math.min(
      SCORE_SHEET_MAX_MEASURE_WIDTH,
      Math.floor(usableWidth / Math.max(1, systemMeasures.length))
    )
    const contentWidth = measureWidth * systemMeasures.length
    systems.push({
      index: systems.length,
      measureNumbers: systemMeasures,
      measureWidth,
      startX: Math.floor(sideMargin + (usableWidth - contentWidth) / 2),
      top: systems.length * (systemHeight + SCORE_SHEET_SYSTEM_GAP)
    })
  }

  return {
    height: systems.length > 0
      ? systems.length * systemHeight + (systems.length - 1) * SCORE_SHEET_SYSTEM_GAP
      : systemHeight,
    measuresPerSystem,
    sideMargin,
    systemHeight,
    systems,
    width
  }
}
