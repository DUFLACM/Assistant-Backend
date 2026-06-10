import {
  createActivitySignup,
  createActivityTag as saveActivityTag,
  createCheckinRecord,
  createLeaveRequest,
  createMaterialSubmission,
  getActivity,
  getActivityStats,
  listActivities as getActivities,
  listActivityTags as getActivityTags,
  updateActivityPointRule,
} from '../data/db.js';
import { badRequest, notFound } from '../utils/errors.js';

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

function serializeActivity(activity, memberId) {
  const {
    isSigned,
    isCheckedIn,
    leaveRequested,
    materialSubmitted,
    signupCount,
  } = getActivityStats(activity.id, memberId);

  return {
    ...activity,
    isEnded: isEnded(activity),
    isSigned,
    isCheckedIn,
    leaveRequested,
    materialSubmitted,
    signupCount,
    actions: buildActions({ activity, isSigned, isCheckedIn, leaveRequested, materialSubmitted }),
  };
}

export function listActivities({ query }) {
  const tag = query.tag;
  const list = getActivities()
    .map((activity) => serializeActivity(activity, query.memberId))
    .filter((activity) => !tag || activity.tags?.includes(tag));

  return {
    data: {
      tags: getActivityTags(),
      list,
      mine: query.memberId ? list.filter((activity) => activity.isSigned) : [],
    },
  };
}

export function listActivityTags() {
  return {
    data: getActivityTags(),
  };
}

export function createActivityTag({ body }) {
  const name = String(body?.name || '').trim();

  if (!name) {
    throw badRequest('Tag 名称必填');
  }

  return {
    status: 201,
    message: 'Tag 已保存',
    data: saveActivityTag(name),
  };
}

export function signupActivity({ params, body }) {
  const activity = getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  const activityStats = getActivityStats(params.activityId, body.memberId);

  if (!activityStats.member) {
    throw notFound('成员不存在');
  }

  if (activityStats.isSigned) {
    return {
      message: '已报名',
      data: serializeActivity(activity, body.memberId),
    };
  }

  createActivitySignup(params.activityId, body.memberId);

  return {
    status: 201,
    message: '报名成功',
    data: serializeActivity(activity, body.memberId),
  };
}

export function signActivity({ params, body }) {
  const activity = getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  const activityStats = getActivityStats(params.activityId, body.memberId);

  if (!activityStats.member) {
    throw notFound('成员不存在');
  }

  if (!activityStats.isSigned) {
    throw badRequest('请先报名活动');
  }

  if (activityStats.isCheckedIn) {
    return {
      message: '已签到',
      data: serializeActivity(activity, body.memberId),
    };
  }

  createCheckinRecord(activity, body.memberId, body.mode);

  return {
    status: 201,
    message: '签到记录已创建',
    data: serializeActivity(activity, body.memberId),
  };
}

export function requestLeave({ params, body }) {
  const activity = getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  if (!getActivityStats(params.activityId, body.memberId).member) {
    throw notFound('成员不存在');
  }

  createLeaveRequest(params.activityId, body.memberId, body.reason);

  return {
    status: 201,
    message: '请假申请已提交',
    data: serializeActivity(activity, body.memberId),
  };
}

export function submitMaterial({ params, body }) {
  const activity = getActivity(params.activityId);

  if (!activity) {
    throw notFound('活动不存在');
  }

  if (!body?.memberId) {
    throw badRequest('memberId 必填');
  }

  if (!activity.requireMaterial) {
    throw badRequest('该活动不需要提交材料');
  }

  if (!getActivityStats(params.activityId, body.memberId).member) {
    throw notFound('成员不存在');
  }

  createMaterialSubmission(params.activityId, body.memberId, body.attachment);

  return {
    status: 201,
    message: '材料已提交',
    data: serializeActivity(activity, body.memberId),
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

export function updateActivityPointsRule({ params, body }) {
  const activity = getActivity(params.activityId);

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

  const updatedActivity = updateActivityPointRule(params.activityId, rule);

  return {
    message: '积分规则已更新',
    data: serializeActivity(updatedActivity, body?.memberId),
  };
}
