import { getHubSummary } from './controllers/hubController.js';
import { listAnnouncementsHandler, createAnnouncement } from './controllers/announcementController.js';
import { listPendingPoints, approvePoint, rejectPoint, searchRanking, manualAddPoints, getMemberPointLogs, addRule, editRule, removeRule, getOperationLogs } from './controllers/pointsAdminController.js';
import {
  createActivityTag,
  listActivities,
  listActivityTags,
  requestLeave,
  signActivity,
  signupActivity,
  submitMaterial,
  updateActivityPointsRule,
  createActivity,
  updateActivityById,
  deleteActivityById,
  getCheckinInfoEndpoint,
  checkinByCode,
  getCheckinDetail,
  forceAbsence,
  proxyCheckin,
  endCheckin,
} from './controllers/activityController.js';
import { applyContest, listContests } from './controllers/contestController.js';
import {
  bindCodeforcesAccount,
  getCodeforcesAccount,
  updateCodeforcesAccount,
} from './controllers/codeforcesController.js';
import {
  bindNowcoderAccount,
  getNowcoderAccount,
  updateNowcoderAccount,
} from './controllers/nowcoderController.js';
import { getProfile, updateProfile, uploadAvatar, uploadScreenshot, listMyPointLogs } from './controllers/profileController.js';
import { getPointsPreview } from './controllers/pointsController.js';
import { login } from './controllers/authController.js';
import { casLogin, casCallback, casRegister, casBind, getCurrentUser } from './controllers/casController.js';
import { listAllMembers, getMemberDetail, changeMemberRole } from './controllers/membersController.js';
import { withAuth } from './middleware/auth.js';

