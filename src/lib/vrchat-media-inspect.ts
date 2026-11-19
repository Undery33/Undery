import { execFile } from "node:child_process";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import exifr from "exifr";
import sharp from "sharp";
import { MemoError } from "./birthday-memo-validation";

// Originals sit in a private staging directory until renamed. Do not retain
// decoder file handles or decoded source images after generating the preview.
sharp.cache(false);
sharp.concurrency(1);

export const PHOTO_MAX_BYTES = 32 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 256 * 1024 * 1024;
const run = promisify(execFile);
const invalid = () => new MemoError("invalid_media", 422, "파일을 읽을 수 없습니다. 올바른 사진이나 영상을 선택해 주세요.");
const unsupported = () => new MemoError("unsupported_media", 415, "JPEG, PNG, WebP 사진 또는 MP4, WebM 영상을 선택해 주세요.");

export function calendarDate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value) || value.startsWith("0000")) return null;
  const d = new Date(value + "T00:00:00Z");
  return Number.isFinite(d.valueOf()) && d.toISOString().slice(0, 10) === value ? value : null;
}

function recordedDate(value: unknown) {
  const match = typeof value === "string" && /^(\d{4})[:-](\d{2})[:-](\d{2})(?:[T ]|$)/u.exec(value);
  return match ? calendarDate([match[1],match[2],match[3]].join("-")) : null;
}

async function identify(path: string) {
  const file = await open(path, "r");
  const header = Buffer.alloc(4096);
  let size: number;
  try { size = (await file.read(header)).bytesRead; } finally { await file.close(); }
  const data = header.subarray(0, size);
  if (data.subarray(0, 3).equals(Buffer.from([255,216,255]))) return "jpeg";
  if (data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return "png";
  if (data.toString("ascii", 0, 4) === "RIFF" && data.toString("ascii", 8, 12) === "WEBP") return "webp";
  if (data.toString("ascii", 4, 8) === "ftyp" && /^(?:iso[m2-9]|mp4[12]|avc1|av01|dash|M4V )$/u.test(data.toString("ascii", 8, 12))) return "mp4";
  if (data.subarray(0, 4).equals(Buffer.from([26,69,223,163])) && data.includes(Buffer.from([0x42,0x82,0x84,119,101,98,109]))) return "webm";
  throw unsupported();
}

export type MediaInfo = {
  type: "photo" | "video";
  mime: string;
  width: number;
  height: number;
  date: string | null;
};

type VideoStream = {
  width?: number; height?: number; sample_aspect_ratio?: string;
  disposition?: { attached_pic?: number };
  side_data_list?: { rotation?: number }[];
  tags?: { creation_time?: string };
};

async function inspectVideo(input: string, thumbnail: string, kind: "mp4" | "webm"): Promise<MediaInfo> {
  // Pin the demuxer and forbid network protocols, including nested playlist inputs.
  const inputArgs = ["-v", "error", "-max_alloc", "67108864", "-max_pixels", String(4096 * 2160), "-threads", "1",
    "-protocol_whitelist", "file", "-probesize", "4000000",
    "-analyzeduration", "4000000", "-f", kind === "mp4" ? "mov" : "matroska"];
  const options = { timeout: 30000, killSignal: "SIGKILL" as const, maxBuffer: 65536, windowsHide: true };
  try {
    const probe = await run("ffprobe", [...inputArgs, "-select_streams", "v:0", "-show_entries",
      "stream=width,height,sample_aspect_ratio:stream_disposition=attached_pic:stream_side_data=rotation:stream_tags=creation_time:format_tags=creation_time",
      "-of", "json", "-i", input], options);
    const result = JSON.parse(probe.stdout) as { streams?: VideoStream[]; format?: { tags?: { creation_time?: string } } };
    const video = result.streams?.[0];
    if (!video?.width || !video.height || video.disposition?.attached_pic) throw invalid();
    if (Math.max(video.width, video.height) > 8192 || video.width * video.height > 4096 * 2160) {
      throw new MemoError("video_too_large", 422, "영상은 한 프레임당 최대 4096×2160 화소까지 등록할 수 있습니다.");
    }
    const [sarX, sarY] = (video.sample_aspect_ratio || "1:1").split(":").map(Number);
    let width = sarX > 0 && sarY > 0 ? Math.round(video.width * sarX / sarY) : video.width;
    let height = video.height;
    if (!Number.isSafeInteger(width) || width <= 0 || width > 16384) throw invalid();
    if (Math.abs(video.side_data_list?.find(entry => entry.rotation !== undefined)?.rotation ?? 0) % 180 === 90) {
      [width, height] = [height, width];
    }
    const ratio = Math.min(1, 720 / Math.max(width, height));
    const target = [width, height].map(side => Math.max(1, Math.round(side * ratio)));
    await run("ffmpeg", ["-nostdin", ...inputArgs, "-i", input, "-map", "0:v:0",
      "-an", "-sn", "-dn", "-frames:v", "1", "-filter_threads", "1", "-vf", "scale=" + target.join(":") + ",setsar=1",
      "-threads", "1", "-c:v", "libwebp", "-quality", "78", thumbnail], options);
    // Some decoders exit successfully without producing a frame.
    const thumb = await sharp(thumbnail).metadata();
    if (thumb.format !== "webp" || !thumb.width || !thumb.height) throw invalid();
    return { type: "video", mime: "video/" + kind, width, height,
      date: recordedDate(result.format?.tags?.creation_time) ?? recordedDate(video.tags?.creation_time) };
  } catch (error) {
    if (error instanceof MemoError) throw error;
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && (error as NodeJS.ErrnoException).syscall?.startsWith("spawn")) {
      throw new MemoError("processor_unavailable", 503, "영상 처리기를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.");
    }
    throw invalid();
  }
}

export async function inspectMedia(directory: string, bytes: number): Promise<MediaInfo> {
  const input = join(directory, "original");
  const thumbnail = join(directory, "thumbnail.webp");
  const kind = await identify(input);
  if (kind === "mp4" || kind === "webm") return inspectVideo(input, thumbnail, kind);
  if (bytes > PHOTO_MAX_BYTES) throw new MemoError("photo_too_large", 413, "사진은 32 MiB까지 등록할 수 있습니다.");
  try {
    const image = sharp(input, { limitInputPixels: 40_000_000, failOn: "error", sequentialRead: true });
    const metadata = await image.metadata();
    if (metadata.format !== kind || !metadata.width || !metadata.height) throw invalid();
    const { width, height } = metadata.autoOrient;
    const raw = metadata.exif;
    const tiff = raw?.toString("ascii", 0, 6) === "Exif\0\0" ? raw.subarray(6) : raw;
    const exif = tiff && await exifr.parse(tiff, { pick: ["DateTimeOriginal"], reviveValues: false }).catch(() => undefined);
    await image.autoOrient().resize({ width: 720, height: 720, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 }).timeout({ seconds: 30 }).toFile(thumbnail);
    return { type: "photo", mime: "image/" + kind, width, height, date: recordedDate(exif?.DateTimeOriginal) };
  } catch (error) {
    if (error instanceof MemoError) throw error;
    throw invalid();
  }
}
