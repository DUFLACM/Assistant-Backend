import mysql from 'mysql2/promise'
import { createHash } from 'node:crypto'

// MySQL DATETIME format: YYYY-MM-DD HH:MM:SS
function mysqlNow() {
  const d = new Date()
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0')
}

const dbName = process.env.MYSQL_DATABASE || 'dufl_acm'

// 尝试创建数据库（需要 CREATE DATABASE 权限；如果账号没权限则跳过，请确保数据库已手动创建）
try {
  const initConn = await mysql.createConnection({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
  })
  await initConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` DEFAULT CHARACTER SET utf8mb4`)
  await initConn.end()
} catch (err) {
  if (err.code === 'ER_DBACCESS_DENIED_ERROR') {
    console.warn(`[db] 账号无 CREATE DATABASE 权限，跳过自动建库。请确认数据库 \`${dbName}\` 已存在。`)
  } else {
    console.warn('[db] 初始化建库失败:', err.message)
  }
}

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: dbName,
  waitForConnections: true,
  connectionLimit: 10,
})

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params)
  return rows
}

// ==================== Schema ====================

export async function initSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS members (
      uid INT AUTO_INCREMENT PRIMARY KEY,
      legacy_id VARCHAR(50) UNIQUE,
      name VARCHAR(100) NOT NULL,
      real_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      student_no VARCHAR(20) NOT NULL UNIQUE,
      grade VARCHAR(20),
      major VARCHAR(50),
      class_name VARCHAR(50),
      gender VARCHAR(10),
      email VARCHAR(100),
      qq VARCHAR(20),
      role VARCHAR(20) NOT NULL DEFAULT '预备社员',
      activity INT NOT NULL DEFAULT 0,
      accounts_json JSON NOT NULL DEFAULT ('[]'),
      is_admin TINYINT NOT NULL DEFAULT 0,
      avatar_url MEDIUMTEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS point_logs (
      id VARCHAR(36) PRIMARY KEY,
      member_uid INT NOT NULL,
      type VARCHAR(20) NOT NULL,
      source VARCHAR(100) NOT NULL,
      points DECIMAL(10,1) NOT NULL,
      month VARCHAR(7) NOT NULL,
      proof TEXT,
      audit_status VARCHAR(10) NOT NULL DEFAULT '待审核',
      publicity_status VARCHAR(10) NOT NULL DEFAULT '未公示',
      description VARCHAR(300),
      reason VARCHAR(200),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS monthly_points (
      member_uid INT NOT NULL,
      month_index INT NOT NULL CHECK (month_index BETWEEN 0 AND 5),
      points DECIMAL(10,1) NOT NULL DEFAULT 0,
      PRIMARY KEY (member_uid, month_index),
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS activity_tags (
      name VARCHAR(50) PRIMARY KEY,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS point_rules (
      id VARCHAR(36) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(300),
      rule_json JSON NOT NULL,
      enabled TINYINT NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS admin_operation_logs (
      id VARCHAR(36) PRIMARY KEY,
      admin_uid INT NOT NULL,
      admin_name VARCHAR(100),
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50),
      target_id VARCHAR(50),
      detail VARCHAR(300),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS activities (
      id VARCHAR(36) PRIMARY KEY,
      type VARCHAR(20) NOT NULL,
      title VARCHAR(200) NOT NULL,
      time VARCHAR(100) NOT NULL,
      place VARCHAR(200) NOT NULL,
      status VARCHAR(20) NOT NULL,
      points_rule TEXT NOT NULL,
      base_points DECIMAL(10,1) NOT NULL DEFAULT 0,
      material_bonus DECIMAL(10,1) NOT NULL DEFAULT 0,
      valid_submit_bonus DECIMAL(10,1) NOT NULL DEFAULT 0,
      require_valid_submit TINYINT NOT NULL DEFAULT 0,
      require_material TINYINT NOT NULL DEFAULT 0,
      starts_at DATETIME,
      ends_at DATETIME,
      signup_deadline DATETIME,
      max_participants INT DEFAULT 0,
      allow_early_cutoff TINYINT NOT NULL DEFAULT 0,
      description MEDIUMTEXT,
      images_json JSON NOT NULL DEFAULT ('[]'),
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  // 迁移旧 activities 表：补加新列（MySQL 5.7 兼容写法）
  const migrationColumns = [
    { name: 'signup_deadline', def: `signup_deadline DATETIME` },
    { name: 'max_participants', def: `max_participants INT DEFAULT 0` },
    { name: 'allow_early_cutoff', def: `allow_early_cutoff TINYINT NOT NULL DEFAULT 0` },
    { name: 'description', def: `description MEDIUMTEXT` },
    { name: 'images_json', def: `images_json JSON NOT NULL DEFAULT ('[]')` },
  ];
  for (const col of migrationColumns) {
    try {
      const existing = await query(`SHOW COLUMNS FROM activities LIKE ?`, [col.name]);
      if (existing.length === 0) {
        await query(`ALTER TABLE activities ADD COLUMN ${col.def}`);
      }
    } catch { /* ignore */ }

  // point_logs 表补加字段
  const pointLogsMigrations = [
    { name: 'description', def: `description VARCHAR(300)` },
    { name: 'reason', def: `reason VARCHAR(200)` },
  ]
  for (const col of pointLogsMigrations) {
    try {
      const ex = await query(`SHOW COLUMNS FROM point_logs LIKE ?`, [col.name])
      if (ex.length === 0) await query(`ALTER TABLE point_logs ADD COLUMN ${col.def}`)
    } catch { /* ignore */ }
  }

  // Seed default point_rules if empty
  await seedPointRules();
}

  // 迁移旧 members 表：将已有 is_admin=1 的成员的 role 设为 '管理组'
  try {
    await query(`UPDATE members SET role = '管理组' WHERE is_admin = 1 AND role != '管理组'`)
  } catch { /* ignore */ }

  // members 表补加 / 升级 avatar_url 列（MEDIUMTEXT 才能存 data URL）
  try {
    const ex = await query(`SHOW COLUMNS FROM members LIKE ?`, ['avatar_url'])
    if (ex.length === 0) {
      await query(`ALTER TABLE members ADD COLUMN avatar_url MEDIUMTEXT`)
    } else {
      const colType = (ex[0].Type || '').toLowerCase()
      if (colType !== 'mediumtext') {
        await query(`ALTER TABLE members MODIFY COLUMN avatar_url MEDIUMTEXT`)
      }
    }
  } catch { /* ignore */ }

  await query(`
    CREATE TABLE IF NOT EXISTS activity_tag_map (
      activity_id VARCHAR(36) NOT NULL,
      tag_name VARCHAR(50) NOT NULL,
      PRIMARY KEY (activity_id, tag_name),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_name) REFERENCES activity_tags(name) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS activity_signups (
      id VARCHAR(36) PRIMARY KEY,
      activity_id VARCHAR(36) NOT NULL,
      member_uid INT NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE (activity_id, member_uid),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS checkin_records (
      id VARCHAR(36) PRIMARY KEY,
      activity_id VARCHAR(36) NOT NULL,
      member_uid INT NOT NULL,
      mode VARCHAR(20) NOT NULL,
      checked_at DATETIME NOT NULL,
      valid_submit_verified TINYINT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL,
      UNIQUE (activity_id, member_uid),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS activity_leave_requests (
      id VARCHAR(36) PRIMARY KEY,
      activity_id VARCHAR(36) NOT NULL,
      member_uid INT NOT NULL,
      reason TEXT,
      status VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE (activity_id, member_uid),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS activity_material_submissions (
      id VARCHAR(36) PRIMARY KEY,
      activity_id VARCHAR(36) NOT NULL,
      member_uid INT NOT NULL,
      attachment TEXT,
      status VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE (activity_id, member_uid),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS contests (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      level VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL,
      date VARCHAR(100) NOT NULL,
      quota VARCHAR(50) NOT NULL,
      freeze_at VARCHAR(100) NOT NULL,
      signups INT NOT NULL DEFAULT 0,
      rule VARCHAR(200) NOT NULL,
      source VARCHAR(20) NOT NULL DEFAULT 'local'
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS contest_signups (
      id VARCHAR(36) PRIMARY KEY,
      contest_id VARCHAR(36) NOT NULL,
      member_uid INT NOT NULL,
      language VARCHAR(20) NOT NULL,
      obey_team_adjustment TINYINT NOT NULL DEFAULT 0,
      attachments_json JSON NOT NULL DEFAULT ('[]'),
      status VARCHAR(20) NOT NULL,
      created_at DATETIME NOT NULL,
      UNIQUE (contest_id, member_uid),
      FOREIGN KEY (contest_id) REFERENCES contests(id) ON DELETE CASCADE,
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      member_uid INT NOT NULL PRIMARY KEY,
      username VARCHAR(50) NOT NULL UNIQUE,
      password_hash VARCHAR(128) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS platform_accounts (
      member_uid INT NOT NULL,
      platform VARCHAR(20) NOT NULL,
      identifier VARCHAR(100) NOT NULL,
      payload_json JSON NOT NULL DEFAULT ('{}'),
      update_logs_json JSON NOT NULL DEFAULT ('[]'),
      updated_at DATETIME,
      PRIMARY KEY (member_uid, platform),
      FOREIGN KEY (member_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id VARCHAR(36) PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      content TEXT NOT NULL,
      image MEDIUMTEXT,
      publisher_uid INT NOT NULL,
      publisher_name VARCHAR(100) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (publisher_uid) REFERENCES members(uid) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `)
}

// ==================== Seed ====================

export async function seedMembers() {
  const [rows] = await pool.query('SELECT COUNT(*) AS count FROM members')
  if (rows[0].count > 0) return

  const seed = [
    {
      legacyId: 'm-zhangsan', name: '张三', realName: '张三', phone: '13800000001',
      studentNo: '202400001', grade: '2024 级', major: '软件工程', className: '软件工程 2401 班',
      gender: '男', email: 'zhangsan@dufl.edu.cn', qq: '100000001',
      role: '正式社员', activity: 92, isAdmin: 1,
      accounts: JSON.stringify([
        { platform: 'Codeforces', value: 'dufl_zhangsan' },
        { platform: 'AtCoder', value: 'zhangsan_ac' },
        { platform: '牛客', value: '10001' },
      ]),
    },
    {
      legacyId: 'm-lisi', name: '李四', realName: '李四', phone: '13800000002',
      studentNo: '202300002', grade: '2023 级', major: '计算机科学与技术', className: '计科 2301 班',
      gender: '女', email: 'lisi@dufl.edu.cn', qq: '100000002',
      role: '正式社员', activity: 96, isAdmin: 0,
      accounts: JSON.stringify([]),
    },
    {
      legacyId: 'm-wangwu', name: '王五', realName: '王五', phone: '13800000003',
      studentNo: '202300003', grade: '2023 级', major: '软件工程', className: '软件工程 2302 班',
      gender: '男', email: 'wangwu@dufl.edu.cn', qq: '100000003',
      role: '正式社员', activity: 89, isAdmin: 0,
      accounts: JSON.stringify([]),
    },
  ]

  for (const m of seed) {
    await pool.query(
      `INSERT INTO members (legacy_id, name, real_name, phone, student_no, grade, major, class_name, gender, email, qq, role, activity, accounts_json, is_admin)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [m.legacyId, m.name, m.realName, m.phone, m.studentNo, m.grade, m.major, m.className, m.gender, m.email, m.qq, m.role, m.activity, m.accounts, m.isAdmin]
    )
  }
}

// ==================== Member ====================

function serializeMember(row) {
  const email = row.email || '';
  const gravatarUrl = email ? `https://www.gravatar.com/avatar/${createHash('md5').update(email.trim().toLowerCase()).digest('hex')}?s=100&d=identicon` : '';
  return {
    id: String(row.uid),
    uid: row.uid,
    name: row.name,
    realName: row.real_name,
    phone: row.phone,
    studentNo: row.student_no,
    grade: row.grade,
    major: row.major,
    className: row.class_name,
    gender: row.gender,
    email: row.email,
    qq: row.qq,
    role: row.role,
    activity: row.activity,
    gravatarUrl,
    avatarUrl: row.avatar_url || '',
    accounts: typeof row.accounts_json === 'string' ? JSON.parse(row.accounts_json) : (row.accounts_json || []),
    isAdmin: row.is_admin,
    createdAt: row.created_at,
  }
}

export async function getMember(memberId) {
  const rows = await query('SELECT * FROM members WHERE uid = ?', [Number(memberId)])
  return rows[0] ? serializeMember(rows[0]) : null
}

export async function listMembers() {
  const rows = await query('SELECT * FROM members ORDER BY role, uid')
  return rows.map(serializeMember)
}

export async function updateMemberRole(memberUid, role) {
  const isAdmin = role === '管理组' ? 1 : 0
  await query('UPDATE members SET role = ?, is_admin = ? WHERE uid = ?', [role, isAdmin, Number(memberUid)])
  return getMember(memberUid)
}

// ==================== Point Logs ====================

function serializePointLog(row) {
  return {
    id: row.id,
    memberUid: row.member_uid,
    type: row.type,
    source: row.source,
    points: Number(row.points),
    month: row.month,
    proof: row.proof,
    auditStatus: row.audit_status,
    publicityStatus: row.publicity_status,
    description: row.description || '',
    reason: row.reason || '',
    createdAt: row.created_at,
  }
}

export async function listPointLogs(memberId) {
  const rows = await query('SELECT * FROM point_logs WHERE member_uid = ? ORDER BY created_at DESC', [Number(memberId)])
  return rows.map(serializePointLog)
}

export async function addPointLog({ memberUid, type, source, points, description, month }) {
  const id = crypto.randomUUID()
  const monthValue = month || mysqlNowMonth()
  await query(
    `INSERT INTO point_logs (id, member_uid, type, source, points, month, description, audit_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, Number(memberUid), type || '管理员调整', source || '管理员操作', Number(points), monthValue, description || '', '已通过']
  )

  // 同步更新 monthly_points 聚合（当月 index=0）
  const monthIndex = getMonthIndex(monthValue)
  await query(
    `INSERT INTO monthly_points (member_uid, month_index, points) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE points = points + ?`,
    [Number(memberUid), monthIndex, Number(points), Number(points)]
  )

  // 滚动 monthly_points：将 month_index 向前推
  await shiftMonthlyPoints(Number(memberUid))

  return { id }
}

function getMonthIndex(monthStr) {
  // monthStr format: "YYYY-MM"
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  if (monthStr === currentMonth) return 0
  const [y, m] = monthStr.split('-').map(Number)
  const targetDate = new Date(y, m - 1, 1)
  const currentDate = new Date(now.getFullYear(), now.getMonth(), 1)
  const diffMonths = (currentDate.getFullYear() - targetDate.getFullYear()) * 12 + (currentDate.getMonth() - targetDate.getMonth())
  return Math.max(0, Math.min(5, diffMonths))
}

async function shiftMonthlyPoints(memberUid) {
  // 检测当前月份是否变化，如有变化则将 index 0~4 的数据移到 1~5，清空 index 0
  const rows = await query(
    'SELECT month_index, points FROM monthly_points WHERE member_uid = ? ORDER BY month_index',
    [memberUid]
  )
  // 不做自动滚动，由 monthly cron 任务处理；这里只确保当前月有记录
  // 实际上 ON DUPLICATE KEY UPDATE 已经处理了当月累加
}

function mysqlNowMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ==================== Admin Operation Log ====================

export async function addOperationLog({ adminUid, adminName, action, targetType, targetId, detail }) {
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO admin_operation_logs (id, admin_uid, admin_name, action, target_type, target_id, detail) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, Number(adminUid), adminName || '', action, targetType || '', String(targetId || ''), detail || '']
  )
  return { id }
}

export async function listOperationLogs(limit = 100) {
  const rows = await query(
    'SELECT * FROM admin_operation_logs ORDER BY created_at DESC LIMIT ?',
    [Number(limit)]
  )
  return rows.map(r => ({
    id: r.id,
    adminUid: r.admin_uid,
    adminName: r.admin_name,
    action: r.action,
    targetType: r.target_type,
    targetId: r.target_id,
    detail: r.detail || '',
    createdAt: r.created_at,
  }))
}

// ==================== Point Rules ====================

function serializePointRule(row) {
  let ruleJson = {}
  try { ruleJson = typeof row.rule_json === 'string' ? JSON.parse(row.rule_json) : (row.rule_json || {}) } catch { /* */ }
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    ruleJson,
    enabled: Number(row.enabled) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function listPointRules() {
  const rows = await query('SELECT * FROM point_rules ORDER BY created_at ASC')
  return rows.map(serializePointRule)
}

export async function createPointRule({ name, description, ruleJson }) {
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO point_rules (id, name, description, rule_json) VALUES (?, ?, ?, ?)',
    [id, name, JSON.stringify(ruleJson)]
  )
  return getPointRule(id)
}

export async function updatePointRule(id, { name, description, ruleJson, enabled }) {
  const sets = []
  const vals = []
  if (name !== undefined) { sets.push('name = ?'); vals.push(name) }
  if (description !== undefined) { sets.push('description = ?'); vals.push(description) }
  if (ruleJson !== undefined) { sets.push('rule_json = ?'); vals.push(JSON.stringify(ruleJson)) }
  if (enabled !== undefined) { sets.push('enabled = ?'); vals.push(enabled ? 1 : 0) }
  if (sets.length === 0) return getPointRule(id)
  sets.push('updated_at = NOW()')
  vals.push(id)
  await query(`UPDATE point_rules SET ${sets.join(', ')} WHERE id = ?`, vals)
  return getPointRule(id)
}

export async function getPointRule(id) {
  const rows = await query('SELECT * FROM point_rules WHERE id = ?', [id])
  return rows.length > 0 ? serializePointRule(rows[0]) : null
}

export async function deletePointRule(id) {
  await query('DELETE FROM point_rules WHERE id = ?', [id])
}

async function seedPointRules() {
  const existing = await query('SELECT COUNT(*) AS cnt FROM point_rules')
  if (existing[0].cnt > 0) return

  const rules = [
    {
      name: '有效积分滚动权重',
      description: 'E_t = Σ w_k × M_(t-k)，k=0..5。对应 当月/前1月/…/前5月 的衰减系数',
      ruleJson: { w0: 1, w1: 0.85, w2: 0.7, w3: 0.55, w4: 0.4, w5: 0.25, maxMonths: 6, precision: 0.1 },
    },
    {
      name: '低活跃度与清零',
      description: '连续 lowActivityMonths 个月无记录→低活跃度标识；连续 zeroActivityMonths 个月无记录→有效积分清零',
      ruleJson: { lowActivityMonths: 3, zeroActivityMonths: 6 },
    },
    {
      name: '周赛/月赛/训练赛记分',
      description: 'W = B + λ × (4×S + 6×R) + X，上限20分（集训考核25分），远程×0.5',
      ruleJson: {
        basePoints: 2, // B: 线下到场基础分
        basePointsEnhanced: 3, // B: 月赛/集训考核赛
        lambda: 1, // λ: 赛事类别系数
        S_coeff: 4, // S 系数
        R_coeff: 6, // R 系数
        X_top5: 3,
        X_top10: 2,
        X_top30: 1,
        maxScore: 20,
        maxScoreEnhanced: 25,
        remoteMultiplier: 0.5,
        remoteMaxPerMonth: 1,
      },
    },
    {
      name: '正式竞赛记分（附录二）',
      description: '参与分+奖项分，按赛事级别分档',
      ruleJson: {
        levelA_participation: 5, levelA_gold: 20, levelA_silver: 14, levelA_bronze: 9,
        levelB_participation: 3, levelB_gold: 12, levelB_silver: 8,  levelB_bronze: 5,
        levelC_participation: 2, levelC_gold: 7,  levelC_silver: 5,  levelC_bronze: 3,
        levelD_participation: 1, levelD_gold: 4,  levelD_silver: 3,  levelD_bronze: 2,
      },
    },
    {
      name: '讲题/题解积分',
      description: '讲题分 = 难度档位×满意度系数，每题上限见配置。题解固定分值',
      ruleJson: {
        difficulty_easy: 1, difficulty_medium: 2, difficulty_hard: 3,
        satisfaction_coeff: 1, // 满意度系数 0~1
        maxPerContest: 1, // 每场最多1题
        solutionPoints: 2, // 题解固定2分
        solutionMaxPerContest: 2, // 每场题解上限
      },
    },
    {
      name: '出题积分',
      description: '题目被正式采用后计分',
      ruleJson: { pointsPerProblem: 3, maxPerContest: 2 },
    },
    {
      name: '分享与服务积分',
      description: '经验分享、算法专题分享等，与满意度挂钩',
      ruleJson: {
        sharePoints: 3,
        meetingAttendPoints: 1, // 参加成员大会等服务类积分
        monthlyCap: 5, // 服务类月度上限
      },
    },
    {
      name: '扣分标准',
      description: '违规扣分细则',
      ruleJson: {
        absencePenalty: -2, // 无故缺席
        lateLeavePenalty: -1, // 迟到/早退超时
        proxySignPenalty: -3, // 代签/伪造签到
        taskFailPenalty: -2, // 未完成已接受任务
        cheatPenalty: -5, // 作弊追加扣分（本场积分另清零）
        fraudPenalty: -10, // 虚假截图/冒用成绩
      },
    },
  ]

  for (const r of rules) {
    const id = crypto.randomUUID()
    await query(
      'INSERT INTO point_rules (id, name, description, rule_json, enabled) VALUES (?, ?, ?, ?, 1)',
      [id, r.name, r.description, JSON.stringify(r.ruleJson)]
    )
  }
}

// ==================== Monthly Points ====================

export async function getMonthlyPoints(memberId) {
  const rows = await query(
    'SELECT month_index, points FROM monthly_points WHERE member_uid = ? ORDER BY month_index',
    [Number(memberId)]
  )
  const result = Array(6).fill(0)
  for (const row of rows) {
    result[row.month_index] = Number(row.points)
  }
  return result
}

// ==================== Activity ====================

function serializeActivity(row, tags = []) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    time: row.time,
    place: row.place,
    status: row.status,
    pointsRule: row.points_rule,
    basePoints: Number(row.base_points),
    materialBonus: Number(row.material_bonus),
    validSubmitBonus: Number(row.valid_submit_bonus),
    requireValidSubmit: !!row.require_valid_submit,
    requireMaterial: !!row.require_material,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    signupDeadline: row.signup_deadline,
    maxParticipants: row.max_participants || 0,
    allowEarlyCutoff: !!row.allow_early_cutoff,
    description: row.description || '',
    images: typeof row.images_json === 'string' ? JSON.parse(row.images_json) : (row.images_json || []),
    createdAt: row.created_at,
    tags,
  }
}

export async function getActivity(activityId) {
  const rows = await query('SELECT * FROM activities WHERE id = ?', [activityId])
  if (!rows[0]) return null
  const tagRows = await query('SELECT tag_name FROM activity_tag_map WHERE activity_id = ?', [activityId])
  return serializeActivity(rows[0], tagRows.map(t => t.tag_name))
}

export async function getActivityStats(activityId, memberId) {
  const member = memberId ? await getMember(memberId) : null
  let isSigned = false, isCheckedIn = false, leaveRequested = false, materialSubmitted = false

  if (member) {
    const signRows = await query('SELECT 1 FROM activity_signups WHERE activity_id = ? AND member_uid = ?', [activityId, member.uid])
    isSigned = signRows.length > 0
    const checkRows = await query('SELECT 1 FROM checkin_records WHERE activity_id = ? AND member_uid = ?', [activityId, member.uid])
    isCheckedIn = checkRows.length > 0
    const leaveRows = await query('SELECT 1 FROM activity_leave_requests WHERE activity_id = ? AND member_uid = ?', [activityId, member.uid])
    leaveRequested = leaveRows.length > 0
    const matRows = await query('SELECT 1 FROM activity_material_submissions WHERE activity_id = ? AND member_uid = ?', [activityId, member.uid])
    materialSubmitted = matRows.length > 0
  }

  const countRows = await query('SELECT COUNT(*) AS cnt FROM activity_signups WHERE activity_id = ?', [activityId])

  return {
    member,
    isSigned,
    isCheckedIn,
    leaveRequested,
    materialSubmitted,
    signupCount: countRows[0].cnt,
  }
}

export async function listActivities() {
  const rows = await query('SELECT * FROM activities ORDER BY created_at DESC')
  const result = []
  for (const row of rows) {
    const tagRows = await query('SELECT tag_name FROM activity_tag_map WHERE activity_id = ?', [row.id])
    result.push(serializeActivity(row, tagRows.map(t => t.tag_name)))
  }
  return result
}

export async function listActivityTags() {
  const rows = await query('SELECT name FROM activity_tags')
  return rows.map(t => t.name)
}

export async function createActivitySignup(activityId, memberId) {
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO activity_signups (id, activity_id, member_uid, created_at) VALUES (?, ?, ?, ?)',
    [id, activityId, Number(memberId), mysqlNow()]
  )
}

export async function createActivityTag(name) {
  await query('INSERT IGNORE INTO activity_tags (name) VALUES (?)', [name])
  return name
}

export async function createActivity(data) {
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO activities (id, type, title, time, place, status, points_rule, base_points, material_bonus, valid_submit_bonus, require_valid_submit, require_material, starts_at, ends_at, signup_deadline, max_participants, allow_early_cutoff, description, images_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, data.type || '活动', data.title, data.time || '', data.place || '', data.status || '进行中',
      data.pointsRule || '', data.basePoints || 0, data.materialBonus || 0, data.validSubmitBonus || 0,
      data.requireValidSubmit ? 1 : 0, data.requireMaterial ? 1 : 0,
      data.startsAt || null, data.endsAt || null,
      data.signupDeadline || null, data.maxParticipants || 0, data.allowEarlyCutoff ? 1 : 0,
      data.description || '', JSON.stringify(data.images || [])]
  )
  if (data.tags && data.tags.length > 0) {
    for (const tag of data.tags) {
      await query('INSERT IGNORE INTO activity_tags (name) VALUES (?)', [tag])
      await query('INSERT IGNORE INTO activity_tag_map (activity_id, tag_name) VALUES (?, ?)', [id, tag])
    }
  }
  return getActivity(id)
}

export async function checkinRecord(activity, memberId, mode) {
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO checkin_records (id, activity_id, member_uid, mode, checked_at, status) VALUES (?, ?, ?, ?, ?, ?)',
    [id, activity.id, Number(memberId), mode || 'default', mysqlNow(), '已签到']
  )
}

export async function createLeaveRequest(activityId, memberId, reason) {
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO activity_leave_requests (id, activity_id, member_uid, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, activityId, Number(memberId), reason || '', '待审核', mysqlNow()]
  )
}

export async function listActivityLeaveRequests(activityId) {
  const rows = await query(
    `SELECT lr.*, m.real_name AS realName, m.student_no AS studentNo, m.avatar_url AS avatarUrl, m.grade, m.class_name AS className
     FROM activity_leave_requests lr
     JOIN members m ON m.uid = lr.member_uid
     WHERE lr.activity_id = ?
     ORDER BY lr.created_at ASC`,
    [activityId]
  )
  return rows.map(r => ({
    id: r.id,
    activityId: r.activity_id,
    memberUid: r.member_uid,
    reason: r.reason || '',
    status: r.status,
    realName: r.realName,
    studentNo: r.studentNo,
    avatarUrl: r.avatarUrl || '',
    grade: r.grade || '',
    className: r.className || '',
    createdAt: r.created_at,
  }))
}

export async function updateLeaveRequestStatus(leaveId, status) {
  await query('UPDATE activity_leave_requests SET status = ? WHERE id = ?', [status, leaveId])
}

export async function createMaterialSubmission(activityId, memberId, attachment) {
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO activity_material_submissions (id, activity_id, member_uid, attachment, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, activityId, Number(memberId), attachment || '', '已提交', mysqlNow()]
  )
}

export async function updateActivityPointRule(activityId, rule) {
  await query(
    `UPDATE activities SET base_points=?, material_bonus=?, valid_submit_bonus=?,
     require_valid_submit=?, require_material=?, points_rule=? WHERE id=?`,
    [rule.basePoints, rule.materialBonus, rule.validSubmitBonus, rule.requireValidSubmit ? 1 : 0, rule.requireMaterial ? 1 : 0, rule.pointsRule, activityId]
  )
  return getActivity(activityId)
}

export async function deleteActivity(activityId) {
  await query('DELETE FROM activity_signups WHERE activity_id = ?', [activityId])
  await query('DELETE FROM activity_tag_map WHERE activity_id = ?', [activityId])
  await query('DELETE FROM checkin_records WHERE activity_id = ?', [activityId])
  await query('DELETE FROM activity_leave_requests WHERE activity_id = ?', [activityId])
  await query('DELETE FROM activity_material_submissions WHERE activity_id = ?', [activityId])
  await query('DELETE FROM activities WHERE id = ?', [activityId])
}

export async function updateActivity(activityId, data) {
  const fields = []
  const values = []
  if (data.title !== undefined) { fields.push('title = ?'); values.push(data.title) }
  if (data.time !== undefined) { fields.push('time = ?'); values.push(data.time) }
  if (data.place !== undefined) { fields.push('place = ?'); values.push(data.place) }
  if (data.pointsRule !== undefined) { fields.push('points_rule = ?'); values.push(data.pointsRule) }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
  if (data.images !== undefined) { fields.push('images_json = ?'); values.push(JSON.stringify(data.images)) }
  if (fields.length === 0) return getActivity(activityId)
  values.push(activityId)
  await query(`UPDATE activities SET ${fields.join(', ')} WHERE id = ?`, values)
  return getActivity(activityId)
}

// ==================== Admin Checkin ====================

export async function getActivityCheckinDetail(activityId) {
  const rows = await query(`
    SELECT
      m.uid, m.real_name AS realName, m.grade, m.class_name AS className,
      m.avatar_url AS avatarUrl, m.email, m.gender,
      s.created_at AS signupAt,
      c.checked_at AS checkinAt, c.status AS checkinStatus, c.mode AS checkinMode,
      l.status AS leaveStatus
    FROM activity_signups s
    JOIN members m ON m.uid = s.member_uid
    LEFT JOIN checkin_records c ON c.activity_id = s.activity_id AND c.member_uid = s.member_uid
    LEFT JOIN activity_leave_requests l ON l.activity_id = s.activity_id AND l.member_uid = s.member_uid
    WHERE s.activity_id = ?
    ORDER BY s.created_at ASC
  `, [activityId])

  const checkedIn = []
  const notCheckedIn = []
  for (const r of rows) {
    const item = {
      uid: r.uid,
      realName: r.realName,
      grade: r.grade || '',
      className: r.className || '',
      avatarUrl: r.avatarUrl || '',
      email: r.email || '',
      signupAt: r.signupAt,
      checkinAt: r.checkinAt || null,
      checkinMode: r.checkinMode || '',
      isCheckedIn: !!r.checkinAt,
    }
    if (item.isCheckedIn) {
      checkedIn.push(item)
    } else {
      notCheckedIn.push(item)
    }
  }

  return { checkedIn, notCheckedIn, total: rows.length }
}

export async function adminForceAbsence(activityId, memberUid) {
  await query('DELETE FROM checkin_records WHERE activity_id = ? AND member_uid = ?', [activityId, memberUid])
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO activity_leave_requests (id, activity_id, member_uid, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
    [id, activityId, memberUid, '管理员标记缺勤', '已批准', mysqlNow(), '已批准']
  )
  return { success: true }
}

export async function adminProxyCheckin(activityId, memberUid) {
  await query('DELETE FROM activity_leave_requests WHERE activity_id = ? AND member_uid = ?', [activityId, memberUid])
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO checkin_records (id, activity_id, member_uid, mode, checked_at, status) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
    [id, activityId, memberUid, 'proxy', mysqlNow(), '已签到', '已签到']
  )
  return { success: true }
}

export async function endActivityCheckin(activityId) {
  const rows = await query(`
    SELECT s.member_uid
    FROM activity_signups s
    LEFT JOIN checkin_records c ON c.activity_id = s.activity_id AND c.member_uid = s.member_uid
    LEFT JOIN activity_leave_requests l ON l.activity_id = s.activity_id AND l.member_uid = s.member_uid
    WHERE s.activity_id = ? AND c.checked_at IS NULL AND (l.status IS NULL OR l.status != '已批准')
  `, [activityId])

  for (const r of rows) {
    const id = crypto.randomUUID()
    await query(
      'INSERT INTO activity_leave_requests (id, activity_id, member_uid, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE status = ?',
      [id, activityId, r.member_uid, '签到结束未签,系统自动缺勤', '已批准', mysqlNow(), '已批准']
    )
  }

  return { markedAbsent: rows.length }
}

// ==================== Contest ====================

function serializeContest(row) {
  return {
    id: row.id,
    title: row.title,
    level: row.level,
    status: row.status,
    date: row.date,
    quota: row.quota,
    freezeAt: row.freeze_at,
    signups: row.signups,
    rule: row.rule,
    source: row.source,
  }
}

export async function getContest(contestId) {
  const rows = await query('SELECT * FROM contests WHERE id = ?', [contestId])
  return rows[0] ? serializeContest(rows[0]) : null
}

export async function listLocalContests() {
  const rows = await query("SELECT * FROM contests WHERE source = 'local'")
  return rows.map(serializeContest)
}

export async function listContestSignups(contestId) {
  const rows = await query(
    `SELECT cs.*, m.name AS member_name
     FROM contest_signups cs
     JOIN members m ON m.uid = cs.member_uid
     WHERE cs.contest_id = ?`,
    [contestId]
  )
  return rows.map(row => ({
    id: row.id,
    contestId: row.contest_id,
    memberId: String(row.member_uid),
    memberName: row.member_name,
    language: row.language,
    obeyTeamAdjustment: !!row.obey_team_adjustment,
    attachments: typeof row.attachments_json === 'string' ? JSON.parse(row.attachments_json) : (row.attachments_json || []),
    status: row.status,
    createdAt: row.created_at,
  }))
}

export async function createContestSignup(contestId, memberId, body) {
  const id = crypto.randomUUID()
  await query(
    `INSERT INTO contest_signups (id, contest_id, member_uid, language, obey_team_adjustment, attachments_json, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, contestId, Number(memberId), body.language || '', body.obeyTeamAdjustment ? 1 : 0, JSON.stringify(body.attachments || []), '已报名', mysqlNow()]
  )
  return {
    id,
    contestId,
    memberId: String(memberId),
    language: body.language || '',
    obeyTeamAdjustment: body.obeyTeamAdjustment || false,
    attachments: body.attachments || [],
    status: '已报名',
  }
}

// ==================== Platform Account ====================

export async function getPlatformAccount(memberId, platform) {
  const rows = await query('SELECT * FROM platform_accounts WHERE member_uid = ? AND platform = ?', [Number(memberId), platform])
  if (!rows[0]) return null

  const row = rows[0]
  const payload = typeof row.payload_json === 'string' ? JSON.parse(row.payload_json) : (row.payload_json || {})
  const updateLogs = typeof row.update_logs_json === 'string' ? JSON.parse(row.update_logs_json) : (row.update_logs_json || [])

  return {
    memberUid: row.member_uid,
    platform: row.platform,
    handle: payload.handle || row.identifier,
    uid: payload.uid || row.identifier,
    ...payload,
    updateLogs,
    updatedAt: row.updated_at,
  }
}

export async function upsertPlatformAccount(memberId, platform, identifier, payload, updateLogs) {
  const json = JSON.stringify(payload || {})
  const logs = JSON.stringify(updateLogs || [])
  const now = new Date()
  const mysqlNow = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
  await query(
    `INSERT INTO platform_accounts (member_uid, platform, identifier, payload_json, update_logs_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE payload_json = VALUES(payload_json), update_logs_json = VALUES(update_logs_json), updated_at = VALUES(updated_at)`,
    [Number(memberId), platform, identifier, json, logs, mysqlNow]
  )
  return getPlatformAccount(memberId, platform)
}

// ==================== Announcements ====================

export async function listAnnouncements() {
  const rows = await query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 5')
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    content: r.content,
    image: r.image || '',
    publisherUid: r.publisher_uid,
    publisherName: r.publisher_name,
    createdAt: r.created_at,
  }))
}

export async function createAnnouncement({ title, content, image, publisherUid, publisherName }) {
  const id = crypto.randomUUID()
  await query(
    'INSERT INTO announcements (id, title, content, image, publisher_uid, publisher_name) VALUES (?, ?, ?, ?, ?, ?)',
    [id, title, content, image || null, Number(publisherUid), publisherName]
  )
  const rows = await query('SELECT * FROM announcements WHERE id = ?', [id])
  const r = rows[0]
  return { id: r.id, title: r.title, content: r.content, image: r.image || '', publisherUid: r.publisher_uid, publisherName: r.publisher_name, createdAt: r.created_at }
}

// ==================== Direct DB (for auth controllers) ====================

export const db = {
  async query(sql, params = []) {
    return query(sql, params)
  },
}

// Auto-init
// await initSchema()
// await seedMembers()
