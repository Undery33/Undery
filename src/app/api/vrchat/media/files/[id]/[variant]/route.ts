import { galleryFile } from "@/lib/vrchat-media-http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await context.params;
  return galleryFile(request, id, variant);
}

export const HEAD = GET;
