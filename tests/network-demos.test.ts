import { describe, expect, it } from "vitest";
import { findBestRoute, getRoutingSimulation, getVlanSimulation, ROUTES, type RouteEntry, type VlanSimulationInput } from "@/lib/network-demos";

const vlanInput: VlanSimulationInput = {
  scenario: "same-vlan", sourceVlan: 10, linkMode: "trunk", accessVlan: 10,
  nativeVlan: 1, allowVlan10: true, allowVlan20: true,
};

describe("VLAN forwarding and on-wire tags", () => {
  it.each([10, 20] as const)("preserves VLAN %i across two switches and removes tags before the PC", (sourceVlan) => {
    const result = getVlanSimulation({ ...vlanInput, sourceVlan });
    expect(result.success).toBe(true);
    expect(result.sourceId).toBe(`pc-a${sourceVlan}`);
    expect(result.destinationId).toBe(`pc-b${sourceVlan}`);
    expect(result.steps.flatMap((step) => step.edgeIds)).toEqual([`link-a${sourceVlan}`, "trunk", `link-b${sourceVlan}`]);
    expect(result.steps.find((step) => step.id === "ingress-access")?.wireFormat).toBe("untagged");
    expect(result.steps.find((step) => step.id === "uplink")).toMatchObject({ wireFormat: "802.1Q", frameVlan: sourceVlan });
    expect(result.steps.find((step) => step.id === "egress-access")?.wireFormat).toBe("untagged");
    expect(result.steps.at(-1)).toMatchObject({ state: "success", edgeIds: [] });
  });

  it.each([10, 20] as const)("cannot deliver VLAN %i to the opposite VLAN even when both are allowed", (sourceVlan) => {
    const result = getVlanSimulation({ ...vlanInput, scenario: "different-vlan", sourceVlan });
    expect(result.success).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ id: "blocked-vlan", state: "blocked", nodeIds: ["switch-b"], edgeIds: [] });
    expect(result.steps.flatMap((step) => step.nodeIds)).not.toContain(result.destinationId);
    expect(result.steps.flatMap((step) => step.edgeIds)).toEqual([`link-a${sourceVlan}`, "trunk"]);
  });

  it.each([10, 20] as const)("blocks only the excluded VLAN %i before crossing the trunk", (sourceVlan) => {
    const input = { ...vlanInput, sourceVlan, allowVlan10: sourceVlan !== 10, allowVlan20: sourceVlan !== 20 };
    const blocked = getVlanSimulation(input);
    expect(blocked.success).toBe(false);
    expect(blocked.steps.at(-1)?.id).toBe("blocked-uplink");
    expect(blocked.steps.flatMap((step) => step.edgeIds)).not.toContain("trunk");
    expect(getVlanSimulation({ ...input, sourceVlan: sourceVlan === 10 ? 20 : 10 }).success).toBe(true);
  });

  it("sends native VLAN 10 untagged but still enforces the allowed VLAN list", () => {
    const native = { ...vlanInput, nativeVlan: 10 as const };
    const result = getVlanSimulation(native);
    expect(result.success).toBe(true);
    expect(result.steps.find((step) => step.id === "uplink")).toMatchObject({ wireFormat: "untagged", frameVlan: 10 });
    expect(getVlanSimulation({ ...native, allowVlan10: false }).success).toBe(false);
    expect(getVlanSimulation({ ...native, sourceVlan: 20 }).steps.find((step) => step.id === "uplink")?.wireFormat).toBe("802.1Q");
  });

  it.each([10, 20] as const)("an access inter-switch link carries only its configured VLAN %i, untagged", (accessVlan) => {
    const input = { ...vlanInput, linkMode: "access" as const, accessVlan, sourceVlan: accessVlan, allowVlan10: false, allowVlan20: false };
    const result = getVlanSimulation(input);
    expect(result.success).toBe(true);
    expect(result.steps.find((step) => step.id === "uplink")?.wireFormat).toBe("untagged");
    expect(getVlanSimulation({ ...input, sourceVlan: accessVlan === 10 ? 20 : 10 }).steps.at(-1)?.id).toBe("blocked-uplink");
    expect(getVlanSimulation({ ...input, scenario: "different-vlan" }).success).toBe(false);
  });
});

function route(id: string, destination: string): RouteEntry {
  return { id, destination, nextHop: "직접 연결", interface: "test", label: id };
}

