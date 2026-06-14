import {
  createActivitySignup,
  createActivityTag as saveActivityTag,
  createActivity as saveActivity,
  deleteActivity,
  updateActivity,
  checkinRecord,
  createLeaveRequest,
  createMaterialSubmission,
  getActivity,
  getActivityCheckinDetail,
  getActivityStats,
  listActivities as getActivities,
  listActivityTags as getActivityTags,
  updateActivityPointRule,
  adminForceAbsence,
  adminProxyCheckin,
  endActivityCheckin,
} from '../data/db.js';
import { badRequest, forbidden, notFound } from '../utils/errors.js';
import { getCheckinInfo, verifyCheckinCode, generateCheckinCode } from '../services/checkinService.js';

function isEnded(activity, now = Date.now()) {
  return activity.endsAt ? new Date(activity.endsAt).getTime() <= now : false;
}

function buildActions({ activity, isSigned, isCheckedIn, leaveRequested, materialSubmitted }) {
  const ended = isEnded(activity);

  if (!isSigned && !ended) {
    return [{ key: 'signup', label: '报名', theme: 'primary' }];
  }

  if (!isSigned && ended) {
    return [{ key: 'ended', label: '已结束', disabled: true }];
  }

  if (leaveRequested) {
    return [{ key: 'leaveRequested', label: '已请假', disabled: true }];
  }

  if (!isCheckedIn && !ended) {
    return [
      { key: 'checkin', label: '现场签到', theme: 'primary' },
      { key: 'leave', label: '请假', theme: 'secondary' },
    ];
  }

  if (activity.requireMaterial && !materialSubmitted) {
    return [{ key: 'material', label: '提交材料', theme: 'primary' }];
  }

  if (isCheckedIn) {
    return [{ key: activity.requireMaterial ? 'materialDone' : 'checked', label: activity.requireMaterial ? '已提交' : '已签到', disabled: true }];
  }

  return [{ key: 'ended', label: '已结束', disabled: true }];
}

async function serializeActivity(activity, memberId) {
  const stats = await getActivityStats(activity.id, memberId);
  return {
    ...activity,
    isEnded: isEnded(activity),
    isSigned: stats.isSigned,
    isCheckedIn: stats.isCheckedIn,
    leaveRequested: stats.leaveRequested,
    materialSubmitted: stats.materialSubmitted,
    signupCount: stats.signupCount,
    actions: buildActions({ activity, ...stats }),
  };
}

export async function listActivities(ctx) {
  const tag = ctx.query?.tag;
  const memberId = ctx.query?.memberId || ctx.user?.memberUid;
  const activities = await getActivities();
  const list = [];
  for (const activity of activities) {
    list.push(await serializeActivity(activity, memberId));
  }
  const filtered = list.filter((activity) => !tag || activity.tags?.includes(tag));

  return {
    data: {
      tags: await getActivityTags(),
      list: filtered,
      mine: memberId ? filtered.filter((activity) => activity.isSigned) : [],
    },
  };
}

export async function listActivityTags() {
  return {
    data: await getActivityTags(),
  };
}

export async function createActivityTag({ body }) {
  const name = String(body?.name || '').trim();

  if (!name) {
    throw badRequest('Tag 名称必填');
  }

  return {
    status: 201,
    message: 'Tag 已保存',
    data: await saveActivityTag(name),
  };
}

export async function signupActivity(ctx) {
  const { params, body, user } = ctx;
  const activity = await getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  const memberId = body?.memberId || user?.memberUid;

  // 普通访客不可报名
  if (user && user.role === '普通访客') {
    throw forbidden('普通访客无法报名活动，请联系管理员升级角色');
  }

  const activityStats = await getActivityStats(params.activityId, memberId);

  if (!activityStats.member) {
    throw notFound('成员不存在');
  }

  if (activityStats.isSigned) {
    return {
      message: '已报名',
      data: await serializeActivity(activity, body.memberId),
    };
  }

  await createActivitySignup(params.activityId, body.memberId);

  return {
    status: 201,
    message: '报名成功',
    data: await serializeActivity(activity, body.memberId),
  };
}

