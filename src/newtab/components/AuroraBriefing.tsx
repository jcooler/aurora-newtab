import { summarizeAttention } from '../../lib/attention'
import { useStoredKey } from '../../lib/hooks/useStoredKey'
import AttentionContextPanel from './AttentionContextPanel'
import AttentionRefreshOwners from './AttentionRefreshOwners'
import { useAttentionSignals } from './useAttentionSignals'

export default function AuroraBriefing() {
  const [settings] = useStoredKey('settings')
  const [connectors] = useStoredKey('connectors')
  const { signals, ready } = useAttentionSignals()

  if (settings === undefined || connectors === undefined || settings.briefingEnabled !== true) return null

  return (
    <>
      <AttentionRefreshOwners />
      {ready && signals.length > 0 ? (
        <div data-aurora-briefing="" data-canvas-type-role="support" className="aurora-briefing text-photo text-canvas-fg-muted">
          <AttentionContextPanel summary={summarizeAttention(signals)} signals={signals} />
        </div>
      ) : null}
    </>
  )
}