describe("IPv4 longest-prefix matching", () => {
  it("selects /16 over an overlapping /8 regardless of table order", () => {
    expect(findBestRoute("10.20.3.7", ROUTES)?.id).toBe("route-wan-b");
    expect(findBestRoute("10.20.3.7", [...ROUTES].reverse())?.id).toBe("route-wan-b");
    expect(findBestRoute("10.21.3.7", ROUTES)?.id).toBe("route-wan-a");
  });

  it("matches subnet boundaries without admitting addresses immediately outside", () => {
    const routes = [route("subnet", "192.168.10.0/24")];
    expect(findBestRoute("192.168.10.0", routes)?.id).toBe("subnet");
    expect(findBestRoute("192.168.10.255", routes)?.id).toBe("subnet");
    expect(findBestRoute("192.168.9.255", routes)).toBeUndefined();
    expect(findBestRoute("192.168.11.0", routes)).toBeUndefined();
  });

  it("handles /0, /32 and high unsigned IPv4 values without signed-bit errors", () => {
    const routes = [route("default", "0.0.0.0/0"), route("upper", "128.0.0.0/1"), route("host", "255.255.255.255/32")];
    expect(findBestRoute("0.0.0.0", routes)?.id).toBe("default");
    expect(findBestRoute("127.255.255.255", routes)?.id).toBe("default");
    expect(findBestRoute("128.0.0.0", routes)?.id).toBe("upper");
    expect(findBestRoute("255.255.255.254", routes)?.id).toBe("upper");
    expect(findBestRoute("255.255.255.255", routes)?.id).toBe("host");
  });

  it("masks host bits in CIDR input and retains input order for equal prefixes", () => {
    const routes = [route("first", "192.168.10.99/24"), route("second", "192.168.10.0/24")];
    expect(findBestRoute("192.168.10.42", routes)?.id).toBe("first");
  });

  it.each(["", "1.2.3", "1.2.3.4.5", "256.1.1.1", "-1.2.3.4", "1.2.3.4 ", "1.2.3.4\n", "1\n.2.3.4", "01.2.3.4", "1e2.2.3.4", "::1", "1..3.4"])("rejects malformed IPv4 %j", (address) => {
    expect(() => findBestRoute(address, ROUTES)).toThrow(RangeError);
  });

  it.each(["10.0.0.0", "10.0.0.0/33", "10.0.0.0/-1", "10.0.0.0/08", "10.0.0.0/8/1", "256.0.0.0/8", "10.0.0.0/NaN", "10.0.0.0/8\n"])("rejects malformed prefix %j", (prefix) => {
    expect(() => findBestRoute("10.20.3.7", [route("invalid", prefix)])).toThrow(RangeError);
  });

  it("returns no match for an empty table or an unmatched destination without /0", () => {
    expect(findBestRoute("203.0.113.9", [])).toBeUndefined();
    expect(findBestRoute("203.0.113.9", ROUTES.filter((entry) => entry.id !== "route-default"))).toBeUndefined();
  });
});

describe("routing simulation outcomes", () => {
  it("forwards through exactly the selected output link", () => {
    const result = getRoutingSimulation("10.20.3.7", true);
    expect(result.success).toBe(true);
    expect(result.route?.id).toBe("route-wan-b");
    expect(result.steps.flatMap((step) => step.edgeIds)).toEqual(["client-router", "route-wan-b"]);
    expect(result.steps.at(-1)).toMatchObject({ state: "success", edgeIds: [] });
  });

  it("uses default only as fallback, and drops at the router when default is removed", () => {
    expect(getRoutingSimulation("203.0.113.9", true).route?.id).toBe("route-default");
    const result = getRoutingSimulation("203.0.113.9", false);
    expect(result.success).toBe(false);
    expect(result.route).toBeUndefined();
    expect(result.steps.flatMap((step) => step.edgeIds)).toEqual(["client-router"]);
    expect(result.steps.at(-1)).toMatchObject({ state: "blocked", nodeIds: ["router"], edgeIds: [] });
    expect(getRoutingSimulation("192.168.10.42", false).route?.id).toBe("route-lan-a");
  });

  it("exposes an invalid destination as a readable blocked state without sending", () => {
    const result = getRoutingSimulation("999.1.1.1", true);
    expect(result.success).toBe(false);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]).toMatchObject({ id: "invalid", state: "blocked", edgeIds: [] });
  });
});
