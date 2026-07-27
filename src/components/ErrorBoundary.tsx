import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { hasError: boolean }

/**
 * Plain-text fallback on purpose: it must not depend on providers, since a
 * provider blowing up is exactly the case this catches.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error', error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-lg font-bold">משהו השתבש</h1>
        <p className="text-fg-muted max-w-sm text-sm">
          אירעה שגיאה בלתי צפויה. רעננו את הדף כדי להמשיך.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-brand text-on-brand rounded-xl px-5 py-2.5 text-sm font-semibold"
        >
          רענון
        </button>
      </main>
    )
  }
}