export async function signActivity({ params, body }) {
  const activity = await getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  const activityStats = await getActivityStats(params.activityId, body.memberId);

  if (!activityStats.member) {
    throw notFound('成员不存在');
  }

  if (!activityStats.isSigned) {
    throw badRequest('请先报名活动');
  }

  if (activityStats.isCheckedIn) {
    return {
      message: '已签到',
      data: await serializeActivity(activity, body.memberId),
    };
  }

  await checkinRecord(activity, body.memberId, body.mode);

  return {
    status: 201,
    message: '签到记录已创建',
    data: await serializeActivity(activity, body.memberId),
  };
}

export async function requestLeave({ params, body }) {
  const activity = await getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  const stats = await getActivityStats(params.activityId, body.memberId);
  if (!stats.member) {
    throw notFound('成员不存在');
  }

  await createLeaveRequest(params.activityId, body.memberId, body.reason);

  return {
    status: 201,
    message: '请假申请已提交',
    data: await serializeActivity(activity, body.memberId),
  };
}

export async function submitMaterial({ params, body }) {
  const activity = await getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  if (!activity.requireMaterial) {
    throw badRequest('该活动不需要提交材料');
  }

  const stats = await getActivityStats(params.activityId, body.memberId);
  if (!stats.member) {
    throw notFound('成员不存在');
  }

  await createMaterialSubmission(params.activityId, body.memberId, body.attachment);

  return {
    status: 201,
    message: '材料已提交',
    data: await serializeActivity(activity, body.memberId),
  };
}

function formatPointsRule(rule) {
  const parts = [`签到 +${rule.basePoints}`];

  if (rule.requireValidSubmit) {
    parts.push(`有效提交 +${rule.validSubmitBonus}`);
  }

  if (rule.requireMaterial) {
    parts.push(`材料 +${rule.materialBonus}`);
  }

  return parts.join('，');
}

export async function updateActivityPointsRule({ params, body }) {
  const activity = await getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  const basePoints = Number(body?.basePoints);
  const materialBonus = Number(body?.materialBonus || 0);
  const validSubmitBonus = Number(body?.validSubmitBonus || 0);
  const requireValidSubmit = Boolean(body?.requireValidSubmit);
  const requireMaterial = Boolean(body?.requireMaterial);

  if (!Number.isFinite(basePoints) || basePoints < 0) {
    throw badRequest('基础积分必须是非负数字');
  }

  if (!Number.isFinite(materialBonus) || materialBonus < 0) {
    throw badRequest('材料加分必须是非负数字');
  }

  if (!Number.isFinite(validSubmitBonus) || validSubmitBonus < 0) {
    throw badRequest('有效提交加分必须是非负数字');
  }

  const rule = {
    basePoints,
    materialBonus,
    validSubmitBonus,
    requireValidSubmit,
    requireMaterial,
    pointsRule: String(body?.pointsRule || '').trim() || formatPointsRule({
      basePoints,
      materialBonus,
      validSubmitBonus,
      requireValidSubmit,
      requireMaterial,
    }),
  };

  const updatedActivity = await updateActivityPointRule(params.activityId, rule);

  return {
    message: '积分规则已更新',
    data: await serializeActivity(updatedActivity, body?.memberId),
  };
}

/**
 * POST /api/activities
 * 管理员创建活动
 */
export async function createActivity({ body }) {
  const { title, time, place, type, tags, pointsRule, basePoints, materialBonus, validSubmitBonus, requireValidSubmit, requireMaterial, startsAt, endsAt, signupDeadline, maxParticipants, allowEarlyCutoff, description, images } = body || {}

  if (!title) throw badRequest('活动标题必填')

  const activity = await saveActivity({
    title,
    time: time || '',
    place: place || '',
    type: type || '活动',
    tags: tags || [],
    pointsRule: pointsRule || '',
    basePoints: Number(basePoints) || 0,
    materialBonus: Number(materialBonus) || 0,
    validSubmitBonus: Number(validSubmitBonus) || 0,
    requireValidSubmit: !!requireValidSubmit,
    requireMaterial: !!requireMaterial,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
    signupDeadline: signupDeadline || null,
    maxParticipants: Number(maxParticipants) || 0,
    allowEarlyCutoff: !!allowEarlyCutoff,
    description: description || '',
    images: images || [],
  })

  return {
    status: 201,
    message: '活动已创建',
    data: await serializeActivity(activity, body?.memberId),
  }
}

