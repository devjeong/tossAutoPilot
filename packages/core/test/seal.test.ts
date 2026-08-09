import { describe, expect, it } from 'vitest'
import {
  clientIdHint,
  decryptCredentials,
  encryptCredentials,
  masterKeyFromEnv,
  open,
  seal
} from '../src/index.js'

describe('seal', () => {
  const key = masterKeyFromEnv('a'.repeat(64))

  it('round-trips plaintext', () => {
    const sealed = seal('hello-secret', key)
    expect(open(sealed, key)).toBe('hello-secret')
  })

  it('credentials encrypt/decrypt', () => {
    const master = 'b'.repeat(64)
    const enc = encryptCredentials(
      { clientId: 'c_01HXYZABCDEF', clientSecret: 's_supersecret' },
      master
    )
    expect(enc.clientIdHint).toContain('…')
    expect(enc.clientIdEnc).not.toContain('c_01HXYZABCDEF')
    expect(enc.clientSecretEnc).not.toContain('s_supersecret')
    const dec = decryptCredentials(enc, master)
    expect(dec.clientId).toBe('c_01HXYZABCDEF')
    expect(dec.clientSecret).toBe('s_supersecret')
  })

  it('clientIdHint masks', () => {
    expect(clientIdHint('c_01HXYZABCDEFGH')).toMatch(/…/)
  })
})
