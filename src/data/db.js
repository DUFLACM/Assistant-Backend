import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '../../data');
const dbPath = process.env.SQLITE_PATH || join(dataDir, 'dufl-acm.sqlite');

mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(dbPath);

db.exec('PRAGMA foreign_keys = ON');

function nowIso() {
  return new Date().toISOString();
}

function toJson(value) {
  return JSON.stringify(value || []);
}

function fromJson(value, fallback = []) {
  if (!value) return fallback;

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function boolToInt(value) {
  return value ? 1 : 0;
}

function intToBool(value) {
  return Number(value) === 1;
}

function execute(sql, params = []) {
  return db.prepare(sql).run(...params);
}

function one(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function many(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function createSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      uid INTEGER PRIMARY KEY AUTOINCREMENT,
      legacy_id TEXT UNIQUE,
      name TEXT NOT NULL,
      real_name TEXT NOT NULL,
      phone TEXT,
      student_no TEXT NOT NULL UNIQUE CHECK(student_no GLOB '[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
      grade TEXT,
      major TEXT,
      class_name TEXT,
      gender TEXT,
      email TEXT,
      qq TEXT,
      role TEXT NOT NULL DEFAULT '预备社员',
      activity INTEGER NOT NULL DEFAULT 0,
      accounts_json TEXT NOT NULL DEFAULT '[]',
      is_admin INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS point_logs (
      id TEXT PRIMARY KEY,
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      points REAL NOT NULL,
      month TEXT NOT NULL,
      proof TEXT,
      audit_status TEXT NOT NULL DEFAULT '待审核',
      publicity_status TEXT NOT NULL DEFAULT '未公示',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS monthly_points (
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      month_index INTEGER NOT NULL CHECK(month_index BETWEEN 0 AND 5),
      points REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (member_uid, month_index)
    );

    CREATE TABLE IF NOT EXISTS activity_tags (
      name TEXT PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      time TEXT NOT NULL,
      place TEXT NOT NULL,
      status TEXT NOT NULL,
      points_rule TEXT NOT NULL,
      base_points REAL NOT NULL DEFAULT 0,
      material_bonus REAL NOT NULL DEFAULT 0,
      valid_submit_bonus REAL NOT NULL DEFAULT 0,
      require_valid_submit INTEGER NOT NULL DEFAULT 0,
      require_material INTEGER NOT NULL DEFAULT 0,
      starts_at TEXT,
      ends_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS activity_tag_map (
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      tag_name TEXT NOT NULL REFERENCES activity_tags(name) ON DELETE CASCADE,
      PRIMARY KEY (activity_id, tag_name)
    );

    CREATE TABLE IF NOT EXISTS activity_signups (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      UNIQUE (activity_id, member_uid)
    );

    CREATE TABLE IF NOT EXISTS checkin_records (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      mode TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      valid_submit_verified INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL,
      UNIQUE (activity_id, member_uid)
    );

    CREATE TABLE IF NOT EXISTS activity_leave_requests (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      reason TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (activity_id, member_uid)
    );

    CREATE TABLE IF NOT EXISTS activity_material_submissions (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      attachment TEXT,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (activity_id, member_uid)
    );

    CREATE TABLE IF NOT EXISTS contests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      level TEXT NOT NULL,
      status TEXT NOT NULL,
      date TEXT NOT NULL,
      quota TEXT NOT NULL,
      freeze_at TEXT NOT NULL,
      signups INTEGER NOT NULL DEFAULT 0,
      rule TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'local'
    );

    CREATE TABLE IF NOT EXISTS contest_signups (
      id TEXT PRIMARY KEY,
      contest_id TEXT NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      language TEXT NOT NULL,
      obey_team_adjustment INTEGER NOT NULL DEFAULT 0,
      attachments_json TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE (contest_id, member_uid)
    );

    CREATE TABLE IF NOT EXISTS platform_accounts (
      member_uid INTEGER NOT NULL REFERENCES members(uid) ON DELETE CASCADE,
      platform TEXT NOT NULL,
      identifier TEXT NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      update_logs_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT,
      PRIMARY KEY (member_uid, platform)
    );
  `);

  const seq = one("SELECT seq FROM sqlite_sequence WHERE name = 'members'");

  if (!seq || Number(seq.seq) < 10000) {
    execute("INSERT OR REPLACE INTO sqlite_sequence(name, seq) VALUES ('members', 10000)");
  }
}

function seedMembers() {
  const count = one('SELECT COUNT(*) AS count FROM members')?.count || 0;

  if (count > 0) return;

  const insertMember = db.prepare(`
    INSERT INTO members (
      legacy_id, name, real_name, phone, student_no, grade, major, class_name,
      gender, email, qq, role, activity, accounts_json, is_admin
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seed = [
    {
      legacyId: 'm-zhangsan',
      name: '张三',
      realName: '张三',
      phone: '13800000001',
      studentNo: '202400001',
      grade: '2024 级',
      major: '软件工程',
      className: '软件工程 2401 班',
      gender: '男',
      email: 'zhangsan@dufl.edu.cn',
      qq: '100000001',
      role: '正式社员',
      activity: 92,
      isAdmin: true,
      accounts: [
        { platform: 'Codeforces', value: 'dufl_zhangsan' },
        { platform: 'AtCoder', value: 'zhangsan_ac' },
        { platform: '牛客', value: '10001' },
      ],
    },
    {
      legacyId: 'm-lisi',
      name: '李四',
      realName: '李四',
      phone: '13800000002',
      studentNo: '202300002',
      grade: '2023 级',
      major: '计算机科学与技术',
      className: '计科 2301 班',
      gender: '女',
      email: 'lisi@dufl.edu.cn',
      qq: '100000002',
      role: '正式社员',
      activity: 96,
      isAdmin: false,
      accounts: [],
    },
    {
      legacyId: 'm-wangwu',
      name: '王五',
      realName: '王五',
      phone: '13800000003',
      studentNo: '202300003',
      grade: '2023 级',
      major: '软件工程',
      className: '软件工程 2302 班',
      gender: '男',
      email: 'wangwu@dufl.edu.cn',
      qq: '100000003',
      role: '正式社员',
      activity: 89,
      isAdmin: false,
      accounts: [],
    },
  ];

  seed.forEach((member) => {
    insertMember.run(
      member.legacyId,
      member.name,
      member.realName,
      member.phone,
      member.studentNo,
      member.grade,
      member.major,
      member.className,
      member.gender,
      member.email,
      member.qq,
      member.role,
      member.activity,
      toJson(member.accounts),
      boolToInt(member.isAdmin),
    );
  });
}

function seedMonthlyPoints() {
  const count = one('SELECT COUNT(*) AS count FROM monthly_points')?.count || 0;

  if (count > 0) return;

  const pointsByLegacyId = {
    'm-zhangsan': [18, 20, 16, 12, 10, 8],
    'm-lisi': [24, 22, 20, 18, 16, 14],
    'm-wangwu': [22, 20, 18, 16, 12, 10],
  };
  const insert = db.prepare('INSERT INTO monthly_points(member_uid, month_index, points) VALUES (?, ?, ?)');

  Object.entries(pointsByLegacyId).forEach(([legacyId, points]) => {
    const member = getMember(legacyId);

    points.forEach((value, index) => insert.run(member.uid, index, value));
  });
}

function seedPointLogs() {
  const count = one('SELECT COUNT(*) AS count FROM point_logs')?.count || 0;

  if (count > 0) return;

  const member = getMember('m-zhangsan');
  const insert = db.prepare(`
    INSERT INTO point_logs(id, member_uid, type, source, points, month, proof, audit_status, publicity_status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  [
    ['pl-001', '周赛', 'Codeforces Round', 8.4, '2026-05', '榜单导入', '通过', '未公示'],
    ['pl-002', '活动', '成员大会签到', 2.0, '2026-05', '现场签到', '通过', '未公示'],
    ['pl-003', '题解', '最短路题解审核通过', 4.0, '2026-05', '题解链接', '通过', '未公示'],
    ['pl-004', '讲题', '图论复盘讲题', 3.6, '2026-05', '讲题记录', '通过', '未公示'],
  ].forEach((log) => insert.run(log[0], member.uid, log[1], log[2], log[3], log[4], log[5], log[6], log[7]));
}

function seedActivities() {
  const count = one('SELECT COUNT(*) AS count FROM activities')?.count || 0;

  if (count > 0) return;

  ['集训', '分享'].forEach((tag) => createActivityTag(tag));

  const insert = db.prepare(`
    INSERT INTO activities (
      id, type, title, time, place, status, points_rule, base_points, material_bonus,
      valid_submit_bonus, require_valid_submit, require_material, starts_at, ends_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  [
    {
      id: 'act-training-dp',
      type: '集训',
      tags: ['集训'],
      title: '暑期 DP 专项训练',
      time: '6 月 15 日 19:30 - 21:30',
      place: '软件学院机房',
      status: '报名中',
      pointsRule: '签到 +2，有效提交 +3，材料 +1',
      basePoints: 2,
      materialBonus: 1,
      validSubmitBonus: 3,
      requireValidSubmit: true,
      requireMaterial: true,
      startsAt: '2026-06-15T19:30:00+08:00',
      endsAt: '2026-06-15T21:30:00+08:00',
    },
    {
      id: 'act-share-graph',
      type: '分享',
      tags: ['分享'],
      title: '图论最短路经验分享',
      time: '6 月 12 日 15:00 - 16:30',
      place: '线上会议室',
      status: '报名中',
      pointsRule: '参与分享 +2',
      basePoints: 2,
      materialBonus: 0,
      validSubmitBonus: 0,
      requireValidSubmit: false,
      requireMaterial: false,
      startsAt: '2026-06-12T15:00:00+08:00',
      endsAt: '2026-06-12T16:30:00+08:00',
    },
    {
      id: 'act-cf-1000',
      type: '周赛',
      tags: ['集训'],
      title: 'Codeforces Round 1000',
      time: '5 月 25 日 19:30 - 21:30',
      place: '训练室 A',
      status: '已结束',
      pointsRule: '基础 +1，有效提交 +4',
      basePoints: 1,
      materialBonus: 0,
      validSubmitBonus: 4,
      requireValidSubmit: true,
      requireMaterial: false,
      startsAt: '2026-05-25T19:30:00+08:00',
      endsAt: '2026-05-25T21:30:00+08:00',
    },
  ].forEach((activity) => {
    insert.run(
      activity.id,
      activity.type,
      activity.title,
      activity.time,
      activity.place,
      activity.status,
      activity.pointsRule,
      activity.basePoints,
      activity.materialBonus,
      activity.validSubmitBonus,
      boolToInt(activity.requireValidSubmit),
      boolToInt(activity.requireMaterial),
      activity.startsAt,
      activity.endsAt,
    );
    activity.tags.forEach((tag) => addActivityTag(activity.id, tag));
  });
}

function seedContests() {
  const count = one('SELECT COUNT(*) AS count FROM contests')?.count || 0;

  if (count > 0) return;

  const insert = db.prepare(`
    INSERT INTO contests(id, title, level, status, date, quota, freeze_at, signups, rule)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  [
    ['contest-icpc-online', 'ICPC 网络预选赛', '校级统管赛事', '报名中', '2026-09', '待定', '报名截止前一日 22:00', 23, '有效积分排序 + 专项选拔'],
    ['contest-ccpc-girls', 'CCPC 女生专场', '校级统管赛事', '资格审核', '2026-08', '3 队', '报名截止前一日 22:00', 9, '有效积分 + 专项选拔'],
    ['contest-lanqiao', '蓝桥杯校内报名', '校内统一报名', '材料补交', '2026-10', '不限', '不冻结积分', 36, '后台审核报名材料'],
  ].forEach((contest) => insert.run(...contest));
}

function seedData() {
  seedMembers();
  seedMonthlyPoints();
  seedPointLogs();
  seedActivities();
  seedContests();
}

function migrateSeedData() {
  execute(
    `UPDATE activities
     SET time = ?, starts_at = ?, ends_at = ?
     WHERE id = ? AND starts_at = ?`,
    ['6 月 15 日 19:30 - 21:30', '2026-06-15T19:30:00+08:00', '2026-06-15T21:30:00+08:00', 'act-training-dp', '2026-06-05T19:30:00+08:00'],
  );
  execute(
    `UPDATE activities
     SET time = ?, starts_at = ?, ends_at = ?
     WHERE id = ? AND starts_at = ?`,
    ['6 月 12 日 15:00 - 16:30', '2026-06-12T15:00:00+08:00', '2026-06-12T16:30:00+08:00', 'act-share-graph', '2026-06-02T15:00:00+08:00'],
  );
}

export function initDatabase() {
  createSchema();
  seedData();
  migrateSeedData();
}

function mapMember(row) {
  if (!row) return null;

  return {
    id: String(row.uid),
    uid: row.uid,
    legacyId: row.legacy_id,
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
    accounts: fromJson(row.accounts_json),
    isAdmin: intToBool(row.is_admin),
  };
}

export function getMember(identifier) {
  const value = String(identifier || '').trim();

  if (!value) return null;

  const row = /^\d+$/.test(value)
    ? one('SELECT * FROM members WHERE uid = ? OR student_no = ?', [Number(value), value])
    : one('SELECT * FROM members WHERE legacy_id = ?', [value]);

  return mapMember(row);
}

export function listMembers() {
  return many('SELECT * FROM members ORDER BY uid ASC').map(mapMember);
}

export function listActivityTags() {
  return many('SELECT name FROM activity_tags ORDER BY created_at ASC, name ASC').map((row) => row.name);
}

export function createActivityTag(name) {
  execute('INSERT OR IGNORE INTO activity_tags(name) VALUES (?)', [name]);

  return listActivityTags();
}

function addActivityTag(activityId, tagName) {
  createActivityTag(tagName);
  execute('INSERT OR IGNORE INTO activity_tag_map(activity_id, tag_name) VALUES (?, ?)', [activityId, tagName]);
}

function getTagsForActivity(activityId) {
  return many('SELECT tag_name FROM activity_tag_map WHERE activity_id = ? ORDER BY tag_name ASC', [activityId])
    .map((row) => row.tag_name);
}

function mapActivity(row) {
  if (!row) return null;

  return {
    id: row.id,
    type: row.type,
    tags: getTagsForActivity(row.id),
    title: row.title,
    time: row.time,
    place: row.place,
    status: row.status,
    pointsRule: row.points_rule,
    pointRule: {
      basePoints: Number(row.base_points),
      materialBonus: Number(row.material_bonus),
      validSubmitBonus: Number(row.valid_submit_bonus),
      requireValidSubmit: intToBool(row.require_valid_submit),
      requireMaterial: intToBool(row.require_material),
    },
    requireValidSubmit: intToBool(row.require_valid_submit),
    requireMaterial: intToBool(row.require_material),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

export function getActivity(activityId) {
  return mapActivity(one('SELECT * FROM activities WHERE id = ?', [activityId]));
}

export function listActivities() {
  return many('SELECT * FROM activities ORDER BY starts_at DESC, created_at DESC').map(mapActivity);
}

export function updateActivityPointRule(activityId, rule) {
  execute(
    `UPDATE activities
     SET points_rule = ?,
         base_points = ?,
         material_bonus = ?,
         valid_submit_bonus = ?,
         require_valid_submit = ?,
         require_material = ?
     WHERE id = ?`,
    [
      rule.pointsRule,
      rule.basePoints,
      rule.materialBonus,
      rule.validSubmitBonus,
      boolToInt(rule.requireValidSubmit),
      boolToInt(rule.requireMaterial),
      activityId,
    ],
  );

  return getActivity(activityId);
}

export function getActivityStats(activityId, memberIdentifier) {
  const member = getMember(memberIdentifier);
  const memberUid = member?.uid || null;
  const scalar = (sql, params = []) => one(sql, params)?.value || 0;

  return {
    member,
    isSigned: memberUid
      ? Boolean(one('SELECT 1 AS value FROM activity_signups WHERE activity_id = ? AND member_uid = ?', [activityId, memberUid]))
      : false,
    isCheckedIn: memberUid
      ? Boolean(one('SELECT 1 AS value FROM checkin_records WHERE activity_id = ? AND member_uid = ?', [activityId, memberUid]))
      : false,
    leaveRequested: memberUid
      ? Boolean(one('SELECT 1 AS value FROM activity_leave_requests WHERE activity_id = ? AND member_uid = ?', [activityId, memberUid]))
      : false,
    materialSubmitted: memberUid
      ? Boolean(one('SELECT 1 AS value FROM activity_material_submissions WHERE activity_id = ? AND member_uid = ?', [activityId, memberUid]))
      : false,
    signupCount: scalar('SELECT COUNT(*) AS value FROM activity_signups WHERE activity_id = ?', [activityId]),
  };
}

export function createActivitySignup(activityId, memberIdentifier) {
  const member = getMember(memberIdentifier);

  execute(
    'INSERT OR IGNORE INTO activity_signups(id, activity_id, member_uid, created_at) VALUES (?, ?, ?, ?)',
    [randomUUID(), activityId, member.uid, nowIso()],
  );

  return member;
}

export function createCheckinRecord(activity, memberIdentifier, mode = 'dynamic-code') {
  const member = getMember(memberIdentifier);

  execute(
    `INSERT OR IGNORE INTO checkin_records(
       id, activity_id, member_uid, mode, checked_at, valid_submit_verified, status
     )
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      activity.id,
      member.uid,
      mode,
      nowIso(),
      0,
      activity.requireValidSubmit ? '待有效提交核验' : '签到成功',
    ],
  );

  return member;
}

export function createLeaveRequest(activityId, memberIdentifier, reason = '') {
  const member = getMember(memberIdentifier);

  execute(
    `INSERT OR IGNORE INTO activity_leave_requests(id, activity_id, member_uid, reason, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), activityId, member.uid, reason, '待审核', nowIso()],
  );

  return member;
}

export function createMaterialSubmission(activityId, memberIdentifier, attachment = '') {
  const member = getMember(memberIdentifier);

  execute(
    `INSERT OR IGNORE INTO activity_material_submissions(id, activity_id, member_uid, attachment, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [randomUUID(), activityId, member.uid, attachment, '待审核', nowIso()],
  );

  return member;
}

export function getMonthlyPoints(memberIdentifier) {
  const member = getMember(memberIdentifier);

  if (!member) return [];

  const points = [0, 0, 0, 0, 0, 0];

  many('SELECT month_index, points FROM monthly_points WHERE member_uid = ? ORDER BY month_index ASC', [member.uid])
    .forEach((row) => {
      points[row.month_index] = Number(row.points);
    });

  return points;
}

export function listPointLogs(memberIdentifier) {
  const member = getMember(memberIdentifier);

  if (!member) return [];

  return many('SELECT * FROM point_logs WHERE member_uid = ? ORDER BY created_at DESC, id DESC', [member.uid]).map((row) => ({
    id: row.id,
    memberId: String(row.member_uid),
    type: row.type,
    source: row.source,
    points: row.points,
    month: row.month,
    proof: row.proof,
    auditStatus: row.audit_status,
    publicityStatus: row.publicity_status,
  }));
}

function mapContest(row) {
  if (!row) return null;

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
  };
}

export function getContest(contestId) {
  return mapContest(one('SELECT * FROM contests WHERE id = ?', [contestId]));
}

export function listLocalContests() {
  return many('SELECT * FROM contests ORDER BY date ASC').map(mapContest);
}

export function listContestSignups(contestId) {
  return many('SELECT * FROM contest_signups WHERE contest_id = ?', [contestId]).map((row) => ({
    id: row.id,
    contestId: row.contest_id,
    memberId: String(row.member_uid),
    language: row.language,
    obeyTeamAdjustment: intToBool(row.obey_team_adjustment),
    attachments: fromJson(row.attachments_json),
    status: row.status,
    createdAt: row.created_at,
  }));
}

export function createContestSignup(contestId, memberIdentifier, payload = {}) {
  const member = getMember(memberIdentifier);

  execute(
    `INSERT OR IGNORE INTO contest_signups(
       id, contest_id, member_uid, language, obey_team_adjustment, attachments_json, status, created_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      randomUUID(),
      contestId,
      member.uid,
      payload.language || 'C++',
      boolToInt(payload.obeyTeamAdjustment),
      toJson(payload.attachments),
      '待审核',
      nowIso(),
    ],
  );

  return listContestSignups(contestId).find((item) => item.memberId === String(member.uid));
}

export function getPlatformAccount(memberIdentifier, platform) {
  const member = getMember(memberIdentifier);

  if (!member) return null;

  const row = one('SELECT * FROM platform_accounts WHERE member_uid = ? AND platform = ?', [member.uid, platform]);

  if (!row) return null;

  return {
    ...fromJson(row.payload_json, {}),
    memberId: String(row.member_uid),
    platform: row.platform,
    identifier: row.identifier,
    updatedAt: row.updated_at,
    updateLogs: fromJson(row.update_logs_json),
  };
}

export function upsertPlatformAccount(memberIdentifier, platform, identifier, payload, updateLogs) {
  const member = getMember(memberIdentifier);
  const updatedAt = payload.updatedAt || nowIso();

  execute(
    `INSERT INTO platform_accounts(
       member_uid, platform, identifier, payload_json, update_logs_json, updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(member_uid, platform) DO UPDATE SET
       identifier = excluded.identifier,
       payload_json = excluded.payload_json,
       update_logs_json = excluded.update_logs_json,
       updated_at = excluded.updated_at`,
    [member.uid, platform, identifier, JSON.stringify(payload), toJson(updateLogs), updatedAt],
  );

  return getPlatformAccount(member.uid, platform);
}

initDatabase();
