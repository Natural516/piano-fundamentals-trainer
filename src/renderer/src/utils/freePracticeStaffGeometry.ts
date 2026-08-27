import { FREE_PRACTICE_HISTORY_CAPACITY } from './freePracticeVisualization'

export const FREE_PRACTICE_STAFF_GEOMETRY = Object.freeze({
  viewBox: '0 0 1200 340',
  width: 1200,
  height: 340,
  staveX: 42,
  staveWidth: 1116,
  trebleStaveY: 72,
  bassStaveY: 168,
  staffLineSpacing: 10,
  slotCount: FREE_PRACTICE_HISTORY_CAPACITY,
  formatWidth: 980,
  slotStartX: 150,
  slotSpacing: 98,
  noteheadScale: 1,
  clefScale: 1
} as const)

export interface FreePracticeStaffGeometrySnapshot {
  viewBox: string
  trebleStaveY: number
  bassStaveY: number
  staffLineSpacing: number
  slotCount: number
  formatWidth: number
  slotStartX: number
  slotSpacing: number
  noteheadScale: number
  clefScale: number
}

export function getFreePracticeStaffSlotPositions(): readonly number[] {
  const geometry = FREE_PRACTICE_STAFF_GEOMETRY
  return Array.from(
    { length: geometry.slotCount },
    (_, index) => geometry.slotStartX + index * geometry.slotSpacing
  )
}

export function getFreePracticeStaffGeometrySnapshot(): FreePracticeStaffGeometrySnapshot {
  const geometry = FREE_PRACTICE_STAFF_GEOMETRY
  return {
    viewBox: geometry.viewBox,
    trebleStaveY: geometry.trebleStaveY,
    bassStaveY: geometry.bassStaveY,
    staffLineSpacing: geometry.staffLineSpacing,
    slotCount: geometry.slotCount,
    formatWidth: geometry.formatWidth,
    slotStartX: geometry.slotStartX,
    slotSpacing: geometry.slotSpacing,
    noteheadScale: geometry.noteheadScale,
    clefScale: geometry.clefScale
  }
}
