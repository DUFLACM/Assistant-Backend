import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const JWT_SECRET = process.env.JWT_SECRET || 'dufl-acm-secret-change-in-production'
const TOKEN_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

function base64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function utf8Encode(str) {
  return new TextEncoder().encode(str)
}

function utf8Decode(buf) {
  return new TextDecoder().decode(buf)
}

/**
 * Create a signed JWT token
 */
export function signToken(payload) {
  const header = { alg: 'HS256', typ: 'JWT' }

  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + Math.floor(TOKEN_EXPIRY_MS / 1000)
  const fullPayload = { ...payload, iat, exp }

  const headerEnc = base64url(utf8Encode(JSON.stringify(header)))
  const payloadEnc = base64url(utf8Encode(JSON.stringify(fullPayload)))

  const data = `${headerEnc}.${payloadEnc}`

  const hmac = createHmac('sha256', JWT_SECRET)
  hmac.update(data)
  const signature = base64url(hmac.digest())

  return `${data}.${signature}`
}

/**
 * Verify and decode a JWT token. Returns null if invalid/expired.
 */
export function verifyToken(token) {
  if (!token) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null

  const [headerEnc, payloadEnc, sig] = parts

  const data = `${headerEnc}.${payloadEnc}`

  const hmac = createHmac('sha256', JWT_SECRET)
  hmac.update(data)
  const expected = base64url(hmac.digest())

  // Constant-time comparison
  const sigBuf = Buffer.from(sig, 'base64url')
  const expBuf = Buffer.from(expected, 'base64url')

  if (sigBuf.length !== expBuf.length) return null

  if (!timingSafeEqual(sigBuf, expBuf)) return null

  let payload
  try {
    const json = utf8Decode(Buffer.from(payloadEnc, 'base64url'))
    payload = JSON.parse(json)
  } catch {
    return null
  }

  // Check expiry
  if (payload.exp && payload.exp * 1000 < Date.now()) return null

  return payload
}

/**
 * Hash password with SHA-256 + salt.
 * In production use bcryptjs, but we keep zero npm deps for this backend.
 */
export function hashPassword(password, salt) {
  const s = salt || randomBytes(16).toString('hex')
  const hmac = createHmac('sha256', s)
  hmac.update(password)
  return { hash: hmac.digest('hex'), salt: s }
}

export function verifyPassword(password, storedHash, storedSalt) {
  const { hash } = hashPassword(password, storedSalt)
  return hash === storedHash
}

/**
 * Extract Bearer token from Authorization header
 */
export function extractToken(headers) {
  const auth = headers?.authorization || headers?.Authorization || ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : null
}
