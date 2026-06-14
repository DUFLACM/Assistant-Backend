import { getMember as findMember, getPlatformAccount, upsertPlatformAccount } from '../data/db.js';
import { badRequest, notFound, tooManyRequests } from '../utils/errors.js';

const UPDATE_LIMIT_PER_DAY = 5;
const UPDATE_INTERVAL_MS = 10 * 60 * 1000;

async function assertMember(memberId) {
  const member = await findMember(memberId);

  if (!member) {
    throw notFound('成员不存在');
  }

  return member;
}

function getDayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTodayUpdates(account, now = Date.now()) {
  const today = getDayKey(new Date(now));

  return (account?.updateLogs || []).filter((timestamp) => getDayKey(new Date(timestamp)) === today);
}

function assertCanUpdate(account) {
  if (!account) {
    return;
  }

  const now = Date.now();
  const latestUpdateAt = account.updateLogs?.[account.updateLogs.length - 1] || 0;
  const waitMs = UPDATE_INTERVAL_MS - (now - latestUpdateAt);

  if (waitMs > 0) {
    const waitMinutes = Math.ceil(waitMs / 60000);
    throw tooManyRequests(`更新间隔为 10 分钟，请 ${waitMinutes} 分钟后再试`);
  }

  if (getTodayUpdates(account, now).length >= UPDATE_LIMIT_PER_DAY) {
    throw tooManyRequests('今日 Codeforces 更新次数已用完');
  }
}

function normalizeHandle(handle = '') {
  return String(handle).trim();
}

function assertHandle(handle) {
  if (!handle) {
    throw badRequest('请输入 Codeforces 用户名');
  }

  if (handle.length > 24 || /\s/.test(handle)) {
    throw badRequest('Codeforces 用户名格式不正确');
  }
}

function serializeAccount(account) {
  if (!account) {
    return {
      bound: false,
      handle: '',
      rating: null,
      maxRating: null,
      rank: '',
      maxRank: '',
      updatedAt: null,
      updatesLeftToday: UPDATE_LIMIT_PER_DAY,
    };
  }

  const updatesToday = getTodayUpdates(account).length;

  return {
    bound: true,
    handle: account.handle,
    rating: account.rating ?? null,
    maxRating: account.maxRating ?? null,
    rank: account.rank || 'unrated',
    maxRank: account.maxRank || 'unrated',
    avatar: account.avatar || '',
    titlePhoto: account.titlePhoto || '',
    updatedAt: account.updatedAt,
    updatesLeftToday: Math.max(UPDATE_LIMIT_PER_DAY - updatesToday, 0),
  };
}

async function fetchCodeforcesUser(handle) {
  const response = await fetch(`https://codeforces.com/api/user.info?handles=${encodeURIComponent(handle)}`);
  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.status !== 'OK' || !payload.result?.length) {
    throw badRequest(payload?.comment || 'Codeforces 用户不存在或接口暂不可用');
  }

  return payload.result[0];
}

async function refreshAccount(memberId, handle) {
  const member = await assertMember(memberId);
  const existingAccount = await getPlatformAccount(member.id, 'codeforces');

  assertCanUpdate(existingAccount);

  const user = await fetchCodeforcesUser(handle);
  const now = Date.now();
  const updateLogs = [...getTodayUpdates(existingAccount, now), now];

  const account = await upsertPlatformAccount(member.id, 'codeforces', user.handle, {
    handle: user.handle,
    rating: user.rating ?? null,
    maxRating: user.maxRating ?? null,
    rank: user.rank || 'unrated',
    maxRank: user.maxRank || 'unrated',
    avatar: user.avatar || '',
    titlePhoto: user.titlePhoto || '',
    updatedAt: new Date(now).toISOString(),
  }, updateLogs);

  return serializeAccount(account);
}

export async function getCodeforcesAccount({ params }) {
  const member = await assertMember(params.memberId);

  return {
    data: serializeAccount(await getPlatformAccount(member.id, 'codeforces')),
  };
}

export async function bindCodeforcesAccount({ body, params }) {
  await assertMember(params.memberId);

  const handle = normalizeHandle(body?.handle);
  assertHandle(handle);

  return {
    data: await refreshAccount(params.memberId, handle),
  };
}

export async function updateCodeforcesAccount({ params }) {
  const member = await assertMember(params.memberId);

  const account = await getPlatformAccount(member.id, 'codeforces');

  if (!account) {
    throw badRequest('请先绑定 Codeforces 用户名');
  }

  return {
    data: await refreshAccount(params.memberId, account.handle),
  };
}
