export const site = {
  name: "Undery",
  description: "기술과 취미를 기록하는 개인 공간",
};

export function siteOrigin(): URL {
  const origin = new URL(process.env.SITE_URL || "http://localhost:3000");
  if (!["http:", "https:"].includes(origin.protocol) || origin.username || origin.password) {
    throw new Error("SITE_URL must be an HTTP(S) origin without credentials.");
  }
  return new URL(origin.origin);
}

export const publicSections = [
  { href: "/computer", label: "Computer", description: "개발하며 배운 내용을 Markdown으로 기록합니다.", status: "기술 기록" },
  { href: "/vrchat", label: "VRChat", description: "월드와 아바타, 함께한 순간을 담을 공간입니다.", status: "준비 중" },
  { href: "/valorant", label: "Valorant", description: "플레이 기록과 사진, 영상을 모을 공간입니다.", status: "준비 중" },
] as const;
