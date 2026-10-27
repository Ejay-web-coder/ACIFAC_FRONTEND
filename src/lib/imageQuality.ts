// Photos of paper forms are checked and cleaned up in the browser before they
// are sent to the AI: a blurry or dark photo is caught while the person is
// still holding the form, and the picture that is sent is cropped, straightened
// and given more contrast so the AI reads it in one go.

export interface ImageQuality {
  /** Average brightness, 0 (black) to 255 (white). */
  brightness: number;
  /** Variance of the Laplacian: high for sharp text, low for a blurred photo. */
  sharpness: number;
  /** What is wrong with the photo, in words; empty when it is fine. */
  problems: string[];
}

// Measured on the picture scaled to this width or height, so the limits below
// mean the same for every camera.
const MEASURE_EDGE = 800;
// Set on synthetic form photos: text blurred by 4 px or more (at 2200 px) and
// paper lit at about 40% or less are caught; normal phone photos pass.
const MIN_SHARPNESS = 60;
const MIN_BRIGHTNESS = 95;
const MAX_BRIGHTNESS = 245;
// Straightening: tilts up to this many degrees are found and corrected.
const MAX_SKEW_DEGREES = 6;

function context2d(canvas: HTMLCanvasElement) {
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas is not supported on this device.');
  return context;
}

function scaledCanvas(source: CanvasImageSource, width: number, height: number, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  context2d(canvas).drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// Grey levels (0-255) of a small copy of the picture.
function greyLevels(canvas: HTMLCanvasElement, edge = MEASURE_EDGE) {
  const small = scaledCanvas(canvas, canvas.width, canvas.height, edge);
  const { data } = context2d(small).getImageData(0, 0, small.width, small.height);
  const grey = new Float32Array(small.width * small.height);
  for (let index = 0; index < grey.length; index += 1) grey[index] = 0.299 * data[index * 4] + 0.587 * data[index * 4 + 1] + 0.114 * data[index * 4 + 2];
  return { grey, width: small.width, height: small.height };
}

export function assessImage(canvas: HTMLCanvasElement): ImageQuality {
  const { grey, width, height } = greyLevels(canvas);
  let sum = 0;
  for (const value of grey) sum += value;
  const brightness = sum / grey.length;

  let count = 0;
  let mean = 0;
  let squares = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const at = y * width + x;
      const laplacian = grey[at - 1] + grey[at + 1] + grey[at - width] + grey[at + width] - 4 * grey[at];
      count += 1;
      const delta = laplacian - mean;
      mean += delta / count;
      squares += delta * (laplacian - mean);
    }
  }
  const sharpness = count > 1 ? squares / (count - 1) : 0;

  const problems: string[] = [];
  if (brightness < MIN_BRIGHTNESS) problems.push('too dark');
  else if (brightness > MAX_BRIGHTNESS) problems.push('too bright or washed out');
  if (sharpness < MIN_SHARPNESS) problems.push('blurry');
  return { brightness: Math.round(brightness), sharpness: Math.round(sharpness), problems };
}

// The tilt of the text lines, in degrees: the angle at which the top and
// bottom edges of the writing and ruled lines line up into the sharpest rows.
// Edges, not dark pixels, so a dark table or background around the paper
// does not count.
export function estimateSkew(canvas: HTMLCanvasElement) {
  const { grey, width, height } = greyLevels(canvas, 700);
  const edges: number[] = [];
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 0; x < width; x += 1) if (Math.abs(grey[(y + 1) * width + x] - grey[(y - 1) * width + x]) > 50) edges.push(x, y);
  }
  if (edges.length < 800) return 0;
  // At most about 40 000 points, spread over the whole picture.
  const stride = Math.max(1, Math.round(edges.length / 2 / 40000));
  const points = stride === 1 ? edges : edges.filter((_, index) => Math.floor(index / 2) % stride === 0);

  const score = (degrees: number) => {
    const radians = (degrees * Math.PI) / 180;
    const [sin, cos] = [Math.sin(radians), Math.cos(radians)];
    const rows = new Map<number, number>();
    for (let index = 0; index < points.length; index += 2) {
      const row = Math.round(points[index + 1] * cos - points[index] * sin);
      rows.set(row, (rows.get(row) || 0) + 1);
    }
    let total = 0;
    for (const value of rows.values()) total += value * value;
    return total;
  };
  const best = (from: number, to: number, by: number) => {
    let angle = 0;
    let top = -1;
    for (let degrees = from; degrees <= to + 1e-9; degrees += by) {
      const value = score(degrees);
      if (value > top) { top = value; angle = degrees; }
    }
    return angle;
  };
  const coarse = best(-MAX_SKEW_DEGREES, MAX_SKEW_DEGREES, 0.5);
  return best(coarse - 0.5, coarse + 0.5, 0.1);
}

