# claude-notify

Get notified when Claude Code finishes working. Supports desktop (macOS, Linux, Windows), mobile via [ntfy](https://ntfy.sh), and custom webhooks.

---

## Install

```bash
npm install -g claude-notify
claude-notify setup
```

That's it. Claude Code will notify you from now on.

## How it works

Adds a `Stop` hook to `~/.claude/settings.json`. When a Claude Code session ends, it runs `claude-notify send`, reads the session transcript, and sends a summary to your configured channels.

```
Claude Code finishes → hook fires → claude-notify send → desktop + phone
```

Example notification body: `3 files edited · 2 commands`

---

## Channels

### Desktop (default, zero config)

Works out of the box on macOS, Linux, and Windows. Uses native OS notifications.

### Mobile — ntfy.sh (free, no account needed)

1. Install the [ntfy app](https://ntfy.sh) on your phone
2. Pick a topic — make it unguessable, it's your auth

```bash
claude-notify config set channels.ntfy.enabled true
claude-notify config set channels.ntfy.topic your-secret-topic-xyz
```

3. Subscribe to `ntfy.sh/your-secret-topic-xyz` in the app

Self-hosted ntfy also works:

```bash
claude-notify config set channels.ntfy.server https://ntfy.yourdomain.com
```

### Webhooks (Slack, Discord, custom)

```bash
claude-notify config set channels.webhook.enabled true
claude-notify config set channels.webhook.url https://hooks.slack.com/services/...
```

Default body template: `{"text": "{{title}}: {{body}}"}` — change with `channels.webhook.bodyTemplate`.

---

## Commands

| Command | Description |
|---|---|
| `claude-notify setup` | Add hook to `~/.claude/settings.json` |
| `claude-notify uninstall` | Remove hook |
| `claude-notify status` | Show install + channel status |
| `claude-notify test` | Fire a test notification on all channels |
| `claude-notify config show` | Print current config |
| `claude-notify config set <key> <value>` | Set a config value |

---

## Config reference

Config lives at `~/.config/claude-notify/config.json` (mode 600).

| Key | Default | Description |
|---|---|---|
| `channels.desktop` | `true` | Native OS notification |
| `channels.ntfy.enabled` | `false` | ntfy push |
| `channels.ntfy.topic` | `""` | Topic name (treat like a password) |
| `channels.ntfy.server` | `https://ntfy.sh` | ntfy server URL |
| `channels.webhook.enabled` | `false` | HTTP webhook |
| `channels.webhook.url` | `""` | Webhook URL (http/https only) |
| `channels.webhook.method` | `POST` | HTTP method |
| `channels.webhook.headers` | `{"Content-Type": "application/json"}` | Request headers |
| `channels.webhook.bodyTemplate` | `{"text": "{{title}}: {{body}}"}` | Body template (`{{title}}`, `{{body}}`) |
| `message.title` | `"Claude Code"` | Notification title |
| `message.includeStats` | `true` | Include tool stats in body |

---

## License

MIT
