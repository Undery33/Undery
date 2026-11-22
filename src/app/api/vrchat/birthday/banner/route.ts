import { birthdayPhotos } from "@/lib/birthday-album";
import { galleryFailure } from "@/lib/vrchat-media-http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const photos = await birthdayPhotos();
    const banner = photos.find(photo => photo.alt === "VRChat_2026-11-22_02-48-17.447_3840x2160.png");
    return new Response(null, banner
      ? { status: 307, headers: { Location: banner.src, "Cache-Control": "no-cache" } }
      : { status: 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return galleryFailure(error); }
}
