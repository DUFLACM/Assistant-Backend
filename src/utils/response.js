const defaultHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

export function sendJson(res, status, payload) {
  res.writeHead(status, {
    ...defaultHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });
  res.end(JSON.stringify(payload));
}

export function sendNoContent(res) {
  res.writeHead(204, defaultHeaders);
  res.end();
}
