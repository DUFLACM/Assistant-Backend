import { badRequest } from '../utils/errors.js'
import { verifyPassword, signToken } from '../utils/auth.js'
import { db } from '../data/db.js'

/**
 * POST /api/auth/login
 * Body: { username, password }
 */
export async function login({ body }) {
  const { username, password } = body || {}

  if (!username || !password) {
    throw badRequest('请输入账号和密码')
  }

  const userRows = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()])
  const user = userRows[0]

  if (!user) {
    throw badRequest('账号或密码错误')
  }

  if (!verifyPassword(password, user.password_hash, user.password_salt)) {
    throw badRequest('账号或密码错误')
  }

  // Fetch member info
  const memberRows = await db.query('SELECT * FROM members WHERE uid = ?', [user.member_uid])
  const member = memberRows[0]
  const memberData = member
    ? {
      id: String(member.uid),
      uid: member.uid,
      name: member.name,
      role: member.role,
      isAdmin: Number(member.is_admin) === 1,
    }
    : null

  const token = signToken({
    sub: String(user.member_uid),
    username: user.username,
    isAdmin: memberData?.isAdmin || false,
  })

  return {
    data: {
      token,
      user: {
        memberId: String(user.member_uid),
        username: user.username,
        ...memberData,
      },
    },
  }
}
