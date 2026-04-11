import { test } from 'node:test'
import assert from 'node:assert/strict'
import { worktreeIp } from '../dist/ip.js'

test('same path always returns the same IP', () => {
  const ip = worktreeIp('/home/user/projects/myapp')
  assert.equal(ip, worktreeIp('/home/user/projects/myapp'))
})

test('different paths return different IPs', () => {
  const a = worktreeIp('/home/user/projects/app-main')
  const b = worktreeIp('/home/user/projects/app-feat-auth')
  assert.notEqual(a, b)
})

test('IP is always in 127.x.x.x format', () => {
  const paths = [
    '/home/user/a',
    '/home/user/b',
    '/tmp/project',
    '/very/deeply/nested/project/path',
  ]
  for (const p of paths) {
    const ip = worktreeIp(p)
    assert.match(ip, /^127\.\d+\.\d+\.\d+$/, `Bad IP for ${p}: ${ip}`)
  }
})

test('second octet is never 0 (avoids 127.0.x.x)', () => {
  // Run many paths — none should land on 127.0.x.x
  for (let i = 0; i < 1000; i++) {
    const ip = worktreeIp(`/home/user/project-${i}`)
    const second = Number(ip.split('.')[1])
    assert.ok(second >= 1, `Second octet was 0 for path index ${i}: ${ip}`)
  }
})

test('last octet is never 0 or 255', () => {
  for (let i = 0; i < 1000; i++) {
    const ip = worktreeIp(`/some/path/${i}`)
    const last = Number(ip.split('.')[3])
    assert.ok(last >= 1 && last <= 254, `Last octet out of range for index ${i}: ${ip}`)
  }
})
