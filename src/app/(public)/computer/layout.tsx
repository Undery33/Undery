import { ComputerThemeToggle } from "@/components/computer/computer-theme-toggle";

export default function ComputerLayout({ children }: { children: React.ReactNode }) {
  return <><ComputerThemeToggle />{children}</>;
}
