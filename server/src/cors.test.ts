// @vitest-environment node
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.ts'
import { env } from './config/env.ts'
import { JsonStore } from './models/store.ts'

const app = createApp(new JsonStore())

describe('CORS', () => {
  it('answers the preflight for the configured client origin with credentials allowed', async () => {
    const res = await request(app)
      .options('/api/auth/register')
      .set('Origin', env.clientOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .expect(204)
    expect(res.headers['access-control-allow-origin']).toBe(env.clientOrigin)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('adds CORS headers to real responses for that origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', env.clientOrigin).expect(200)
    expect(res.headers['access-control-allow-origin']).toBe(env.clientOrigin)
  })

  it('does not grant access to any other origin', async () => {
    const res = await request(app).get('/api/health').set('Origin', 'https://evil.example').expect(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    const pre = await request(app).options('/api/auth/register').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST')
    expect(pre.headers['access-control-allow-origin']).toBeUndefined()
  })
})
