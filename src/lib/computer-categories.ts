/** Shared category metadata. Keep this module free of server-only dependencies. */
export const computerCategories = [
  {
    id: "server",
    label: "서버",
    english: "Server",
    headline: "서비스가 실행되는 기반",
    description: "운영체제와 자원을 이해하고 서비스를 안정적으로 운영하는 과정을 기록합니다.",
    topics: ["Linux", "가상화 · 컨테이너", "운영 · 배포"],
  },
  {
    id: "network",
    label: "네트워크",
    english: "Network",
    headline: "시스템을 잇는 경로",
    description: "주소와 연결에서 데이터의 이동까지. 시스템 사이의 통신을 따라갑니다.",
    topics: ["TCP/IP", "라우팅 · 스위칭", "DNS · HTTP"],
  },
  {
    id: "ai",
    label: "AI",
    english: "Artificial Intelligence",
    headline: "데이터에서 확장되는 가능성",
    description: "모델과 추론을 이해하고 지능을 활용하는 방법을 탐색합니다.",
    topics: ["머신러닝", "모델 · 추론", "AI 활용"],
  },
] as const;

export type ComputerCategory = (typeof computerCategories)[number]["id"];

export function getComputerCategory(value: string | undefined) {
  return computerCategories.find((category) => category.id === value);
}
