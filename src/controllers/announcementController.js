import sharp from 'sharp';
import { listAnnouncements, createAnnouncement as saveAnnouncement } from '../data/db.js';
import { badRequest, forbidden } from '../utils/errors.js';

/**
 * Compress image from base64 data URL.
 * Returns compressed base64 data URL (webp, max 800px wide, quality 80).
 */
async function compressImage(dataUrl) {
  if (!dataUrl) return null;

  // Strip header: "data:image/png;base64,..."
  const match = dataUrl.match(/^data:image\/\w+;base64,(.+)$/);
  if (!match) return null;

  const buffer = Buffer.from(match[1], 'base64');

  try {
    const compressed = await sharp(buffer)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();

    return `data:image/webp;base64,${compressed.toString('base64')}`;
  } catch {
    return dataUrl; // fallback to original
  }
}

/**
 * POST /api/announcements
 * Admin creates announcement
 */
export async function createAnnouncement(ctx) {
  if (!ctx.user.isAdmin) {
    throw forbidden('仅管理员可发布公告');
  }

  const { title, content, image } = ctx.body || {};

  if (!title || !title.trim()) {
    throw badRequest('请输入公告标题');
  }
  if (!content || !content.trim()) {
    throw badRequest('请输入公告内容');
  }

  const compressedImage = image ? await compressImage(image) : null;

  const announcement = await saveAnnouncement({
    title: title.trim(),
    content: content.trim(),
    image: compressedImage,
    publisherUid: ctx.user.memberUid,
    publisherName: ctx.user.username,
  });

  return {
    status: 201,
    message: '公告已发布',
    data: announcement,
  };
}

/**
 * GET /api/announcements
 * Public — anyone can list
 */
export async function listAnnouncementsHandler() {
  const list = await listAnnouncements();
  return { data: list };
}