export const routes = [
  // CAS 数字大外登录路由
  {
    method: 'GET',
    pattern: /^\/api\/auth\/cas$/,
    keys: [],
    public: true,
    handler: casLogin,
  },
  {
    method: 'GET',
    pattern: /^\/api\/auth\/cas\/callback$/,
    keys: [],
    public: true,
    handler: casCallback,
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/cas\/register$/,
    keys: [],
    public: true,
    handler: casRegister,
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/cas\/bind$/,
    keys: [],
    public: true,
    handler: casBind,
  },
  // Public routes
  {
    method: 'GET',
    pattern: /^\/api\/health$/,
    keys: [],
    public: true,
    handler: () => ({
      data: {
        service: 'dufl-acm-assistant',
        status: 'ok',
        time: new Date().toISOString().replace('T', ' ').slice(0, 19),
      },
    }),
  },
  {
    method: 'POST',
    pattern: /^\/api\/auth\/login$/,
    keys: [],
    public: true,
    handler: login,
  },
  // Protected routes below
  {
    method: 'GET',
    pattern: /^\/api\/admin\/points$/,
    keys: [],
    handler: withAuth(listPendingPoints),
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/points\/ranking$/,
    keys: [],
    handler: withAuth(searchRanking),
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/points\/add$/,
    keys: [],
    handler: withAuth(manualAddPoints),
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/points\/member\/(\d+)\/logs$/,
    keys: ['memberUid'],
    handler: withAuth(getMemberPointLogs),
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/points\/rules$/,
    keys: [],
    handler: withAuth(addRule),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/admin\/points\/rules\/([^/]+)$/,
    keys: ['id'],
    handler: withAuth(editRule),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/admin\/points\/rules\/([^/]+)$/,
    keys: ['id'],
    handler: withAuth(removeRule),
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/points\/([^/]+)\/approve$/,
    keys: ['id'],
    handler: withAuth(approvePoint),
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/points\/([^/]+)\/reject$/,
    keys: ['id'],
    handler: withAuth(rejectPoint),
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/operation-logs$/,
    keys: [],
    handler: withAuth(getOperationLogs),
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/members$/,
    keys: [],
    handler: withAuth(listAllMembers),
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/members\/([^/]+)$/,
    keys: ['uid'],
    handler: withAuth(getMemberDetail),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/admin\/members\/([^/]+)\/role$/,
    keys: ['uid'],
    handler: withAuth(changeMemberRole),
  },
  {
    method: 'GET',
    pattern: /^\/api\/announcements$/,
    keys: [],
    handler: listAnnouncementsHandler,
  },
  {
    method: 'POST',
    pattern: /^\/api\/announcements$/,
    keys: [],
    handler: withAuth(createAnnouncement),
  },
  {
    method: 'GET',
    pattern: /^\/api\/hub$/,
    keys: [],
    handler: withAuth(getHubSummary),
  },
  {
    method: 'GET',
    pattern: /^\/api\/activities$/,
    keys: [],
    handler: withAuth(listActivities),
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities$/,
    keys: [],
    handler: withAuth(createActivity),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/activities\/([^/]+)$/,
    keys: ['activityId'],
    handler: withAuth(updateActivityById),
  },
  {
    method: 'DELETE',
    pattern: /^\/api\/activities\/([^/]+)$/,
    keys: ['activityId'],
    handler: withAuth(deleteActivityById),
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/activities\/([^/]+)\/checkin-info$/,
    keys: ['activityId'],
    handler: withAuth(getCheckinInfoEndpoint),
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/checkin$/,
    keys: ['activityId'],
    handler: withAuth(checkinByCode),
  },
  {
    method: 'GET',
    pattern: /^\/api\/admin\/activities\/([^/]+)\/checkin-detail$/,
    keys: ['activityId'],
    handler: withAuth(getCheckinDetail),
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/activities\/([^/]+)\/force-absence$/,
    keys: ['activityId'],
    handler: withAuth(forceAbsence),
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/activities\/([^/]+)\/proxy-checkin$/,
    keys: ['activityId'],
    handler: withAuth(proxyCheckin),
  },
  {
    method: 'POST',
    pattern: /^\/api\/admin\/activities\/([^/]+)\/end-checkin$/,
    keys: ['activityId'],
    handler: withAuth(endCheckin),
  },
  {
    method: 'GET',
    pattern: /^\/api\/activity-tags$/,
    keys: [],
    handler: withAuth(listActivityTags),
  },
  {
    method: 'POST',
    pattern: /^\/api\/activity-tags$/,
    keys: [],
    handler: withAuth(createActivityTag),
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/signup$/,
    keys: ['activityId'],
    handler: withAuth(signupActivity),
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/checkin$/,
    keys: ['activityId'],
    handler: withAuth(signActivity),
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/leave$/,
    keys: ['activityId'],
    handler: withAuth(requestLeave),
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/material$/,
    keys: ['activityId'],
    handler: withAuth(submitMaterial),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/activities\/([^/]+)\/points-rule$/,
    keys: ['activityId'],
    handler: withAuth(updateActivityPointsRule),
  },
  {
    method: 'GET',
    pattern: /^\/api\/contests$/,
    keys: [],
    handler: withAuth(listContests),
  },
  {
    method: 'POST',
    pattern: /^\/api\/contests\/([^/]+)\/signup$/,
    keys: ['contestId'],
    handler: withAuth(applyContest),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/profile$/,
    keys: [],
    handler: withAuth((ctx) => getProfile({ params: { memberId: ctx.user.memberUid } })),
  },
  // Admin views any member's profile
  {
    method: 'GET',
    pattern: /^\/api\/admin\/members\/(\d+)\/profile$/,
    keys: ['memberUid'],
    handler: withAuth((ctx) => getProfile({ params: { memberId: ctx.params.memberUid } })),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/point-logs$/,
    keys: [],
    handler: withAuth(listMyPointLogs),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/me\/profile$/,
    keys: [],
    handler: withAuth((ctx) => updateProfile({ params: { memberId: ctx.user.memberUid }, body: ctx.body })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/avatar$/,
    keys: [],
    handler: withAuth(uploadAvatar),
  },
  {
    method: 'POST',
    pattern: /^\/api\/upload\/screenshot$/,
    keys: [],
    handler: withAuth(uploadScreenshot),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/codeforces$/,
    keys: [],
    handler: withAuth((ctx) => getCodeforcesAccount({ params: { memberId: ctx.user.memberUid } })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/codeforces$/,
    keys: [],
    handler: withAuth((ctx) => bindCodeforcesAccount({ params: { memberId: ctx.user.memberUid }, body: ctx.body })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/codeforces\/update$/,
    keys: [],
    handler: withAuth((ctx) => updateCodeforcesAccount({ params: { memberId: ctx.user.memberUid } })),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me\/nowcoder$/,
    keys: [],
    handler: withAuth((ctx) => getNowcoderAccount({ params: { memberId: ctx.user.memberUid } })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/nowcoder$/,
    keys: [],
    handler: withAuth((ctx) => bindNowcoderAccount({ params: { memberId: ctx.user.memberUid }, body: ctx.body })),
  },
  {
    method: 'POST',
    pattern: /^\/api\/me\/nowcoder\/update$/,
    keys: [],
    handler: withAuth((ctx) => updateNowcoderAccount({ params: { memberId: ctx.user.memberUid } })),
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/profile$/,
    keys: ['memberId'],
    handler: withAuth(getProfile),
  },
  {
    method: 'PUT',
    pattern: /^\/api\/members\/([^/]+)\/profile$/,
    keys: ['memberId'],
    handler: withAuth(updateProfile),
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/codeforces$/,
    keys: ['memberId'],
    handler: withAuth(getCodeforcesAccount),
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/codeforces$/,
    keys: ['memberId'],
    handler: withAuth(bindCodeforcesAccount),
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/codeforces\/update$/,
    keys: ['memberId'],
    handler: withAuth(updateCodeforcesAccount),
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/nowcoder$/,
    keys: ['memberId'],
    handler: withAuth(getNowcoderAccount),
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/nowcoder$/,
    keys: ['memberId'],
    handler: withAuth(bindNowcoderAccount),
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/nowcoder\/update$/,
    keys: ['memberId'],
    handler: withAuth(updateNowcoderAccount),
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/points-preview$/,
    keys: ['memberId'],
    handler: withAuth(getPointsPreview),
  },
  {
    method: 'GET',
    pattern: /^\/api\/me$/,
    keys: [],
    handler: withAuth(getCurrentUser),
  },
];
