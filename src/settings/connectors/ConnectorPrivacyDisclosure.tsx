import { useId, useState } from 'react'
import { LOCAL_SECRET_STORAGE_NOTICE } from '../../privacy/dataFlows'

const SUMMARY =
  'Connector details stay in this Chrome profile and are sent only to the services you choose.'

export default function ConnectorPrivacyDisclosure() {
  const [open, setOpen] = useState(false)
  const id = useId()
  const buttonId = `${id}-button`
  const regionId = `${id}-region`

  return (
    <div className="space-y-2">
      <p className="text-xs leading-relaxed text-fg-muted">{SUMMARY}</p>
      <button
        id={buttonId}
        type="button"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => setOpen((current) => !current)}
        className="min-h-9 cursor-pointer rounded-md text-left text-xs font-medium text-accent hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        How connector data is handled
      </button>
      {open ? (
        <div
          id={regionId}
          role="region"
          aria-labelledby={buttonId}
          className="space-y-2 rounded-lg border border-control-border bg-control-bg/35 p-3 text-xs leading-relaxed text-fg-muted"
        >
          <p>{LOCAL_SECRET_STORAGE_NOTICE}</p>
          <p>
            RSS feed and calendar addresses can be capability URLs that grant access like a password.
            Aurora omits them and connector credentials from backups, so they must be re-entered after restore.
          </p>
          <p>
            Disconnecting removes the saved connection and releases site access that no other connector uses.
            On a shared or untrusted profile, disconnect first or clear Aurora’s extension data after use.
          </p>
        </div>
      ) : null}
    </div>
  )
}
