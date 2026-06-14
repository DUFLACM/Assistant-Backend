import axios from 'axios'
import xml2js from 'xml2js'
import { db, getMember } from '../data/db.js'
import { signToken } from '../utils/auth.js'
import { verifyPassword } from '../utils/auth.js'
import { badRequest } from '../utils/errors.js'

const CAS_BASE_URL = 'https://cas.dlufl.edu.cn/cas'
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3000'
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

function getServiceUrl() {
  return `${BACKEND_URL}/api/auth/cas/callback`
}

// 从 CAS XML 解析结果中提取用户属性
function extractCasAttributes(success) {
  const casAttrs = success['cas:attributes'] || {}
  const ssoAttrsObj = success['sso:attributes'] || {}

  const ssoAttrs = Array.isArray(ssoAttrsObj['sso:attribute'])
    ? ssoAttrsObj['sso:attribute']
    : ssoAttrsObj['sso:attribute']
      ? [ssoAttrsObj['sso:attribute']]
      : []

  const attrMap = {}

  ssoAttrs.forEach((a) => {
    if (a?.$?.name) {
      attrMap[a.$.name] = a.$.value
    }
  })

  const userSex =
    casAttrs['cas:USER_SEX'] ||
    casAttrs.USER_SEX ||
    attrMap.USER_SEX ||
    attrMap.user_sex ||
    ''

  return {
    user:
      success['sso:user'] ||
      success['cas:user'] ||
      success.user ||
      '',

    name:
      casAttrs['cas:USER_NAME'] ||
      casAttrs.USER_NAME ||
      attrMap.USER_NAME ||
      attrMap.user_name ||
      '',

    unitName:
      casAttrs['cas:UNIT_NAME'] ||
      casAttrs.UNIT_NAME ||
      attrMap.UNIT_NAME ||
      attrMap.unit_name ||
      '',

    unitId:
      casAttrs['cas:UNIT_ID'] ||
      casAttrs.UNIT_ID ||
      attrMap.UNIT_ID ||
      attrMap.unit_id ||
      '',

    userId:
      casAttrs['cas:USER_ID'] ||
      casAttrs.USER_ID ||
      attrMap.USER_ID ||
      attrMap.user_id ||
      '',

    idNumber:
      casAttrs['cas:ID_NUMBER'] ||
      casAttrs.ID_NUMBER ||
      attrMap.ID_NUMBER ||
      attrMap.id_number ||
      '',

    gender:
      String(userSex) === '2'
        ? '女'
        : String(userSex) === '1'
          ? '男'
          : '',
  }
}
// 生成年级（学号前2位 → 如 23 → "2023 级"）
function gradeFromStudentNo(studentNo) {
  const match = String(studentNo).match(/^(\d{2})/)
  return match ? `20${match[1]} 级` : ''
}

// 同步 CAS 信息到 member 表
async function syncMemberFromCas(uid, casInfo) {
  const fields = []
  const values = []

  if (casInfo.name) {
    fields.push('name = ?', 'real_name = ?')
    values.push(casInfo.name, casInfo.name)
  }
  if (casInfo.gender) {
    fields.push('gender = ?')
    values.push(casInfo.gender)
  }
  if (casInfo.unitName) {
    fields.push('major = ?')
    values.push(casInfo.unitName)
  }
  const grade = gradeFromStudentNo(casInfo.user)
  if (grade) {
    fields.push('grade = ?')
    values.push(grade)
  }

  if (fields.length > 0) {
    await db.query(`UPDATE members SET ${fields.join(', ')} WHERE uid = ?`, [...values, uid])
  }
}

/**
 * GET /auth/cas
 * 重定向到 CAS 登录页面
 */
export function casLogin() {
  const serviceUrl = getServiceUrl()
  const loginUrl = `${CAS_BASE_URL}/login?service=${encodeURIComponent(serviceUrl)}`
  return { redirect: loginUrl }
}

/**
 * GET /auth/cas/callback?ticket=ST-xxxx
 * CAS 登录回调，校验 ticket 并创建 JWT
 */
