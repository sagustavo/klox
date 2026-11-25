import {
  AVATAR_DIMENSION_PX,
  AVATAR_MAX_DATA_URL_LENGTH,
  isValidAvatarDataUrl,
  validateAvatarFileMeta,
  type AvatarFileErrorCode,
} from '~/domain/profile';

export type AvatarProcessErrorCode =
  | AvatarFileErrorCode
  | 'AVATAR_DECODE_FAILED'
  | 'AVATAR_ENCODING_TOO_LARGE';

export type AvatarProcessResult =
  | { ok: true; dataUrl: string }
  | { ok: false; error: AvatarProcessErrorCode };

async function decodeImageSource(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // Fallback to HTMLImageElement below
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('AVATAR_DECODE_FAILED'));
      el.src = objectUrl;
    });
    return {
      source: img,
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    };
  } catch (err) {
    URL.revokeObjectURL(objectUrl);
    throw err;
  }
}

/**
 * Validates, center-crops to 1:1, resizes to 256×256, and re-encodes a user-uploaded
 * avatar into a bounded raster WebP/JPEG data URI (<= 120 KB) safe for Firestore storage.
 */
export async function processAvatarImageFile(file: File): Promise<AvatarProcessResult> {
  const metaCheck = validateAvatarFileMeta({ type: file.type, size: file.size });
  if (!metaCheck.valid) {
    return { ok: false, error: metaCheck.error! };
  }

  let decoded: Awaited<ReturnType<typeof decodeImageSource>>;
  try {
    decoded = await decodeImageSource(file);
  } catch {
    return { ok: false, error: 'AVATAR_DECODE_FAILED' };
  }

  try {
    if (decoded.width <= 0 || decoded.height <= 0) {
      return { ok: false, error: 'AVATAR_DECODE_FAILED' };
    }

    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_DIMENSION_PX;
    canvas.height = AVATAR_DIMENSION_PX;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { ok: false, error: 'AVATAR_DECODE_FAILED' };
    }

    const side = Math.min(decoded.width, decoded.height);
    const sx = Math.floor((decoded.width - side) / 2);
    const sy = Math.floor((decoded.height - side) / 2);

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      decoded.source,
      sx,
      sy,
      side,
      side,
      0,
      0,
      AVATAR_DIMENSION_PX,
      AVATAR_DIMENSION_PX
    );

    const qualities = [0.84, 0.72, 0.58];
    const formats: Array<'image/webp' | 'image/jpeg'> = ['image/webp', 'image/jpeg'];

    for (const mime of formats) {
      for (const quality of qualities) {
        const candidate = canvas.toDataURL(mime, quality);
        if (
          candidate.startsWith(`data:${mime};base64,`) &&
          candidate.length <= AVATAR_MAX_DATA_URL_LENGTH &&
          isValidAvatarDataUrl(candidate)
        ) {
          return { ok: true, dataUrl: candidate };
        }
      }
    }

    return { ok: false, error: 'AVATAR_ENCODING_TOO_LARGE' };
  } finally {
    decoded.cleanup();
  }
}
