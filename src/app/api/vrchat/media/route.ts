import { requireAdminMutation } from "@/lib/admin-auth";
import { MemoError } from "@/lib/birthday-memo-validation";
import { galleryFailure, galleryJson } from "@/lib/vrchat-media-http";
import { getGalleryStore } from "@/lib/vrchat-media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try { return galleryJson(await getGalleryStore().list()); }
  catch (error) { return galleryFailure(error); }
}

let uploading = false;

export async function DELETE(request: Request) {
  try {
    await requireAdminMutation(request);
    const ids = new URL(request.url).searchParams.getAll("id");
    if (ids.length !== 1 || !ids[0] || ids[0].length > 128) {
      throw new MemoError("invalid_id", 400, "삭제할 사진 한 장을 선택해 주세요.");
    }
    await getGalleryStore().removePhoto(ids[0]);
    return galleryJson({ ok: true });
  } catch (error) { return galleryFailure(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdminMutation(request);
    if (uploading) throw new MemoError("upload_busy", 429, "다른 파일을 처리하고 있습니다. 잠시 후 다시 시도해 주세요.");
    uploading = true;
    try {
      const { item, created } = await getGalleryStore().upload(request);
      return galleryJson({ ok: true, item }, created ? 201 : 200);
    } finally { uploading = false; }
  } catch (error) { return galleryFailure(error); }
}
