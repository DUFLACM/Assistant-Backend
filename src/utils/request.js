export function parseJsonBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve, reject) => {
    let raw = '';

    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 5 * 1024 * 1024) {
        const error = new Error('请求体过大');
        error.status = 413;
        error.code = 'PAYLOAD_TOO_LARGE';
        reject(error);
      }
    });

    req.on('end', () => {
      if (!raw) {
        resolve(null);
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        error.status = 400;
        error.code = 'INVALID_JSON';
        error.message = '请求体不是合法 JSON';
        reject(error);
      }
    });

    req.on('error', reject);
  });
}
