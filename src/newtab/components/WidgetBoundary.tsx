import { Component, type ReactNode } from 'react'

interface Props {
  name: string
  children: ReactNode
}

export default class WidgetBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    console.error('[aurora] widget render failure:', this.props.name)
  }

  render() {
    if (this.state.failed) {
      return (
        <div role="alert" aria-label={`${this.props.name} unavailable`}>
          {this.props.name} is unavailable.
        </div>
      )
    }
    return this.props.children
  }
}
