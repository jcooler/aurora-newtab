export type UtilityToolId = 'tasks' | 'notes' | 'timer' | 'homeassistant' | 'refresh'

export type UtilityCloseGuard = () => Promise<boolean>

export interface UtilityTrayBridge {
  activeTool: UtilityToolId | null
  host: HTMLElement | null
  requestTool: (tool: UtilityToolId, invoker: HTMLButtonElement) => void
  close: () => void
  registerCloseGuard: (tool: UtilityToolId, guard: UtilityCloseGuard | null) => void
}
