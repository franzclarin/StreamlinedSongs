import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          height: '100vh', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: '#080810', color: '#f0ead6',
          fontFamily: '"DM Sans", sans-serif', gap: 16, padding: 40, textAlign: 'center',
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="1.5">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <div>
            <h2 style={{ fontFamily: '"Playfair Display", serif', fontSize: 24, margin: 0, marginBottom: 8 }}>
              Something went wrong
            </h2>
            <p style={{ color: '#52526a', fontSize: 14, margin: 0, marginBottom: 20 }}>
              {this.state.error.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '9px 22px', borderRadius: 20,
                background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                color: '#fbbf24', cursor: 'pointer', fontSize: 13, fontFamily: '"DM Sans"',
              }}
            >
              Refresh to try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
