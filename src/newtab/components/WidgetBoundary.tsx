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

  componentDidCatch(error: unknown) {
    console.error(`[aurora] ${this.props.name} widget crashed:`, error)
  }

  render() {
    if (this.state.failed) return null // a broken widget must never break the page
    return this.props.children
  }
}
