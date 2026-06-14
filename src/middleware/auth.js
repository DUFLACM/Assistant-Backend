import { getMember } from '../data/db.js';
import { unauthorized } from '../utils/errors.js';
import { extractToken, verifyToken } from '../utils/auth.js';

/**
 * Auth middleware wrapper.
 * Wraps a route handler to verify JWT and member existence before executing.
 * If the JWT is valid but the member record is gone, returns 401.
 * Injects `context.user` into the handler params.
 */
export function withAuth(handler) {
  return async (context) => {
    const token = extractToken(context.headers);

    if (!token) {
      throw unauthorized('请先登录');
    }

    const payload = verifyToken(token);

    if (!payload) {
      throw unauthorized('登录已过期，请重新登录');
    }

    // 校验成员在数据库中是否仍存在
    const member = await getMember(payload.sub);

    if (!member) {
      throw unauthorized('账号已不存在，请重新登录');
    }

    return handler({
      ...context,
      user: {
        memberUid: payload.sub,
        username: payload.username,
        isAdmin: payload.isAdmin || false,
        role: payload.role || '预备社员',
      },
    });
  };
}
