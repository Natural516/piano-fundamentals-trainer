import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AppButton } from './AppButton'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[renderer] 页面渲染异常', error, info.componentStack)
  }

  private reload = (): void => {
    window.location.reload()
  }

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children
    }

    return (
      <main className="placeholder-page" role="alert">
        <section className="placeholder-card">
          <span>Application Error</span>
          <h2>页面出现异常</h2>
          <p>当前页面无法继续显示。请重新加载软件；本地练习记录不会被清除。</p>
          <AppButton onClick={this.reload}>重新加载</AppButton>
        </section>
      </main>
    )
  }
}
