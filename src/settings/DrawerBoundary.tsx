// src/settings/DrawerBoundary.tsx — the settings Drawer is the only
// always-mounted surface with no boundary above it: a throw inside
// SettingsPanel (e.g. `settings.widgets[key]` on a shape that skipped
// validation somehow) would otherwise unmount the whole React root, leaving
// every new tab blank. Same pattern as WidgetBoundary
// (src/newtab/components/WidgetBoundary.tsx), but WidgetBoundary's
// null-on-failure fallback isn't right standalone here — a widget silently
// disappearing from a grid is fine, but the settings panel going fully blank
// (with no explanation, inside a drawer the user just opened) reads as
// broken rather than "nothing to see here." This shows a quiet, dismissable
// inline message instead.
import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

export default class DrawerBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('[aurora] settings drawer crashed:', error)
  }

  render() {
    if (this.state.failed) {
      return (
        <p role="alert" className="text-sm text-fg-muted">
          Settings couldn&apos;t be displayed. Try closing and reopening this panel.
        </p>
      )
    }
    return this.props.children
  }
}
