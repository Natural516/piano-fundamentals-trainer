import { useEffect, useRef } from 'react'
import type { MidiConnectionState } from '../types'

export function useMidiDisconnectProtection(
  connectionState: MidiConnectionState,
  sessionActive: boolean,
  onDisconnect: () => void
): void {
  const previousStateRef = useRef(connectionState)

  useEffect(() => {
    const previous = previousStateRef.current
    previousStateRef.current = connectionState
    if (previous === 'connected' && connectionState !== 'connected' && sessionActive) {
      onDisconnect()
    }
  }, [connectionState, onDisconnect, sessionActive])
}
