import type { Harness } from '../db/schema.js'

const OPENROUTER = 'https://openrouter.ai/api'
const WORKSPACE = '/data/workspace'
// Hermes state lives next to its install on the root disk (images/hermes.sh).
const HERMES_HOME = '/opt/hermes/home/.hermes'

export interface HarnessFile {
  path: string // relative to the machine user's HOME
  content: string
  mode?: string
}

export interface HarnessDef {
  id: Harness
  label: string
  /** How the user reaches it: a web terminal, or the agent's own web UI. */
  kind: 'terminal' | 'web'
  /** Command started in the agent's tmux session (terminal and fallback for web agents). */
  terminalCommand: string
  /** Loopback port of the agent's web UI (kind "web"). */
  webPort?: number
  /** Where the web UI opens (defaults to /). */
  webEntryPath?: string
  /** Extra `export` lines for ~/.agent100/env. */
  env: string[]
  files: HarnessFile[]
  /** systemd user units to enable after the files are written. */
  services?: string[]
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n'

export const HARNESSES: Record<Harness, HarnessDef> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    kind: 'terminal',
    terminalCommand: 'claude',
    env: [
      `export ANTHROPIC_BASE_URL=${OPENROUTER}`,
      'export ANTHROPIC_AUTH_TOKEN="$OPENROUTER_API_KEY"',
      'export ANTHROPIC_API_KEY=',
      'export ANTHROPIC_MODEL=anthropic/claude-sonnet-5.5',
      'export ANTHROPIC_DEFAULT_SONNET_MODEL=anthropic/claude-sonnet-5.5',
      'export ANTHROPIC_DEFAULT_OPUS_MODEL=anthropic/claude-opus-5.5',
      'export ANTHROPIC_DEFAULT_HAIKU_MODEL=anthropic/claude-haiku-4.5',
    ],
    files: [
      {
        path: '.claude.json',
        content: json({
          hasCompletedOnboarding: true,
          theme: 'dark',
          projects: { [WORKSPACE]: { hasTrustDialogAccepted: true, hasCompletedProjectOnboarding: true } },
        }),
      },
    ],
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    kind: 'terminal',
    terminalCommand: 'codex',
    env: [],
    files: [
      {
        path: '.codex/config.toml',
        content: [
          'model = "openai/gpt-5.6-terra"',
          'model_provider = "openrouter"',
          // The agent's VM is the isolation boundary; Codex's own sandbox would
          // block the network and the Docker socket inside it.
          'sandbox_mode = "danger-full-access"',
          '',
          '[model_providers.openrouter]',
          'name = "OpenRouter"',
          `base_url = "${OPENROUTER}/v1"`,
          'env_key = "OPENROUTER_API_KEY"',
          'wire_api = "responses"',
          '',
          `[projects."${WORKSPACE}"]`,
          'trust_level = "trusted"',
          '',
        ].join('\n'),
      },
    ],
  },
  opencode: {
    id: 'opencode',
    label: 'OpenCode',
    kind: 'web',
    terminalCommand: 'opencode',
    webPort: 4096,
    // OpenCode routes projects by base64url-encoded directory.
    webEntryPath: `/${Buffer.from(WORKSPACE).toString('base64url')}/session`,
    env: [],
    files: [
      {
        path: '.config/opencode/opencode.json',
        content: json({
          $schema: 'https://opencode.ai/config.json',
          model: 'openrouter/anthropic/claude-sonnet-5.5',
          small_model: 'openrouter/anthropic/claude-haiku-4.5',
          autoupdate: false,
          // The web UI picks a provider default rather than `model`, so keep
          // the list to models that work well for coding.
          enabled_providers: ['openrouter'],
          provider: {
            openrouter: {
              whitelist: [
                'anthropic/claude-sonnet-5.5',
                'anthropic/claude-opus-5.5',
                'anthropic/claude-haiku-4.5',
                'openai/gpt-5.6-terra',
                'openai/gpt-5.6-sol',
              ],
            },
          },
        }),
      },
      {
        path: '.config/systemd/user/agent-web.service',
        content: [
          '[Unit]',
          'Description=OpenCode web UI',
          '',
          '[Service]',
          `WorkingDirectory=${WORKSPACE}`,
          'ExecStart=/bin/bash -lc "exec opencode web --hostname 127.0.0.1 --port 4096"',
          'Restart=always',
          'RestartSec=2',
          '',
          '[Install]',
          'WantedBy=default.target',
          '',
        ].join('\n'),
      },
    ],
    services: ['agent-web.service'],
  },
  hermes: {
    id: 'hermes',
    label: 'Hermes',
    kind: 'web',
    terminalCommand: 'hermes',
    webPort: 9119,
    webEntryPath: '/chat',
    env: [`export HERMES_HOME=${HERMES_HOME}`],
    files: [
      {
        path: '.config/systemd/user/agent-web.service',
        content: [
          '[Unit]',
          'Description=Hermes dashboard',
          '',
          '[Service]',
          `WorkingDirectory=${WORKSPACE}`,
          // Loopback only: the dashboard skips its auth gate there, and the
          // Agent100 proxy (behind its own auth) is the only way in.
          'ExecStart=/bin/bash -lc "exec hermes dashboard --host 127.0.0.1 --port 9119 --no-open"',
          'Restart=always',
          'RestartSec=2',
          '',
          '[Install]',
          'WantedBy=default.target',
          '',
        ].join('\n'),
      },
    ],
    services: ['agent-web.service'],
  },
}

export const TMUX_SESSION = 'agent'
export { WORKSPACE }

/** A plain login shell in the workspace, separate from the agent's own session. */
export const SHELL_COMMAND = `cd ${WORKSPACE} && exec bash -l`

/** The command a terminal connection runs: attach to (or start) the agent's tmux session. */
export function terminalCommand(def: HarnessDef) {
  const inner = `${def.terminalCommand}; exec bash -l`
  return `tmux new-session -A -s ${TMUX_SESSION} -c ${WORKSPACE} "bash -lc '${inner}'"`
}