/**
 * PUT /api/activities/:id — 编辑活动
 */
export async function updateActivityById({ params, body }) {
  const existing = await getActivity(params.activityId)
  if (!existing) throw notFound('活动不存在')

  const updated = await updateActivity(params.activityId, {
    title: body.title,
    time: body.time,
    place: body.place,
    pointsRule: body.pointsRule,
    description: body.description,
    images: body.images,
  })

  return { message: '活动已更新', data: await serializeActivity(updated, body?.memberId) }
}

/**
 * DELETE /api/activities/:id — 删除活动
 */
export async function deleteActivityById({ params }) {
  const existing = await getActivity(params.activityId)
  if (!existing) throw notFound('活动不存在')

  await deleteActivity(params.activityId)
  return { message: '活动已删除' }
}

// ==================== TOTP 签到 ====================

/**
 * GET /api/admin/activities/:id/checkin-info — 管理员获取签到二维码+数字码
 */
export function getCheckinInfoEndpoint({ params }) {
  const { qrPayload, qrCode, numCode } = getCheckinInfo(params.activityId)
  return {
    data: {
      qrPayload,
      qrCode,
      numCode,
      qrRefreshSec: 15,
      numRefreshSec: 10,
    },
  }
}

/**
 * POST /api/activities/:id/checkin — 用户扫码/输码签到
 * body: { code, mode: 'qr'|'num' }
 */
export async function checkinByCode(ctx) {
  const { params, body, user } = ctx
  const memberId = user?.memberUid
  const { code, mode } = body || {}

  if (!memberId) throw badRequest('请先登录')
  if (!code) throw badRequest('请输入签到码')

  const activity = await getActivity(params.activityId)
  if (!activity) throw notFound('活动不存在')

  const stats = await getActivityStats(params.activityId, memberId)
  if (!stats.isSigned) throw badRequest('请先报名活动')
  if (stats.isCheckedIn) return { message: '已签到' }

  // 验证码：qr 用 15s 周期，num 用 10s
  const interval = mode === 'qr' ? 15 : 10
  const valid = verifyCheckinCode(params.activityId, String(code), interval)
  if (!valid) throw badRequest('签到码无效或已过期')

  await checkinRecord(activity, memberId, `totp_${mode}`)
  return { message: '签到成功' }
}

// ==================== Admin Checkin APIs ====================

/**
 * GET /api/admin/activities/:id/checkin-detail — 签到详情（签到/未签到列表）
 */
export async function getCheckinDetail({ params }) {
  const detail = await getActivityCheckinDetail(params.activityId)
  return { data: detail }
}

/**
 * POST /api/admin/activities/:id/force-absence — 强制缺勤 memberUid
 */
export async function forceAbsence({ params, body }) {
  const { memberUid } = body || {}
  if (!memberUid) throw badRequest('缺少 memberUid')
  await adminForceAbsence(params.activityId, Number(memberUid))
  return { message: '已标记缺勤' }
}

/**
 * POST /api/admin/activities/:id/proxy-checkin — 代签 memberUid
 */
export async function proxyCheckin({ params, body }) {
  const { memberUid } = body || {}
  if (!memberUid) throw badRequest('缺少 memberUid')
  await adminProxyCheckin(params.activityId, Number(memberUid))
  return { message: '已代签' }
}

/**
 * POST /api/admin/activities/:id/end-checkin — 结束签到，未签到→缺勤
 */
export async function endCheckin({ params }) {
  const result = await endActivityCheckin(params.activityId)
  return { message: `签到结束，${result.markedAbsent} 人标记缺勤`, data: result }
}

