import { db, listPointLogs, addPointLog, listPointRules, createPointRule, updatePointRule, deletePointRule, addOperationLog, listOperationLogs } from '../data/db.js';
import { buildRanking, getMemberPointSummary } from '../services/pointsService.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';

function logOp(ctx, action, targetType, targetId, detail) {
  addOperationLog({
    adminUid: ctx.user.memberUid,
    adminName: ctx.user.name || '',
    action,
    targetType,
    targetId,
    detail,
  }).catch(() => {})
}

/**
 * GET /api/admin/points — 排名 + 审核列表 + 规则
 */
export async function listPendingPoints(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const ranking = await buildRanking();
  const rules = await listPointRules();

  // All point logs with pending audit_status
  const rows = await db.query(
    `SELECT pl.*, m.name AS member_name, m.student_no
     FROM point_logs pl
     JOIN members m ON m.uid = pl.member_uid
     WHERE pl.audit_status = '待审核'
     ORDER BY pl.created_at DESC`
  );

  const list = rows.map(r => ({
    id: r.id,
    memberUid: r.member_uid,
    memberName: r.member_name,
    studentNo: r.student_no,
    type: r.type,
    source: r.source,
    points: Number(r.points),
    month: r.month,
    proof: r.proof || '',
    description: r.description || '',
    auditStatus: r.audit_status,
    createdAt: r.created_at,
  }));

  return { data: { list, ranking, rules } };
}

/**
 * GET /api/admin/points/ranking?search=xxx — 搜索排名
 */
export async function searchRanking(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const search = (ctx.query?.search || '').trim().toLowerCase();
  let ranking = await buildRanking();

  if (search) {
    ranking = ranking.filter(r =>
      (r.name || '').toLowerCase().includes(search) ||
      String(r.studentNo || '').includes(search)
    );
  }

  return { data: { ranking } };
}

/**
 * POST /api/admin/points/add — 管理员手动增减积分
 * body: { memberUid, points, description }
 */
export async function manualAddPoints(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const { memberUid, points, description } = ctx.body || {};
  if (!memberUid) throw badRequest('请选择成员');
  if (points === undefined || points === null || Number(points) === 0) throw badRequest('积分值不能为 0');
  if (!description || !String(description).trim()) throw badRequest('请填写原因');

  await addPointLog({
    memberUid: Number(memberUid),
    points: Number(points),
    description: String(description).trim(),
    type: Number(points) > 0 ? '管理员加分' : '管理员扣分',
    source: '管理员手动调整',
  });

  logOp(ctx, Number(points) > 0 ? '管理员加分' : '管理员扣分', 'member', String(memberUid), `${Number(points) > 0 ? '+' : ''}${points}分 · ${description}`)
  return { data: { message: Number(points) > 0 ? `已增加 ${points} 分` : `已扣除 ${Math.abs(points)} 分` } };
}

/**
 * GET /api/admin/points/member/:memberUid/logs — 某成员的积分流水
 */
export async function getMemberPointLogs(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const logs = await listPointLogs(Number(ctx.params.memberUid));
  const summary = await getMemberPointSummary(Number(ctx.params.memberUid));

  return { data: { logs, summary } };
}

// ==================== Rules CRUD ====================

/**
 * POST /api/admin/points/rules
 */
export async function addRule(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const { name, description, ruleJson } = ctx.body || {};
  if (!name) throw badRequest('请填写规则名称');

  const rule = await createPointRule({ name, description, ruleJson: ruleJson || {} });
  return { message: '规则已添加', data: { rule } };
}

/**
 * PUT /api/admin/points/rules/:id
 */
export async function editRule(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const { name, description, ruleJson, enabled } = ctx.body || {};
  const rule = await updatePointRule(ctx.params.id, { name, description, ruleJson, enabled });
  if (!rule) throw notFound('规则不存在');

  return { message: '规则已更新', data: { rule } };
}

/**
 * DELETE /api/admin/points/rules/:id
 */
export async function removeRule(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');
  await deletePointRule(ctx.params.id);
  return { message: '规则已删除', data: {} };
}

/**
 * POST /api/admin/points/:id/approve
 */
export async function approvePoint(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const { id } = ctx.params;
  await db.query('UPDATE point_logs SET audit_status = ? WHERE id = ?', ['已通过', id]);
  logOp(ctx, '审核通过', 'point_log', id)
  return { message: '已通过', data: { id } };
}

/**
 * POST /api/admin/points/:id/reject
 */
export async function rejectPoint(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const { id } = ctx.params;
  await db.query('UPDATE point_logs SET audit_status = ? WHERE id = ?', ['已拒绝', id]);
  logOp(ctx, '审核拒绝', 'point_log', id)
  return { message: '已拒绝', data: { id } };
}

/**
 * GET /api/admin/operation-logs — 操作日志
 */
export async function getOperationLogs(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');
  const limit = Number(ctx.query?.limit) || 100;
  const logs = await listOperationLogs(limit);
  return { data: { logs } };
}
