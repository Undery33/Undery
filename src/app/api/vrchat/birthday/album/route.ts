import { birthdayArtwork, birthdayPhotos } from "@/lib/birthday-album";
import { galleryFailure, galleryJson } from "@/lib/vrchat-media-http";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const [photos, art] = await Promise.all([birthdayPhotos(), birthdayArtwork()]);
    return galleryJson({ photos, art });
  } catch (error) { return galleryFailure(error); }
}
