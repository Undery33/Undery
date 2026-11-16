import type { TechnologyDemo as DemoName } from "@/lib/article-demos";
import { VlanDemo } from "./network-vlan-demo";
import { RoutingDemo } from "./network-routing-demo";
import { DnsDemo } from "./server-dns-demo";
import { DhcpDemo } from "./server-dhcp-demo";
import { CnnDemo } from "./ai-cnn-demo";

export function TechnologyDemo({ name }: { name: DemoName }) {
  switch (name) {
    case "vlan": return <VlanDemo />;
    case "routing": return <RoutingDemo />;
    case "dns": return <DnsDemo />;
    case "dhcp": return <DhcpDemo />;
    case "cnn": return <CnnDemo />;
  }
}
