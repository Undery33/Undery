/** Shared category metadata. Keep this module free of server-only dependencies. */
export const computerCategories = [
  {
    id: "server",
    label: "서버",
    english: "Server",
    headline: "인프라를 구성하는 서비스",
    description: "DNS와 DHCP를 비롯한 서버 서비스의 구성과 동작, 운영 방법을 기록합니다.",
    topics: ["DNS · DHCP", "웹 · 프록시", "가상화 · 컨테이너"],
  },
  {
    id: "network",
    label: "네트워크",
    english: "Network",
    headline: "연결을 설계하는 기술",
    description: "VLAN과 라우팅을 중심으로 트래픽을 분리하고 전달하는 방법을 살펴봅니다.",
    topics: ["VLAN · 트렁크", "라우팅 · 스위칭", "이중화 · VPN"],
  },
  {
    id: "ai",
    label: "AI",
    english: "Artificial Intelligence",
    headline: "모델이 동작하는 원리",
    description: "CNN을 비롯한 AI 모델의 구조와 연산을 직접 조작하며 살펴봅니다.",
    topics: ["CNN · 특징 추출", "모델 · 추론", "학습 · 최적화"],
  },
] as const;

export type ComputerCategory = (typeof computerCategories)[number]["id"];

export function getComputerCategory(value: string | undefined) {
  return computerCategories.find((category) => category.id === value);
}