export async function casCallback({ query }) {
  const { ticket } = query

  if (!ticket) {
    return { redirect: `${FRONTEND_URL}/login?error=missing_ticket` }
  }

  const serviceUrl = getServiceUrl()
  const validateUrl = `${CAS_BASE_URL}/serviceValidate?service=${encodeURIComponent(serviceUrl)}&ticket=${encodeURIComponent(ticket)}`

  try {
    const response = await axios.get(validateUrl)
    const xml = response.data
    const result = await xml2js.parseStringPromise(xml, { explicitArray: false })

    const serviceResponse = result['sso:serviceResponse'] || result['cas:serviceResponse'] || result['serviceResponse']

    if (!serviceResponse) {
      console.error('CAS 响应格式异常:', Object.keys(result))
      return { redirect: `${FRONTEND_URL}/login?error=server_error` }
    }

    const authFailure = serviceResponse['sso:authenticationFailure'] || serviceResponse['cas:authenticationFailure'] || serviceResponse['authenticationFailure']
    if (authFailure) {
      const failCode = authFailure.$?.code || 'unknown'
      console.error('CAS 认证失败:', failCode)
      return { redirect: `${FRONTEND_URL}/login?error=cas_auth_failed` }
    }

    const success = serviceResponse['sso:authenticationSuccess'] || serviceResponse['cas:authenticationSuccess'] || serviceResponse['authenticationSuccess']
    if (!success) {
      console.error('CAS 响应无 authenticationSuccess')
      return { redirect: `${FRONTEND_URL}/login?error=cas_auth_failed` }
    }

    const casInfo = extractCasAttributes(success)
    const casUser = casInfo.user

    console.log('CAS 登录用户:', casUser, casInfo.name)
    console.log(serviceResponse, success, casInfo)

    // 在 members 表中查找该学号对应的用户
    const memberRows = await db.query('SELECT * FROM members WHERE student_no = ?', [casUser])
    const member = memberRows[0]

    if (!member) {
      // 新用户：跳转到前端让用户选择注册或绑定已有账号
      // 传递所有 CAS 属性供注册使用
      const params = new URLSearchParams({
        cas_new_user: casUser,
        cas_name: casInfo.name || '',
        cas_unit: casInfo.unitName || '',
        cas_gender: casInfo.gender || '',
        cas_grade: gradeFromStudentNo(casUser),
      })
      return { redirect: `${FRONTEND_URL}/login?${params.toString()}` }
    }

    // 已存在用户：同步 CAS 信息 + 生成 JWT
    await syncMemberFromCas(member.uid, casInfo)
    const token = signToken({
      sub: String(member.uid),
      username: member.student_no,
      isAdmin: Number(member.is_admin) === 1,
      role: member.role || '预备社员',
    })

    return { redirect: `${FRONTEND_URL}/login?cas_token=${token}` }
  } catch (err) {
    console.error('CAS 校验异常:', err)
    return { redirect: `${FRONTEND_URL}/login?error=server_error` }
  }
}

/**
 * POST /api/auth/cas/register
 * CAS 新用户注册：创建 member 记录，返回 JWT
 */
export async function casRegister({ body }) {
  const { studentNo, name, gender, major, grade } = body || {}

  if (!studentNo) {
    throw badRequest('缺少学号')
  }

  // 检查学号是否已被绑定
  const existRows = await db.query('SELECT uid FROM members WHERE student_no = ?', [studentNo])
  if (existRows.length > 0) {
    throw badRequest('该学号已绑定其他用户')
  }

  const result = await db.query(
    `INSERT INTO members (name, real_name, student_no, role, gender, major, grade) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [name || studentNo, name || studentNo, studentNo, '访客', gender || '', major || '', grade || gradeFromStudentNo(studentNo)]
  )

  const memberUid = result.insertId

  const token = signToken({
    sub: String(memberUid),
    username: studentNo,
    isAdmin: false,
  })

  const member = await getMember(memberUid)

  return {
    status: 201,
    data: {
      token,
      user: member,
    },
  }
}

/**
 * POST /api/auth/cas/bind
 * CAS 绑定已有账号：验证账密，更新 member 的 student_no
 */
export async function casBind({ body }) {
  const { studentNo, username, password, name, gender, major, grade } = body || {}

  if (!studentNo || !username || !password) {
    throw badRequest('缺少绑定信息')
  }

  // 检查学号是否已被绑定
  const existRows = await db.query('SELECT uid FROM members WHERE student_no = ?', [studentNo])
  if (existRows.length > 0) {
    throw badRequest('该学号已绑定其他用户')
  }

  // 验证现有账密
  const userRows = await db.query('SELECT * FROM users WHERE username = ?', [username.trim()])
  const user = userRows[0]
  if (!user) {
    throw badRequest('账号不存在')
  }

  if (!verifyPassword(password, user.password_hash, user.password_salt)) {
    throw badRequest('密码错误')
  }

  // 更新 member 的 student_no + CAS 信息
  const sets = ['student_no = ?']
  const vals = [studentNo]
  if (name) { sets.push('name = ?', 'real_name = ?'); vals.push(name, name) }
  if (gender) { sets.push('gender = ?'); vals.push(gender) }
  if (major) { sets.push('major = ?'); vals.push(major) }
  if (grade) { sets.push('grade = ?'); vals.push(grade) }
  vals.push(user.member_uid)
  await db.query(`UPDATE members SET ${sets.join(', ')} WHERE uid = ?`, vals)

  const member = await getMember(user.member_uid)

  const token = signToken({
    sub: String(user.member_uid),
    username: studentNo,
    isAdmin: Number(member.isAdmin) === 1,
    role: member.role || '预备社员',
  })

  return {
    data: {
      token,
      user: member,
    },
  }
}

/**
 * GET /api/me
 * 获取当前登录用户信息
 */
export async function getCurrentUser({ user }) {
  const member = await getMember(user.memberUid)

  return {
    data: {
      memberId: String(member.uid),
      name: member.name,
      studentNo: member.studentNo,
      role: member.role,
      isAdmin: Number(member.isAdmin) === 1,
    },
  }
}
