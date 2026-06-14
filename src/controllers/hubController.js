import { getMember, listActivities, listPointLogs, listAnnouncements } from '../data/db.js';
import { buildRanking, getMemberPointSummary } from '../services/pointsService.js';

export async function getHubSummary(ctx) {
  const memberUid = ctx.user.memberUid;
  const member = await getMember(memberUid);

  if (!member) {
    throw { status: 401, code: 'UNAUTHORIZED', message: '账号已不存在' };
  }

  const summary = await getMemberPointSummary(memberUid);
  const ranking = await buildRanking();
  const activities = await listActivities();
  const pointLogs = await listPointLogs(memberUid);
  const announcementList = await listAnnouncements();

  // Pending-point logs (audit_status = 'pending')
  const pendingLogs = pointLogs.filter(l => l.auditStatus === 'pending');

  // Recent activities (newest 4)
  const recentActivities = activities.slice(0, 4).map(a => ({
    id: a.id,
    type: a.type || '活动',
    title: a.title,
    time: a.time,
    status: a.status || '进行中',
  }));

  // Top-3 ranking for "社内排名"
  const top3 = ranking.slice(0, 3).map(r => ({
    name: r.name,
    points: r.effectivePoints,
    rank: r.rank,
  }));

  return {
    data: {
      member: {
        uid: member.uid,
        name: member.realName || member.name,
        role: member.role || '预备社员',
        activity: member.activity || 0,
        isAdmin: member.isAdmin || false,
        gravatarUrl: member.gravatarUrl || '',
        avatarUrl: member.avatarUrl || '',
        email: member.email || '',
      },
      stats: {
        points: summary.effectivePoints,
        rank: summary.rank || '--',
        monthPoints: summary.monthRawPoints || 0,
        pending: pendingLogs.length,
      },
      ranking: top3,
      recentActivities,
      announcements: announcementList,
      pendingTasks: pendingLogs.map(l => ({
        id: l.id,
        title: l.source || l.type,
        meta: `${l.points} 分`,
        status: '待审核',
      })),
    },
  };
}
