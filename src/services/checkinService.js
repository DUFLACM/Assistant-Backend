import crypto from 'crypto'

const SECRET = process.env.CHECKIN_SECRET || 'duflacm-checkin-2024'

/**
 * 生成 TOTP 签到码
 * QR 码：15 秒刷新，数字码：10 秒刷新
 * 码本身带容差窗口（允许前后一个周期）
 */
export function generateCheckinCode(activityId, intervalSeconds = 10) {
  const counter = Math.floor(Date.now() / 1000 / intervalSeconds)
  const hmac = crypto.createHmac('sha256', SECRET)
  const digest = hmac.update(`${activityId}:${counter}`).digest('hex')
  const code = String(parseInt(digest.slice(0, 8), 16) % 1000000).padStart(6, '0')
  return code
}

export function verifyCheckinCode(activityId, code, intervalSeconds = 10) {
  const counter = Math.floor(Date.now() / 1000 / intervalSeconds)
  for (let offset = -1; offset <= 1; offset++) {
    const hmac = crypto.createHmac('sha256', SECRET)
    const digest = hmac.update(`${activityId}:${counter + offset}`).digest('hex')
    const expected = String(parseInt(digest.slice(0, 8), 16) % 1000000).padStart(6, '0')
    if (expected === String(code)) return true
  }
  return false
}

export function getCheckinInfo(activityId) {
  const qrCode = generateCheckinCode(activityId, 15)
  const numCode = generateCheckinCode(activityId, 10)
  const baseUrl = process.env.FRONTEND_URL || 'https://dufl.acm.cn'
  const qrPayload = `${baseUrl}/checkin?code=${qrCode}&activityId=${activityId}`
  return { qrPayload, qrCode, numCode }
}
