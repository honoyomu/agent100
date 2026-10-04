import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useHarnesses } from '@/lib/api'

export interface AutoPauseValue {
  autoPause: boolean
  /** Kept as typed so the field can be cleared while editing. */
  seconds: string
}

export const DEFAULT_IDLE_SECONDS = 300

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h && `${h}h`, m && `${m}m`, s && `${s}s`].filter(Boolean).join(' ')
}

/** Returns the settings to send, or an error message. */
export function parseAutoPause(value: AutoPauseValue, bounds = { min: 60, max: 604800 }) {
  const seconds = Number(value.seconds)
  if (!value.autoPause) return { autoPause: false }
  if (!Number.isInteger(seconds) || seconds < bounds.min || seconds > bounds.max) {
    return { error: `Pause time must be a whole number between ${bounds.min} and ${bounds.max} seconds.` }
  }
  return { autoPause: true, idleTimeoutSeconds: seconds }
}

export function AutoPauseFields({
  value,
  onChange,
  idPrefix,
}: {
  value: AutoPauseValue
  onChange: (value: AutoPauseValue) => void
  idPrefix: string
}) {
  const { data } = useHarnesses()
  const min = data?.idleTimeout.min ?? 60
  const seconds = Number(value.seconds)

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-0.5">
          <Label htmlFor={`${idPrefix}-auto-pause`}>Auto pause</Label>
          <p className="text-sm text-muted-foreground">
            Pause the machine when nobody has used the agent for a while. Opening it resumes in seconds.
          </p>
        </div>
        <Switch
          id={`${idPrefix}-auto-pause`}
          checked={value.autoPause}
          onCheckedChange={(autoPause) => onChange({ ...value, autoPause })}
        />
      </div>
      {value.autoPause && (
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-idle-seconds`}>Pause after (seconds)</Label>
          <div className="flex items-center gap-3">
            <Input
              id={`${idPrefix}-idle-seconds`}
              type="number"
              inputMode="numeric"
              min={min}
              step={1}
              value={value.seconds}
              onChange={(e) => onChange({ ...value, seconds: e.target.value })}
              className="w-32"
            />
            <span className="text-sm text-muted-foreground">
              {Number.isInteger(seconds) && seconds >= min ? `= ${formatDuration(seconds)} idle` : `at least ${min}`}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
