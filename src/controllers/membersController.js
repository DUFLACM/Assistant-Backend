import { listMembers, updateMemberRole, getMember } from '../data/db.js';
import { getMemberPointSummary } from '../services/pointsService.js';
import { getPlatformAccount } from '../data/db.js';
import { forbidden, notFound } from '../utils/errors.js';

/**
 * GET /api/admin/members
 * 管理员查看所有成员，按 role 分组：普通访客、预备社员、正式社员、管理组
 */
export async function listAllMembers(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const all = await listMembers();
  const groups = { '管理组': [], '正式社员': [], '预备社员': [], '普通访客': [] };

  for (const m of all) {
    const role = m.role || '预备社员';
    if (groups[role]) {
      groups[role].push(m);
    } else {
      groups['预备社员'].push(m);
    }
  }

  return { data: { groups } };
}

/**
 * GET /api/admin/members/:uid
 * 管理员查看成员详细信息
 */
export async function getMemberDetail(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const member = await getMember(ctx.params.uid);
  if (!member) throw notFound('成员不存在');

  const summary = await getMemberPointSummary(ctx.params.uid);
  const cf = await getPlatformAccount(ctx.params.uid, 'codeforces');
  const nc = await getPlatformAccount(ctx.params.uid, 'nowcoder');

  return {
    data: {
      ...member,
      effectivePoints: summary.effectivePoints,
      codeforcesHandle: cf?.identifier || '',
      nowcoderUid: nc?.identifier || '',
    },
  };
}

/**
 * PUT /api/admin/members/:uid/role
 * 管理员修改成员角色
 */
export async function changeMemberRole(ctx) {
  if (!ctx.user.isAdmin) throw forbidden('仅管理员可访问');

  const { role } = ctx.body || {};
  if (!role || !['普通访客', '预备社员', '正式社员', '管理组'].includes(role)) {
    throw { status: 400, code: 'BAD_REQUEST', message: '无效的角色' };
  }

  const member = await updateMemberRole(ctx.params.uid, role);
  return { message: '角色已更新', data: member };
}
