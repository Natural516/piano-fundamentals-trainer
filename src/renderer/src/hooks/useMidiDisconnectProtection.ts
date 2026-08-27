import { useEffect, useRef } from 'react'
import type { MidiConnectionState } from '../types'

export function useMidiDisconnectProtection(
  connectionState: MidiConnectionState,
  sessionActive: boolean,
  onDisconnect: () => void
): void {
  const handledOutageRef = useRef(false)

  useEffect(() => {
    if (connectionState !== 'disconnected' && connectionState !== 'pending') {
      handledOutageRef.current = false
      return
    }

    if (sessionActive && !handledOutageRef.current) {
      handledOutageRef.current = true
      onDisconnect()
    }
  }, [connectionState, onDisconnect, sessionActive])
}
