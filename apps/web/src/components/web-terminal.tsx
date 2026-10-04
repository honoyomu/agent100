import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { Loader2Icon, RotateCwIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Phase = { kind: 'connecting'; message: string } | { kind: 'ready' } | { kind: 'closed'; message: string }

/**
 * xterm.js wired to an agent's machine over /api/agents/:id/terminal.
 * mode "agent" attaches to the agent's tmux session, "shell" opens a plain
 * login shell in the workspace.
 */
export function WebTerminal({
  agentId,
  mode = 'agent',
  className,
}: {
  agentId: string
  mode?: 'agent' | 'shell'
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>({ kind: 'connecting', message: 'Connecting…' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    setPhase({ kind: 'connecting', message: 'Connecting…' })

    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"Geist Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      theme: { background: '#000000' },
      allowProposedApi: true,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon())
    term.open(container)
    fit.fit()

    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    const params = new URLSearchParams({ cols: String(term.cols), rows: String(term.rows), mode })
    const ws = new WebSocket(`${proto}://${location.host}/api/agents/${agentId}/terminal?${params}`)
    ws.binaryType = 'arraybuffer'
    const send = (msg: object) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg))

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data))
        return
      }
      const msg = JSON.parse(e.data)
      if (msg.type === 'status') {
        if (msg.message) setPhase({ kind: 'connecting', message: msg.message })
        else {
          setPhase({ kind: 'ready' })
          term.focus()
        }
      } else if (msg.type === 'error') {
        setPhase({ kind: 'closed', message: msg.message })
      } else if (msg.type === 'exit') {
        setPhase({ kind: 'closed', message: 'Session ended.' })
      }
    }
    ws.onclose = () => setPhase((p) => (p.kind === 'closed' ? p : { kind: 'closed', message: 'Disconnected.' }))

    const input = term.onData((data) => send({ type: 'input', data }))
    const observer = new ResizeObserver(() => {
      fit.fit()
      send({ type: 'resize', cols: term.cols, rows: term.rows })
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      input.dispose()
      ws.close()
      term.dispose()
    }
  }, [agentId, mode, attempt])

  return (
    <div className={cn('relative min-h-0 bg-black', className)}>
      <div className="absolute inset-0 p-2" ref={containerRef} />
      {phase.kind !== 'ready' && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <div className="flex flex-col items-center gap-3 text-sm text-neutral-300">
            {phase.kind === 'closed' ? (
              <>
                <p>{phase.message}</p>
                <Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>
                  <RotateCwIcon />
                  Reconnect
                </Button>
              </>
            ) : (
              <>
                <Loader2Icon className="size-5 animate-spin" />
                <p>{phase.message}</p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
