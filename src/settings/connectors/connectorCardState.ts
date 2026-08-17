import type {
  ConnectorConfig,
  ConnectorDescriptor,
  CryptoConfig,
  IcsConfig,
  RssConfig,
  StatusConfig,
} from '../../services/connectors/types'

export type ConnectorCardMode = 'setup' | 'edit' | 'reconnect'
export type ConnectorPrimaryAction = 'setup' | 'edit' | 'reconnect'
export type ConnectorPresentationState =
  | 'unconfigured'
  | 'configured-hidden'
  | 'configured-visible'
  | 'reconnect-required'

export interface ConnectorCardPresentation {
  configured: boolean
  visible: boolean
  state: ConnectorPresentationState
  stateLabel: 'Not set up' | 'Hidden' | 'On canvas' | 'Reconnect required'
  identityLabel: string | null
  primaryAction: ConnectorPrimaryAction
  primaryActionLabel: 'Set up' | 'Edit' | 'Reconnect'
  mode: ConnectorCardMode
  showVisibilityControl: boolean
  group: 'on-canvas' | 'available'
  openImmediately: boolean
}

export type ConnectorAuthState = 'none' | 'unconfigured' | 'connected' | 'reconnect'

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

export function connectorAuthState(
  descriptor: ConnectorDescriptor,
  config: ConnectorConfig | undefined,
): ConnectorAuthState {
  if (descriptor.auth === 'none') return 'none'
  const identity = descriptor.identityField ? text(config?.[descriptor.identityField]) : null
  if (!identity) return 'unconfigured'
  const missingSecret = descriptor.secretFields.some((field) => !text(config?.[field]))
  return missingSecret ? 'reconnect' : 'connected'
}

function hasMeaningfulLocalConfig(
  descriptor: ConnectorDescriptor,
  config: ConnectorConfig | undefined,
): boolean {
  if (!config) return false
  switch (descriptor.id) {
    case 'rss':
      return (config as RssConfig).feeds?.some((feed) => !!text(feed)) === true
    case 'crypto':
      return (config as CryptoConfig).coins?.filter((coin) => !!text(coin)).length >= 2
    case 'ics': {
      const ics = config as IcsConfig
      return !!text(ics.url) || ics.calendars?.some((calendar) => !!text(calendar?.url)) === true
    }
    case 'status':
      return (config as StatusConfig).services?.some((service) => !!text(service?.url)) === true
    default:
      return false
  }
}

function ownsValidAuthenticatedConfig(
  descriptor: ConnectorDescriptor,
  config: ConnectorConfig | undefined,
): boolean {
  if (!config) return false
  try {
    return descriptor.ownsOrigins(config) === true
  } catch {
    return false
  }
}

function identityLabel(
  descriptor: ConnectorDescriptor,
  config: ConnectorConfig | undefined,
): string | null {
  if (!descriptor.identityField) return null
  const identity = text(config?.[descriptor.identityField])
  return identity ? `Connected ${descriptor.identityPhrase ?? 'as'} ${identity}` : null
}

export function deriveConnectorCardState(
  descriptor: ConnectorDescriptor,
  config: ConnectorConfig | undefined,
): ConnectorCardPresentation {
  const auth = connectorAuthState(descriptor, config)
  const identity = identityLabel(descriptor, config)

  if (auth === 'reconnect') {
    return {
      configured: false,
      visible: false,
      state: 'reconnect-required',
      stateLabel: 'Reconnect required',
      identityLabel: identity,
      primaryAction: 'reconnect',
      primaryActionLabel: 'Reconnect',
      mode: 'reconnect',
      showVisibilityControl: false,
      group: 'available',
      openImmediately: true,
    }
  }

  const configured = descriptor.auth === 'none'
    ? hasMeaningfulLocalConfig(descriptor, config)
    : auth === 'connected' && ownsValidAuthenticatedConfig(descriptor, config)

  if (!configured) {
    return {
      configured: false,
      visible: false,
      state: 'unconfigured',
      stateLabel: 'Not set up',
      identityLabel: null,
      primaryAction: 'setup',
      primaryActionLabel: 'Set up',
      mode: 'setup',
      showVisibilityControl: false,
      group: 'available',
      openImmediately: false,
    }
  }

  const visible = config?.enabled === true
  return {
    configured: true,
    visible,
    state: visible ? 'configured-visible' : 'configured-hidden',
    stateLabel: visible ? 'On canvas' : 'Hidden',
    identityLabel: identity,
    primaryAction: 'edit',
    primaryActionLabel: 'Edit',
    mode: 'edit',
    showVisibilityControl: true,
    group: visible ? 'on-canvas' : 'available',
    openImmediately: false,
  }
}
