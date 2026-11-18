export const linuxTopics = ["docker", "jenkins", "kubernetes"] as const;
export type LinuxTopic = (typeof linuxTopics)[number];
export const linuxTopicTitles: Record<LinuxTopic, string> = {
  docker: "Docker", jenkins: "Jenkins", kubernetes: "Kubernetes (K8s)",
};

export function isLinuxTopic(value: string | null | undefined): value is LinuxTopic {
  return linuxTopics.some(topic => topic === value);
}
