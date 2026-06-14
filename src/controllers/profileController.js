import { getMember, listPointLogs, db } from '../data/db.js';
import { getMemberPointSummary } from '../services/pointsService.js';
import { badRequest, notFound } from '../utils/errors.js';
import sharp from 'sharp';

const IMAGE_HOST_URL = process.env.IMAGE_HOST_URL || ''

/**
 * POST /api/me/avatar
 * 优先上传到图床；图床不可用时直接存 data URL 到本地数据库
 */
export async function uploadAvatar(ctx) {
  return _uploadToImageHost(ctx, 'avatar');
}

/**
 * POST /api/upload/screenshot
 * 上传活动截图到图床（6个月过期）
 */
export async function uploadScreenshot(ctx) {
  return _uploadToImageHost(ctx, 'screenshot');
}

/**
 * 把 data URL 缩到 200x200 webp，返回更小的 data URL
 */
async function resizeToAvatar(dataUrl) {
  try {
    const b64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(b64, 'base64');
    const resized = await sharp(buf)
      .resize(200, 200, { fit: 'cover' })
      .webp({ quality: 30 })
      .toBuffer();
    return `data:image/webp;base64,${resized.toString('base64')}`;
  } catch {
    return dataUrl; // sharp 失败时用原图
  }
}

async function _uploadToImageHost(ctx, category) {
  const { image } = ctx.body || {};
  if (!image) throw badRequest('请选择图片');

  // 如果没有配置图床，压缩后存 data URL
  if (!IMAGE_HOST_URL) {
    // 把原图缩到 200x200 再 base64，避免太大
    const small = await resizeToAvatar(image);
    await db.query('UPDATE members SET avatar_url = ? WHERE uid = ?', [small, ctx.user.memberUid]);
    return { message: '头像已更新', data: { avatarUrl: small } };
  }

  // image 是 data URL (data:image/...;base64,...)
  const b64 = image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(b64, 'base64');

  // 发送到图床
  try {
    // Use native fetch + Buffer
    const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
    const CRLF = '\r\n';
    const filename = category === 'avatar' ? 'avatar.png' : 'screenshot.png';
    const parts = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      'Content-Type: image/png',
      '',
      '',
    ];
    const head = Buffer.from(parts.join(CRLF), 'utf-8');
    const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf-8');
    const body = Buffer.concat([head, buffer, tail]);

    const res = await fetch(`${IMAGE_HOST_URL}/upload/${category}`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`图床上传失败: ${errText}`);
    }

    const result = await res.json();
    const url = result.url || result.static_url;

    // 头像存储到 members 表
    if (category === 'avatar') {
      await db.query('UPDATE members SET avatar_url = ? WHERE uid = ?', [url, ctx.user.memberUid]);
      return { message: '头像已更新', data: { avatarUrl: url } };
    }

    return { message: '上传成功', data: { url } };
  } catch (err) {
    // 图床不可用 → 回退到直接存 data URL
    if (category === 'avatar') {
      const small = await resizeToAvatar(image);
      await db.query('UPDATE members SET avatar_url = ? WHERE uid = ?', [small, ctx.user.memberUid]);
      return { message: '头像已更新', data: { avatarUrl: small } };
    }
    throw { status: 502, code: 'UPLOAD_FAILED', message: `图床连接失败: ${err.message}` };
  }
}

/**
 * GET /api/me/point-logs — 获取当前用户的积分流水
 */
export async function listMyPointLogs(ctx) {
  const member = await getMember(ctx.user.memberUid)
  if (!member) throw notFound('成员不存在')

  const logs = await listPointLogs(member.id)
  const summary = await getMemberPointSummary(member.id)

  return {
    data: {
      points: summary,
      logs,
    },
  }
}

export async function getProfile(ctx) {
  const member = await getMember(ctx.params.memberId || ctx.user.memberUid);

  if (!member) {
    throw notFound('成员不存在');
  }

  const points = await getMemberPointSummary(member.id);

  return {
    data: {
      ...member,
      points,
      pointLogs: await listPointLogs(member.id),
      adminEntrances: [
        { id: 'member', label: '成员管理' },
        { id: 'activity', label: '活动管理' },
        { id: 'points', label: '积分审核' },
        { id: 'audit', label: '操作日志' },
      ],
    },
  };
}

// 允许修改的个人信息字段（白名单）
const ALLOWED_FIELDS = ['name', 'real_name', 'phone', 'gender', 'grade', 'major', 'class_name', 'email', 'qq']

export async function updateProfile({ params, body }) {
  const member = await getMember(params.memberId)

  if (!member) {
    throw notFound('成员不存在')
  }

  const sets = []
  const values = []

  for (const [key, value] of Object.entries(body || {})) {
    // 前端 camelCase → DB snake_case
    const dbKey = key === 'realName' ? 'real_name' : key === 'className' ? 'class_name' : key
    if (ALLOWED_FIELDS.includes(dbKey)) {
      sets.push(`${dbKey} = ?`)
      values.push(String(value ?? ''))
    }
  }

  if (sets.length === 0) {
    throw badRequest('没有可修改的字段')
  }

  values.push(member.uid)
  await db.query(`UPDATE members SET ${sets.join(', ')} WHERE uid = ?`, values)

  // 返回更新后的 member
  const updated = await getMember(params.memberId)
  return { data: updated }
}
