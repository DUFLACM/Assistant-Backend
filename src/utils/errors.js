export function notFound(message = '资源不存在') {
  const error = new Error(message);
  error.status = 404;
  error.code = 'NOT_FOUND';
  return error;
}

export function badRequest(message = '请求参数错误') {
  const error = new Error(message);
  error.status = 400;
  error.code = 'BAD_REQUEST';
  return error;
}

export function tooManyRequests(message = '请求过于频繁') {
  const error = new Error(message);
  error.status = 429;
  error.code = 'TOO_MANY_REQUESTS';
  return error;
}

export function unauthorized(message = '未登录或登录已过期') {
  const error = new Error(message);
  error.status = 401;
  error.code = 'UNAUTHORIZED';
  return error;
}

export function forbidden(message = '无权限访问') {
  const error = new Error(message);
  error.status = 403;
  error.code = 'FORBIDDEN';
  return error;
}
