# Cómo construí claude-notify: notificaciones cuando Claude Code termina de trabajar

## El problema

Claude Code es una herramienta brutal para delegar tareas largas — refactorizaciones, migraciones, generación de tests. El problema es que mientras trabaja, o te quedas mirando el terminal o pierdes el hilo de lo que estaba haciendo. No hay punto medio.

La solución obvia era una notificación. La no tan obvia era cómo engancharla correctamente.

---

## Cómo funciona el sistema de hooks de Claude Code

Claude Code tiene un sistema de hooks que ejecuta comandos de shell en respuesta a eventos internos. El más útil para este caso es `Stop` — se dispara cuando el agente termina una sesión.

La configuración vive en `~/.claude/settings.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "claude-notify send" }
        ]
      }
    ]
  }
}
```

Cuando Claude Code termina, ejecuta `claude-notify send` y le pasa contexto de la sesión por **stdin** en formato JSON:

```json
{
  "session_id": "abc123",
  "stop_hook_active": true,
  "transcript_path": "/home/user/.claude/transcripts/abc123.jsonl"
}
```

Ese `transcript_path` es el dato interesante — apunta a un archivo JSONL con todo lo que pasó en la sesión.

---

## Leyendo el transcript para construir el resumen

El transcript es un archivo JSONL donde cada línea es una entrada. Las que tienen `toolName` son llamadas a herramientas — exactamente lo que necesito para saber qué hizo Claude.

```typescript
const lines = readFileSync(transcriptPath, 'utf8').trim().split('\n')
const toolNames = lines
  .map(l => { try { return JSON.parse(l) } catch { return null } })
  .filter(e => e !== null && typeof e.toolName === 'string')
  .map(e => e.toolName)

const writes = toolNames.filter(n => n === 'Write' || n === 'Edit').length
const bashes = toolNames.filter(n => n === 'Bash').length
```

El resultado: `"4 archivos editados · 2 comandos"`. Simple y útil.

---

## Arquitectura del proyecto

```
src/
├── cli.ts          — comandos: setup, uninstall, status, config, send, test
├── setup.ts        — lee y escribe ~/.claude/settings.json
├── config.ts       — gestión de ~/.config/claude-notify/config.json
├── send.ts         — lógica principal: lee stdin, parsea transcript, despacha
└── channels/
    ├── desktop.ts  — notificaciones nativas (macOS, Linux, Windows)
    ├── ntfy.ts     — push móvil via ntfy.sh
    └── webhook.ts  — HTTP webhook (Slack, Discord, custom)
```

Cada canal es independiente. Si uno falla, los demás siguen. Todos los errores de red se suprimen porque el hook no puede bloquear a Claude Code.

---

## El canal de escritorio: más complicado de lo que parece

La primera versión usaba `execSync` con interpolación de strings:

```typescript
// ❌ MAL — inyección de comandos
execSync(`osascript -e 'display notification "${body}" with title "${title}"'`)
```

El problema: si `body` contiene `"`, rompe el string de AppleScript y puede ejecutar código arbitrario. Lo mismo en Linux con `notify-send` si el body tiene `$()` o backticks dentro de una string interpolada en shell.

La solución es usar `spawnSync` con un array de argumentos — los args van directamente al proceso, sin pasar por el shell:

```typescript
// ✅ BIEN — sin shell, sin interpolación
spawnSync('osascript', [
  '-e',
  `display notification "${escapeAppleScript(body)}" with title "${escapeAppleScript(title)}"`,
], { stdio: 'ignore', timeout: 5000 })
```

Para Linux es aún más limpio:

```typescript
spawnSync('notify-send', [title, body, '--icon=terminal'], { stdio: 'ignore' })
```

Los argumentos nunca pasan por el shell, así que no hay nada que escapar.

---

## Leyendo stdin de forma correcta

La primera implementación usaba `readFileSync('/dev/stdin')`. Tiene dos problemas: no existe en Windows, y si no hay datos puede bloquearse indefinidamente.

La versión correcta usa `process.stdin` con timeout:

```typescript
async function readStdin(): Promise<string> {
  return new Promise(resolve => {
    let data = ''
    let size = 0
    const timer = setTimeout(() => resolve(''), 2000)

    process.stdin.setEncoding('utf8')
    process.stdin.on('data', chunk => {
      size += Buffer.byteLength(chunk)
      if (size > 64 * 1024) { resolve(data); return }  // cap 64KB
      data += chunk
    })
    process.stdin.on('end', () => { clearTimeout(timer); resolve(data) })
    process.stdin.on('error', () => { clearTimeout(timer); resolve(data) })
  })
}
```