// The picture turned by -degrees on a white background, the same size.
function rotated(canvas: HTMLCanvasElement, degrees: number) {
  const output = document.createElement('canvas');
  output.width = canvas.width;
  output.height = canvas.height;
  const context = context2d(output);
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, output.width, output.height);
  context.translate(output.width / 2, output.height / 2);
  context.rotate((-degrees * Math.PI) / 180);
  context.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return output;
}

// Stretches the darkest 1% to black and the brightest 1% to white, so faint
// pencil and shadowed paper read clearly. Changes the canvas in place.
function boostContrast(canvas: HTMLCanvasElement) {
  const { grey } = greyLevels(canvas, 600);
  const histogram = new Uint32Array(256);
  for (const value of grey) histogram[Math.min(255, Math.round(value))] += 1;
  const percentile = (share: number) => {
    let seen = 0;
    for (let level = 0; level < 256; level += 1) {
      seen += histogram[level];
      if (seen >= grey.length * share) return level;
    }
    return 255;
  };
  const [low, high] = [percentile(0.01), percentile(0.99)];
  if (high - low < 40 || (low < 8 && high > 247)) return;
  const context = context2d(canvas);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const scale = 255 / (high - low);
  const { data } = image;
  for (let index = 0; index < data.length; index += 4) {
    data[index] = (data[index] - low) * scale;
    data[index + 1] = (data[index + 1] - low) * scale;
    data[index + 2] = (data[index + 2] - low) * scale;
  }
  context.putImageData(image, 0, 0);
}

/** The part of a picture to keep, in the picture's own pixels. */
export interface CropRect { x: number; y: number; width: number; height: number }

/** The picture (or the crop of it) scaled down to maxEdge. */
export function cropTo(source: CanvasImageSource, sourceWidth: number, sourceHeight: number, { maxEdge, crop }: { maxEdge: number; crop?: CropRect | null }) {
  const area = crop ?? { x: 0, y: 0, width: sourceWidth, height: sourceHeight };
  const scale = Math.min(1, maxEdge / Math.max(area.width, area.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(area.width * scale));
  canvas.height = Math.max(1, Math.round(area.height * scale));
  context2d(canvas).drawImage(source, area.x, area.y, area.width, area.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}

/** A picture ready for the AI: straightened (unless straighten is false) and with more contrast. */
export function enhance(canvas: HTMLCanvasElement, { straighten = true } = {}) {
  let output = canvas;
  if (straighten) {
    const skew = estimateSkew(canvas);
    if (Math.abs(skew) >= 0.3) output = rotated(canvas, skew);
  }
  if (output === canvas) {
    output = document.createElement('canvas');
    output.width = canvas.width;
    output.height = canvas.height;
    context2d(output).drawImage(canvas, 0, 0);
  }
  boostContrast(output);
  return output;
}

/**
 * The region of a video that is inside a frame drawn over it, in the video's
 * own pixels, with a small margin. The video is shown with object-fit: contain.
 */
export function frameCrop(video: HTMLVideoElement, frame: HTMLElement, margin = 0.04): CropRect | null {
  const [box, inner] = [video.getBoundingClientRect(), frame.getBoundingClientRect()];
  const { videoWidth, videoHeight } = video;
  if (!videoWidth || !videoHeight || !box.width || !box.height) return null;
  const scale = Math.min(box.width / videoWidth, box.height / videoHeight);
  const left = box.left + (box.width - videoWidth * scale) / 2;
  const top = box.top + (box.height - videoHeight * scale) / 2;
  const padX = inner.width * margin;
  const padY = inner.height * margin;
  const x = Math.max(0, (inner.left - padX - left) / scale);
  const y = Math.max(0, (inner.top - padY - top) / scale);
  const right = Math.min(videoWidth, (inner.right + padX - left) / scale);
  const bottom = Math.min(videoHeight, (inner.bottom + padY - top) / scale);
  if (right - x < 50 || bottom - y < 50) return null;
  return { x, y, width: right - x, height: bottom - y };
}

export function canvasToJpeg(canvas: HTMLCanvasElement, quality = 0.9) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('The picture could not be prepared.'))), 'image/jpeg', quality));
}

/**
 * An uploaded picture of a form, checked and prepared like a camera capture
 * (no crop: the whole picture is the form). PDFs are sent as they are.
 */
export async function prepareImageFile(file: File, maxEdge: number): Promise<{ file: File; quality: ImageQuality | null }> {
  if (!file.type.startsWith('image/')) return { file, quality: null };
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = cropTo(bitmap, bitmap.width, bitmap.height, { maxEdge });
    const quality = assessImage(canvas);
    const name = file.name.replace(/\.[^.]+$/, '') || 'scan';
    return { file: new File([await canvasToJpeg(enhance(canvas))], `${name}.jpg`, { type: 'image/jpeg' }), quality };
  } finally {
    bitmap.close();
  }
}

export const describeProblems = (problems: string[]) => (problems.length > 1 ? `${problems.slice(0, -1).join(', ')} and ${problems[problems.length - 1]}` : problems[0] || '');
