import { getMember, getMonthlyPoints, listMembers, listPointRules } from '../data/db.js';

/**
 * 从 point_rules 表中提取指定规则的 ruleJson
 */
async function getRuleJson(name) {
  const allRules = await listPointRules();
  const rule = allRules.find(r => r.name === name && r.enabled);
  return rule ? rule.ruleJson : {};
}

/**
 * 获取滚动权重配置
 */
async function getWeights() {
  const json = await getRuleJson('有效积分滚动权重');
  const w0 = Number(json.w0 ?? 1);
  const w1 = Number(json.w1 ?? 0.85);
  const w2 = Number(json.w2 ?? 0.7);
  const w3 = Number(json.w3 ?? 0.55);
  const w4 = Number(json.w4 ?? 0.4);
  const w5 = Number(json.w5 ?? 0.25);
  const precision = Number(json.precision ?? 0.1);
  return { weights: [w0, w1, w2, w3, w4, w5], maxMonths: Number(json.maxMonths ?? 6), precision };
}

/**
 * 按章程公式计算有效积分：
 * E_t = w0×M_t + w1×M_(t-1) + ... + w5×M_(t-5)
 * 超过 maxMonths 个月的 M 不计入
 */
export async function calculateEffectivePoints(memberId) {
  const { weights, maxMonths, precision } = await getWeights();
  const months = await getMonthlyPoints(memberId);
  // months 按时间降序排列，[0]=当月
  let value = 0;
  for (let i = 0; i < Math.min(weights.length, maxMonths, months.length); i++) {
    value += (Number(months[i]) || 0) * weights[i];
  }

  // 按 precision 四舍五入（如 precision=0.1 → 保留1位小数）
  return Number((Math.round(value / precision) * precision).toFixed(1));
}

/**
 * 判断成员是否低活跃/需清零
 */
export async function getActivityStatus(memberId) {
  const { lowActivityMonths, zeroActivityMonths } = await getRuleJson('低活跃度与清零');
  const lowThreshold = Number(lowActivityMonths) || 3;
  const zeroThreshold = Number(zeroActivityMonths) || 6;

  // 获取成员注册时间，新注册用户(<3个月)不判定低活跃/清零
  const member = await getMember(memberId);
  if (member && member.createdAt) {
    const regDate = new Date(member.createdAt);
    const now = new Date();
    const monthsSinceReg = (now.getFullYear() - regDate.getFullYear()) * 12
      + (now.getMonth() - regDate.getMonth());
    // 注册不满 lowThreshold 个月，不判定
    if (monthsSinceReg < lowThreshold) return 'active';
  }

  const months = await getMonthlyPoints(memberId);

  let consecutiveZero = 0;
  for (let i = 0; i < months.length; i++) {
    if (Number(months[i]) === 0) {
      consecutiveZero++;
    } else {
      break;
    }
  }

  if (consecutiveZero >= zeroThreshold) return 'zeroed';
  if (consecutiveZero >= lowThreshold) return 'lowActivity';
  return 'active';
}

export async function buildRanking() {
  const members = await listMembers();
  const ranking = [];

  for (const member of members) {
    const effectivePoints = await calculateEffectivePoints(member.id);
    const activityStatus = await getActivityStatus(member.id);
    // 连续6月无记录 → 有效积分清零
    const finalPoints = activityStatus === 'zeroed' ? 0 : effectivePoints;
    ranking.push({
      memberId: member.id,
      uid: member.uid,
      name: member.name,
      studentNo: member.studentNo,
      role: member.role,
      effectivePoints: finalPoints,
      activityStatus,
    });
  }

  ranking.sort((a, b) => b.effectivePoints - a.effectivePoints);
  return ranking.map((item, index) => ({
    ...item,
    rank: index + 1,
  }));
}

