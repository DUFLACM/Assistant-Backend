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
