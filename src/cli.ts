#!/usr/bin/env node
import { program } from 'commander'
import { install, uninstall, isInstalled } from './setup.js'
import { loadConfig, saveConfig, setConfigValue, getConfigValue } from './config.js'
import { send } from './send.js'
import { sendDesktop } from './channels/desktop.js'
import { sendNtfy } from './channels/ntfy.js'
import { sendWebhook } from './channels/webhook.js'

// Read version from package.json at runtime — stays in sync automatically
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

program
  .name('claude-notify')
  .description('Push notifications when Claude Code finishes working.')
  .version(version)

// ─── helpers ─────────────────────────────────────────────────────────────────

function maskSecret(s: string): string {
  if (s.length <= 8) return '*'.repeat(s.length)
  return `${s.slice(0, 4)}${'*'.repeat(s.length - 8)}${s.slice(-4)}`
}

// ─── setup ──────────────────────────────────────────────────────────────────

program
  .command('setup')
  .description('Install the Stop hook in ~/.claude/settings.json')
  .action(() => {
    const { alreadyInstalled } = install()
    if (alreadyInstalled) {
      console.log('✓ Already installed.')
    } else {
      console.log('✓ Hook installed in ~/.claude/settings.json')
      console.log('  Claude Code will notify you when it finishes.')
      console.log('')
      console.log('  Next: configure channels')
      console.log('  claude-notify config set channels.ntfy.enabled true')
      console.log('  claude-notify config set channels.ntfy.topic my-topic')
    }
  })

program
  .command('uninstall')
  .description('Remove the Stop hook from ~/.claude/settings.json')
  .action(() => {
    const { wasInstalled } = uninstall()
    if (wasInstalled) {
      console.log('✓ Hook removed.')
    } else {
      console.log('  Not installed — nothing to do.')
    }
  })

program
  .command('status')
  .description('Show installation and config status')
  .action(() => {
    const installed = isInstalled()
    const config = loadConfig()
    console.log(`Hook:     ${installed ? '✓ installed' : '✗ not installed (run setup)'}`)
    console.log(`Desktop:  ${config.channels.desktop ? '✓ enabled' : '✗ disabled'}`)
    const { enabled: ntfyEnabled, topic, server } = config.channels.ntfy
    let ntfyStatus: string
    if (!ntfyEnabled) {
      ntfyStatus = '✗ disabled'
    } else if (!topic) {
      ntfyStatus = '⚠ enabled but no topic set (run: claude-notify config set channels.ntfy.topic <topic>)'
    } else {
      ntfyStatus = `✓ ${server}/${maskSecret(topic)}`
    }
    console.log(`ntfy:     ${ntfyStatus}`)
    const { enabled: whEnabled, url: whUrl } = config.channels.webhook
    let whStatus: string
    if (!whEnabled) {
      whStatus = '✗ disabled'
    } else if (!whUrl) {
      whStatus = '⚠ enabled but no URL set (run: claude-notify config set channels.webhook.url <url>)'
    } else {
      whStatus = `✓ ${whUrl}`
    }
    console.log(`Webhook:  ${whStatus}`)
  })

// ─── config ─────────────────────────────────────────────────────────────────

const configCmd = program
  .command('config')
  .description('Manage configuration')

configCmd
  .command('show')
  .description('Print current config as JSON')
  .action(() => {
    console.log(JSON.stringify(loadConfig(), null, 2))
  })

configCmd
  .command('set <key> <value>')
  .description('Set a config value (e.g. channels.ntfy.topic my-topic)')
  .action((key: string, value: string) => {
    // Reject empty key segments (e.g. ".foo", "a..b")
    if (!key || key.split('.').some(k => k === '')) {
      console.error(`Error: invalid config key "${key}"`)
      process.exit(1)
    }
    try {
      const config = loadConfig()
      const updated = setConfigValue(config, key, value)
      saveConfig(updated)
      console.log(`✓ ${key} = ${getConfigValue(updated, key)}`)
    } catch (e) {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    }
  })

// ─── send (called by hook) ───────────────────────────────────────────────────

program
  .command('send')
  .description('Send notification (called automatically by Claude Code hook)')
  .action(async () => {
    await send()
  })

// ─── test ────────────────────────────────────────────────────────────────────

program
  .command('test')
  .description('Send a test notification on all enabled channels')
  .action(async () => {
    const config = loadConfig()
    const title = config.message.title
    const body = '3 files edited · 2 commands'

    console.log('Sending test notification...')

    if (config.channels.desktop) {
      sendDesktop(title, body)
      console.log('  ✓ Desktop')
    }

    if (config.channels.ntfy.enabled && config.channels.ntfy.topic) {
      const t = config.channels.ntfy.topic
      try {
        await sendNtfy(config.channels.ntfy.server, config.channels.ntfy.topic, title, body)
        console.log(`  ✓ ntfy (${maskSecret(t)})`)
      } catch (e) {
        console.log(`  ✗ ntfy: ${e instanceof Error ? e.message : 'error'}`)
      }
    }

    if (config.channels.webhook.enabled && config.channels.webhook.url) {
      const wh = config.channels.webhook
      try {
        await sendWebhook(wh.url, wh.method, wh.headers, wh.bodyTemplate, title, body)
        console.log(`  ✓ Webhook (${wh.url})`)
      } catch (e) {
        console.log(`  ✗ Webhook: ${e instanceof Error ? e.message : 'error'}`)
      }
    }

    if (!config.channels.desktop && !config.channels.ntfy.enabled && !config.channels.webhook.enabled) {
      console.log('  No channels enabled. Run: claude-notify config set channels.desktop true')
    }
  })

program.parse()
