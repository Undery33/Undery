/** Shared category metadata. Keep this module free of server-only dependencies. */
export const computerCategories = [
  { id: "router", label: "Router", english: "Router" },
  { id: "switch", label: "Switch", english: "Switch" },
  { id: "asa", label: "ASA", english: "ASA" },
  { id: "server", label: "Server", english: "Server" },
  { id: "linux", label: "Linux", english: "Linux" },
  { id: "windows-server", label: "Windows Server", english: "Windows Server" },
] as const;

export type ComputerCategory = (typeof computerCategories)[number]["id"];

export function getComputerCategory(value: string | undefined) {
  return computerCategories.find((category) => category.id === value);
}
