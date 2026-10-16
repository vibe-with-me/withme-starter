import { AVATAR_MAX_BYTES, avatarPublicUrl } from '@withme/contract';

/**
 * An avatar's URL, built from THIS client's configured Supabase URL: the
 * database stores only the path, so no stored value can point off-origin.
 * Null (the initial) rather than a throw when the env is missing: the
 * resolver renders cards and must stay unbreakable.
 */
export function avatarSrc(path: string | null): string | null {
  const base = import.meta.env.VITE_SUPABASE_URL;
  return path && base ? avatarPublicUrl(base, path) : null;
}

const SIZE = 512;

/**
 * The background baked under a transparent photo. The baked background must
 * not depend on the uploader's theme: every viewer sees the same file. It
 * mirrors the light --color-surface token in styles/tokens.css.
 */
const PHOTO_FILL = '#fffefb';

function encode(canvas: HTMLCanvasElement, type: 'image/webp' | 'image/jpeg'): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.85));
}

/**
 * Centre-crop a chosen image to a square and scale it to 512px. WebP where
 * the browser can encode it; Safari's toBlob quietly returns PNG for WebP,
 * so the result's type is checked and JPEG is the fallback. The API sniffs
 * the bytes either way.
 */
export async function squareAvatar(source: Blob): Promise<File> {
  const bitmap = await createImageBitmap(source);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    // Flatten transparency onto a fixed light fill, so a PNG never turns black as JPEG.
    context.fillStyle = PHOTO_FILL;
    context.fillRect(0, 0, SIZE, SIZE);
    context.imageSmoothingQuality = 'high';
    context.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      SIZE,
      SIZE,
    );
    const webp = await encode(canvas, 'image/webp');
    const blob = webp?.type === 'image/webp' ? webp : await encode(canvas, 'image/jpeg');
    if (!blob || blob.size > AVATAR_MAX_BYTES) throw new Error('Could not encode the photo');
    return new File([blob], blob.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg', {
      type: blob.type,
    });
  } finally {
    bitmap.close();
  }
}
