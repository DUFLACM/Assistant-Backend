import { getHubSummary } from './controllers/hubController.js';
import {
  createActivityTag,
  listActivities,
  listActivityTags,
  requestLeave,
  signActivity,
  signupActivity,
  submitMaterial,
  updateActivityPointsRule,
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
import { getProfile } from './controllers/profileController.js';
import { getPointsPreview } from './controllers/pointsController.js';

export const routes = [
  {
    method: 'GET',
    pattern: /^\/api\/health$/,
    keys: [],
    handler: () => ({
      data: {
        service: 'dufl-acm-assistant',
        status: 'ok',
        time: new Date().toISOString(),
      },
    }),
  },
  {
    method: 'GET',
    pattern: /^\/api\/hub$/,
    keys: [],
    handler: getHubSummary,
  },
  {
    method: 'GET',
    pattern: /^\/api\/activities$/,
    keys: [],
    handler: listActivities,
  },
  {
    method: 'GET',
    pattern: /^\/api\/activity-tags$/,
    keys: [],
    handler: listActivityTags,
  },
  {
    method: 'POST',
    pattern: /^\/api\/activity-tags$/,
    keys: [],
    handler: createActivityTag,
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/signup$/,
    keys: ['activityId'],
    handler: signupActivity,
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/checkin$/,
    keys: ['activityId'],
    handler: signActivity,
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/leave$/,
    keys: ['activityId'],
    handler: requestLeave,
  },
  {
    method: 'POST',
    pattern: /^\/api\/activities\/([^/]+)\/material$/,
    keys: ['activityId'],
    handler: submitMaterial,
  },
  {
    method: 'PUT',
    pattern: /^\/api\/activities\/([^/]+)\/points-rule$/,
    keys: ['activityId'],
    handler: updateActivityPointsRule,
  },
  {
    method: 'GET',
    pattern: /^\/api\/contests$/,
    keys: [],
    handler: listContests,
  },
  {
    method: 'POST',
    pattern: /^\/api\/contests\/([^/]+)\/signup$/,
    keys: ['contestId'],
    handler: applyContest,
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/profile$/,
    keys: ['memberId'],
    handler: getProfile,
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/codeforces$/,
    keys: ['memberId'],
    handler: getCodeforcesAccount,
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/codeforces$/,
    keys: ['memberId'],
    handler: bindCodeforcesAccount,
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/codeforces\/update$/,
    keys: ['memberId'],
    handler: updateCodeforcesAccount,
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/nowcoder$/,
    keys: ['memberId'],
    handler: getNowcoderAccount,
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/nowcoder$/,
    keys: ['memberId'],
    handler: bindNowcoderAccount,
  },
  {
    method: 'POST',
    pattern: /^\/api\/members\/([^/]+)\/nowcoder\/update$/,
    keys: ['memberId'],
    handler: updateNowcoderAccount,
  },
  {
    method: 'GET',
    pattern: /^\/api\/members\/([^/]+)\/points-preview$/,
    keys: ['memberId'],
    handler: getPointsPreview,
  },
];