export async function getMemberPointSummary(memberId) {
  const member = await getMember(memberId);
  const normalizedMemberId = member?.id || memberId;
  const ranking = await buildRanking();
  const row = ranking.find((item) => item.memberId === normalizedMemberId);
  const monthlyRawPoints = await getMonthlyPoints(normalizedMemberId);
  const { weights } = await getWeights();
  const activityStatus = await getActivityStatus(normalizedMemberId);

  return {
    effectivePoints: row?.effectivePoints || 0,
    rank: row?.rank || null,
    activityStatus,
    monthRawPoints: monthlyRawPoints[0] || 0,
    monthlyRawPoints,
    weights,
  };
}

/**
 * ==================== 周赛/月赛/训练赛记分 ====================
 * W = B + λ × (S_coeff × S + R_coeff × R) + X
 *
 * @param {Object} params
 * @param {number} params.contestType - 'weekly' | 'monthly' | 'training' | 'camp'
 * @param {number} params.solved - 通过题数
 * @param {number} params.totalProblems - 比赛总题数
 * @param {number} params.societyRank - 社内名次（1-based）
 * @param {number} params.societyTotal - 社内有效参赛人数
 * @param {number} params.globalRank - 总排名
 * @param {number} params.globalTotal - 总参赛人数
 * @param {boolean} params.isRemote - 是否远程参赛
 */
export async function calculateContestScore({
  contestType = 'weekly',
  solved = 0,
  totalProblems = 1,
  societyRank = 1,
  societyTotal = 1,
  globalRank = null,
  globalTotal = null,
  isRemote = false,
}) {
  const json = await getRuleJson('周赛/月赛/训练赛记分');
  const B = (contestType === 'monthly' || contestType === 'camp')
    ? Number(json.basePointsEnhanced ?? 3)
    : Number(json.basePoints ?? 2);
  const lambda = Number(json.lambda ?? 1);
  const S_coeff = Number(json.S_coeff ?? 4);
  const R_coeff = Number(json.R_coeff ?? 6);

  // S = solved / totalProblems ∈ [0,1]
  const S = Math.min(1, Math.max(0, solved / Math.max(1, totalProblems)));

  // R = 1 - (rank-1) / max(1, total-1)
  const effTotal = Math.max(1, societyTotal);
  let R = 1 - (societyRank - 1) / Math.max(1, effTotal - 1);
  if (societyTotal < 3) R *= 0.5;
  R = Math.max(0, Math.min(1, R));

  // X: 对外排名附加
  let X = 0;
  if (globalRank && globalTotal && globalTotal > 0) {
    const pct = globalRank / globalTotal;
    if (pct <= 0.05) X = Number(json.X_top5 ?? 3);
    else if (pct <= 0.10) X = Number(json.X_top10 ?? 2);
    else if (pct <= 0.30) X = Number(json.X_top30 ?? 1);
  }

  let W = B + lambda * (S_coeff * S + R_coeff * R) + X;

  // 远程系数
  if (isRemote) {
    const remoteMultiplier = Number(json.remoteMultiplier ?? 0.5);
    W = remoteMultiplier * (lambda * (S_coeff * S + R_coeff * R) + X);
    // 远程不计 B
  }

  // 上限
  const maxScore = (contestType === 'camp')
    ? Number(json.maxScoreEnhanced ?? 25)
    : Number(json.maxScore ?? 20);
  W = Math.min(W, maxScore);
  W = Math.round(W); // M 以整数表示

  return W;
}

/**
 * ==================== 正式竞赛记分 ====================
 */
export async function calculateOfficialContestScore({ level = 'D', award = 'participation' }) {
  const json = await getRuleJson('正式竞赛记分（附录二）');
  const key = `level${level}_${award}`;
  return Number(json[key] ?? 0);
}

/**
 * ==================== 扣分 ====================
 */
export async function getPenaltyScore(violation) {
  const json = await getRuleJson('扣分标准');
  const map = {
    absence: 'absencePenalty',
    lateLeave: 'lateLeavePenalty',
    proxySign: 'proxySignPenalty',
    taskFail: 'taskFailPenalty',
    cheat: 'cheatPenalty',
    fraud: 'fraudPenalty',
  };
  const key = map[violation];
  return key ? Number(json[key] ?? 0) : 0;
}
