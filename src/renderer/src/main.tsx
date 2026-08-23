import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppErrorBoundary } from './components/AppErrorBoundary'
import { ThemeProvider } from './contexts/ThemeContext'
import { initializeTheme } from './utils/themeStorage'
import './styles.css'
import './tokens.css'
import './components.css'
import './styles/themes.css'
import './styles/practice-usability.css'
import './styles/training-plan.css'
import './styles/f2-ui.css'

initializeTheme()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </AppErrorBoundary>
  </React.StrictMode>
)
