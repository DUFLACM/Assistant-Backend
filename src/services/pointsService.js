import { getMember, getMonthlyPoints, listMembers } from '../data/db.js';

const weights = [1, 0.85, 0.7, 0.55, 0.4, 0.25];

export function calculateEffectivePoints(memberId) {
  const months = getMonthlyPoints(memberId);
  const value = weights.reduce((sum, weight, index) => sum + (Number(months[index] || 0) * weight), 0);

  return Number(value.toFixed(1));
}

export function buildRanking() {
  return listMembers()
    .map((member) => ({
      memberId: member.id,
      uid: member.uid,
      name: member.name,
      studentNo: member.studentNo,
      role: member.role,
      effectivePoints: calculateEffectivePoints(member.id),
    }))
    .sort((a, b) => b.effectivePoints - a.effectivePoints)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      state: index < 3 ? '拟推荐' : '候补',
    }));
}

export function getMemberPointSummary(memberId) {
  const member = getMember(memberId);
  const normalizedMemberId = member?.id || memberId;
  const ranking = buildRanking();
  const row = ranking.find((item) => item.memberId === normalizedMemberId);
  const monthlyRawPoints = getMonthlyPoints(normalizedMemberId);

  return {
    effectivePoints: row?.effectivePoints || 0,
    rank: row?.rank || null,
    monthRawPoints: monthlyRawPoints[0] || 0,
    monthlyRawPoints,
    weights,
  };
}
