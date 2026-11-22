import { getGalleryStore, type GalleryItem } from "./vrchat-media-store";

export type BirthdayPhoto = Pick<GalleryItem, "id" | "alt" | "src" | "thumbnail">;

export async function birthdayPhotos(): Promise<BirthdayPhoto[]> {
  const rows = await getGalleryStore().list("birthday");
  return rows.map(({ id, alt, src, thumbnail }) => ({ id, alt, src, thumbnail }))
    .sort((a, b) => a.alt.localeCompare(b.alt, "ko", { numeric: true }) || a.id.localeCompare(b.id));
}

export async function birthdayArtwork() {
  const rows = await getGalleryStore().list("birthday-art");
  return Object.fromEntries(rows.map(item => [item.alt, item.src]));
}