Si en 2 segundos no llega EOF, resuelve con lo que haya. El cap de 64KB evita OOM con payloads maliciosos.

---

## Protección contra path traversal y symlinks

El `transcript_path` viene de stdin — input externo. Si alguien pudiera controlarlo, podría leer cualquier archivo del sistema.

Primer guard: solo archivos dentro del home del usuario.

```typescript
function isSafePath(p: string): boolean {
  if (!resolve(p).startsWith(homedir() + '/')) return false
  try {
    return realpathSync(p).startsWith(homedir() + '/')
  } catch {
    return false
  }
}
```

La clave es usar `realpathSync` (que sigue symlinks) y no solo `path.resolve` (que no los sigue). Sin esto, un symlink en `~/.claude/evil -> /etc/passwd` pasaría el check de `resolve()` pero `readFileSync` lo seguiría.

El orden también importa: `existsSync` primero, luego `isSafePath`. `realpathSync` lanza si el archivo no existe, así que hay que asegurarse de que existe antes de llamarlo.

---

## Prototype pollution en setConfigValue

El comando `claude-notify config set <key> <value>` acepta claves con notación de punto: `channels.ntfy.topic my-topic`. Internamente traversa el objeto de configuración:

```typescript
const keys = keyPath.split('.')
let current = config
for (const key of keys) {
  current = current[key]  // ← peligroso si key es "__proto__"
}
current[lastKey] = value
```

Si `keyPath` es `__proto__.polluted`, `current` acaba siendo `Object.prototype` y `current['polluted'] = true` contamina el prototipo de todos los objetos. Aunque el objeto venga de `JSON.parse(JSON.stringify(...))`, la traversal posterior sigue siendo vulnerable.

```typescript
const DANGEROUS_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

if (keys.some(k => DANGEROUS_KEYS.has(k))) {
  throw new Error(`Invalid config key: ${keyPath}`)
}
```

Tres líneas, problema resuelto.

---

## Push móvil con ntfy.sh

[ntfy.sh](https://ntfy.sh) es un servicio de push notifications HTTP. Para mandar una notificación al móvil basta con un POST:

```
POST https://ntfy.sh/tu-topic
Title: Claude Code
Content-Type: text/plain

4 archivos editados · 2 comandos
```

El "topic" actúa como autenticación — si es suficientemente aleatorio, solo quien lo conoce puede publicar y suscribirse. La app móvil de ntfy es gratuita y open source.

Un detalle: el header `Title` puede causar HTTP header injection si contiene `\r\n`. Hay que sanitizarlo:

```typescript
function sanitizeHeader(s: string): string {
  return s.replace(/[\r\n]/g, ' ').trim()
}
```

Modern Node.js (>=18 con undici) ya valida esto y lanza un error, pero es mejor no depender de ello.

---

## Config con permisos 0600

La configuración guarda el topic de ntfy y la URL del webhook — datos que funcionan como contraseñas. Por defecto `writeFileSync` crea archivos con permisos `0644`, legibles por cualquier usuario del sistema.

```typescript
writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 })
```

Un detalle pequeño que marca la diferencia en sistemas compartidos.

---

## Lo que aprendí

El proyecto en sí es simple — 500 líneas de TypeScript. Lo interesante fue la auditoría de seguridad, que tardó más que el desarrollo inicial. Casi todos los bugs estaban en los sitios más "aburridos": cómo se llama a un proceso del sistema, cómo se lee stdin, cómo se traversan objetos con claves de usuario.

La regla que apliqué en cada decisión: **nunca pasar input externo a través del shell**. Si algo tiene que ejecutarse como proceso, `spawnSync` con array de argumentos. Si algo viene de fuera (stdin, filesystem, config), validar tipo, longitud y ruta antes de usarlo.

---

## Instalación

```bash
npm install -g @daik0z/claude-notify
claude-notify setup
```

GitHub: [github.com/ddaikodaiko/claude-notify](https://github.com/ddaikodaiko/claude-notify)
npm: [@daik0z/claude-notify](https://www.npmjs.com/package/@daik0z/claude-notify)
