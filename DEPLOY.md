# Deploy — claude-notify

## Prerrequisitos

- npm account en [npmjs.com](https://www.npmjs.com/)
- `npm login` hecho en local
- Node >= 18

---

## 1. Build y validación local

```bash
cd claude-notify
npm install
npm run build          # compila src/ → dist/
node dist/cli.js --help  # verifica que el binario funciona
```

Instala localmente para probar antes de publicar:

```bash
npm link
claude-notify setup
claude-notify test
claude-notify status
```

---

## 2. Checklist antes de publicar

- [ ] `package.json` → `version` actualizada (semver: `1.0.0`, `1.0.1`, etc.)
- [ ] `package.json` → `homepage` y `repository` apuntan al repo de GitHub
- [ ] `README.md` creado con instrucciones de uso (ver plantilla abajo)
- [ ] `dist/` generado limpio (`npm run build`)
- [ ] `npm pack` → revisa que el tarball solo incluye `dist/` (no `node_modules/`, no `src/`)

```bash
npm pack --dry-run   # lista los archivos que se publicarían
```

---

## 3. Publicar en npm

```bash
# Primera vez
npm publish --access public

# Versiones siguientes
npm version patch    # 1.0.0 → 1.0.1
npm publish
```

El campo `"files": ["dist"]` en `package.json` se asegura de que solo se suba el build compilado.

---

## 4. GitHub repo

```bash
git init
git add .
git commit -m "Initial release v1.0.0"
git remote add origin git@github.com:daik0z/claude-notify.git
git push -u origin main
git tag v1.0.0
git push --tags
```

Crea un release en GitHub �� sube el tarball generado por `npm pack`.

---

## 5. Actualizar versiones

```bash
# Bug fix
npm version patch     # 1.0.0 → 1.0.1

# Feature nueva (backwards compatible)
npm version minor     # 1.0.1 → 1.1.0

# Breaking change
npm version major     # 1.1.0 → 2.0.0

npm run build && npm publish
git push && git push --tags
```

---

## 6. Verificar post-publicación

```bash
npm info claude-notify          # metadata del paquete
npx claude-notify@latest --help # smoke test desde npm
```

---

## Plantilla README.md

```markdown
# claude-notify

Push notifications when Claude Code finishes working — desktop, mobile (ntfy.sh), and webhooks.

## Install

\`\`\`bash
npm install -g claude-notify
claude-notify setup
\`\`\`

## Setup

\`\`\`bash
# Desktop notifications (macOS, Linux, Windows) — enabled by default
claude-notify status

# Mobile push via ntfy.sh (free, no account needed)
# 1. Install ntfy app on your phone
# 2. Subscribe to your topic (make it unguessable)
claude-notify config set channels.ntfy.enabled true
claude-notify config set channels.ntfy.topic my-secret-topic-abc123

# Webhook (Slack, Discord, custom)
claude-notify config set channels.webhook.enabled true
claude-notify config set channels.webhook.url https://hooks.slack.com/your-webhook
\`\`\`

## Commands

| Command | Description |
|---|---|
| \`claude-notify setup\` | Install the hook in ~/.claude/settings.json |
| \`claude-notify uninstall\` | Remove the hook |
| \`claude-notify status\` | Show install + channel status |
| \`claude-notify test\` | Send a test notification |
| \`claude-notify config show\` | Print current config |
| \`claude-notify config set <key> <value>\` | Set a config value |

## How it works

Adds a \`Stop\` hook to \`~/.claude/settings.json\`. When Claude Code finishes a session,
it runs \`claude-notify send\`, which reads the transcript, builds a summary
("3 files edited · 2 commands"), and sends it to all enabled channels.

## Config keys

| Key | Default | Description |
|---|---|---|
| \`channels.desktop\` | \`true\` | Native OS notification |
| \`channels.ntfy.enabled\` | \`false\` | ntfy.sh push |
| \`channels.ntfy.topic\` | \`""\` | Your ntfy topic (unguessable string) |
| \`channels.ntfy.server\` | \`https://ntfy.sh\` | ntfy server (self-hosted ok) |
| \`channels.webhook.enabled\` | \`false\` | HTTP webhook |
| \`channels.webhook.url\` | \`""\` | Webhook URL |
| \`channels.webhook.bodyTemplate\` | \`{"text": "{{title}}: {{body}}"}\` | Body template |
| \`message.title\` | \`"Claude Code"\` | Notification title |
| \`message.includeStats\` | \`true\` | Include tool stats in body |

## License

MIT
\`\`\`
