import { createContext, useContext, type ReactNode } from 'react'
import { useTheme, type UseThemeResult } from '../hooks/useTheme'

const ThemeContext = createContext<UseThemeResult | null>(null)

interface ThemeProviderProps {
  children: ReactNode
}

export function ThemeProvider({ children }: ThemeProviderProps): JSX.Element {
  const theme = useTheme()
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

export function useThemeContext(): UseThemeResult {
  const context = useContext(ThemeContext)

  if (!context) {
    throw new Error('useThemeContext must be used inside ThemeProvider')
  }

  return context
}
