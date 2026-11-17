import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROUTING_INPUT,
  getClassicEigrpMetric,
  getRoutingMethodSimulation,
  type RoutingLabInput,
  type RoutingMethod,
} from "@/lib/routing-methods";

function simulate(overrides: Partial<RoutingLabInput> = {}) {
  return getRoutingMethodSimulation({ ...DEFAULT_ROUTING_INPUT, ...overrides });
}

const methods: RoutingMethod[] = ["static", "rip", "ospf", "eigrp", "isis", "bgp", "pbr"];

describe("static routing and floating routes", () => {
  it("follows the configured next hop independently of link cost or hop count", () => {
    const result = simulate({ method: "static", staticPath: "lower", upperCost: 1, lowerCost: 60 });
    expect(result.selectedPath).toBe("lower");
    expect(result.success).toBe(true);
    expect(result.candidates.find((candidate) => candidate.id === "lower")).toMatchObject({ metric: 1, selected: true });
    expect(result.candidates.find((candidate) => candidate.id === "upper")).toMatchObject({ available: false, metric: null });
  });

  it("does not discover an unconfigured alternate after its own interface goes down", () => {
    const result = simulate({ method: "static", failure: "upper-local" });
    expect(result.selectedPath).toBeNull();
    expect(result.success).toBe(false);
    expect(result.steps.at(-1)).toMatchObject({ id: "drop-no-route", nodeIds: ["r1"] });
    expect(result.forwardingPath).toEqual(["client", "r1"]);
  });

  it("installs the higher-AD floating route only after the primary becomes locally invalid", () => {
    const initial = simulate({ method: "static", floatingBackup: true });
    const failed = simulate({ method: "static", floatingBackup: true, failure: "upper-local" });
    expect(initial.selectedPath).toBe("upper");
    expect(failed.selectedPath).toBe("lower");
    expect(failed.success).toBe(true);
    expect(failed.candidates.find((candidate) => candidate.id === "lower")).toMatchObject({ metric: 10, selected: true });
  });

  it("preserves a reachable R1 next hop during remote failure and drops at R2 instead of magically failing over", () => {
    const result = simulate({ method: "static", floatingBackup: true, failure: "upper-remote" });
    expect(result.selectedPath).toBe("upper");
    expect(result.success).toBe(false);
    expect(result.candidates.find((candidate) => candidate.id === "upper")).toMatchObject({ available: true, endToEndAvailable: false, selected: true });
    expect(result.forwardingPath).toEqual(["client", "r1", "r2"]);
    expect(result.steps.at(-1)).toMatchObject({ id: "drop-remote", nodeIds: ["r2"], edgeIds: [] });
    expect(result.steps.flatMap((step) => step.edgeIds)).not.toContain("r2-r4");
  });
});

describe("RIP, OSPF and IS-IS selection", () => {
  it("makes RIP favor fewer router hops while SPF can favor a longer path with lower cost", () => {
    const rip = simulate({ method: "rip", upperCost: 40, lowerCost: 10 });
    const ospf = simulate({ method: "ospf", upperCost: 40, lowerCost: 10 });
    expect(rip.selectedPath).toBe("upper");
    expect(rip.candidates.map((candidate) => candidate.metric)).toEqual([2, 3]);
    expect(ospf.selectedPath).toBe("lower");
    expect(ospf.candidates.map((candidate) => candidate.metric)).toEqual([81, 31]);
  });

  it.each(["ospf", "isis"] as const)("keeps both %s equal-cost routes and illustrates one packet", (method) => {
    const result = simulate({ method, upperCost: 15, lowerCost: 10 });
    expect(result.equalCostPaths).toEqual(["upper", "lower"]);
    expect(result.candidates.map((candidate) => candidate.metric)).toEqual([31, 31]);
    expect(result.candidates.every((candidate) => candidate.selected)).toBe(true);
    expect(result.selectedPath).toBe("upper");
    expect(result.forwardingPath).toEqual(["client", "r1", "r2", "r4", "destination"]);
  });

  it.each(["rip", "ospf", "isis"] as const)("converged %s uses the surviving branch after a remote failure", (method) => {
    const result = simulate({ method, failure: "upper-remote" });
    expect(result.selectedPath).toBe("lower");
    expect(result.success).toBe(true);
    expect(result.equalCostPaths).toEqual(["lower"]);
    expect(result.steps.flatMap((step) => step.edgeIds)).not.toContain("r2-r4");
  });

  it("marks withdrawn RIP candidates unreachable with metric16", () => {
    const result = simulate({ method: "rip", failure: "upper-local" });
    expect(result.candidates[0]).toMatchObject({ available: false, metric: 16 });
  });
});

describe("EIGRP metric decisions", () => {
  it("uses scaled minimum bandwidth and total configured delay with default K values", () => {
    expect(getClassicEigrpMetric(100_000, 200)).toBe(30_720);
    expect(getClassicEigrpMetric(10_000, 300)).toBe(263_680);
    // Cisco's classic example: BW128kbit/s, total delay84,000 microseconds.
    expect(getClassicEigrpMetric(128, 84_000)).toBe(22_150_400);
    expect(simulate({ method: "eigrp" }).selectedPath).toBe("upper");
  });

  it("can choose the three-hop branch when its composite metric is lower", () => {
    const result = simulate({ method: "eigrp", upperBandwidth: 10_000, lowerBandwidth: 100_000 });
    expect(result.selectedPath).toBe("lower");
    expect(result.candidates.map((candidate) => candidate.metric)).toEqual([261_120, 33_280]);
  });

  it("lets configured delay determine the result when bandwidths are equal", () => {
    const result = simulate({ method: "eigrp", upperBandwidth: 100_000, lowerBandwidth: 100_000, upperDelay: 1000, lowerDelay: 300 });
    expect(result.selectedPath).toBe("lower");
  });

  it("does not imply a feasible successor or instantaneous reroute from aggregate metrics", () => {
    const result = simulate({ method: "eigrp", failure: "upper-remote" });
    expect(result.selectedPath).toBe("lower");
    expect(result.limitations.join(" ")).toContain("feasible successor 판정");
    expect(result.steps.find((step) => step.id === "update")?.detail).toContain("즉시 우회 여부를 뜻하지 않습니다");
  });
});

describe("BGP policy and PBR", () => {
  it("prefers shorter AS_PATH only after equal LOCAL_PREF and equal higher-priority attributes", () => {
    const result = simulate({ method: "bgp" });
    expect(result.selectedPath).toBe("upper");
    expect(result.candidates.map((candidate) => candidate.asPath)).toEqual([[65010, 65040], [65020, 65030, 65040]]);
    expect(result.limitations.join(" ")).toContain("WEIGHT=0");
  });

  it("lets higher LOCAL_PREF beat a shorter AS_PATH and ignores OSPF cost", () => {
    const result = simulate({ method: "bgp", upperLocalPref: 100, lowerLocalPref: 200, upperCost: 1, lowerCost: 60 });
    expect(result.selectedPath).toBe("lower");
    expect(result.success).toBe(true);
    expect(result.equalCostPaths).toEqual(["lower"]);
  });

  it("excludes the unavailable BGP advertisement after modeled withdraw processing", () => {
    const result = simulate({ method: "bgp", failure: "upper-remote", upperLocalPref: 300, lowerLocalPref: 100 });
    expect(result.selectedPath).toBe("lower");
    expect(result.candidates[0].reason).toContain("withdraw");
  });

  it("applies PBR to matching traffic and normal upper-path routing to unmatched traffic", () => {
    expect(simulate({ method: "pbr", policyMatch: true, policyPath: "lower" }).selectedPath).toBe("lower");
    expect(simulate({ method: "pbr", policyMatch: false, policyPath: "lower" }).selectedPath).toBe("upper");
  });

  it.each([true, false])("classifies PBR traffic in the data plane only after reception (match=%s)", (policyMatch) => {
    const result = simulate({ method: "pbr", policyMatch });
    const receiveIndex = result.steps.findIndex((step) => step.id === "receive");
    const policyIndex = result.steps.findIndex((step) => step.id === "policy");
    const forwardIndex = result.steps.findIndex((step) => step.id.startsWith("forward-"));
    expect(result.steps[0]).toMatchObject({ id: "rib", frameLabel: "CONTROL PLANE · 데이터 전송 전" });
    expect(policyIndex).toBe(receiveIndex + 1);
    expect(forwardIndex).toBeGreaterThan(policyIndex);
    expect(result.steps[policyIndex]).toMatchObject({ nodeIds: ["r1"], edgeIds: [], state: "moving", frameLabel: "DATA PLANE · PBR" });
    expect(result.steps[policyIndex].frameLabel).not.toContain("CONTROL PLANE");
  });

  it("does not use an unmatched policy as an automatic backup for a missing ordinary route", () => {
    const result = simulate({ method: "pbr", policyMatch: false, policyPath: "lower", failure: "upper-local" });
    expect(result.selectedPath).toBeNull();
    expect(result.success).toBe(false);
    expect(simulate({ method: "pbr", policyMatch: true, policyPath: "lower", failure: "upper-local" }).selectedPath).toBe("lower");
  });

  it("does not infer remote reachability from a locally resolved PBR next hop", () => {
    const result = simulate({ method: "pbr", policyMatch: true, policyPath: "upper", failure: "upper-remote" });
    expect(result.selectedPath).toBe("upper");
    expect(result.success).toBe(false);
    expect(result.forwardingPath).toEqual(["client", "r1", "r2"]);
  });
});

describe("physical path and input boundaries", () => {
  it.each(methods)("%s never moves a packet across a failed link and fails when both first hops are down", (method) => {
    const result = simulate({ method, failure: "both", floatingBackup: true });
    expect(result.success).toBe(false);
    expect(result.selectedPath).toBeNull();
    expect(result.steps.flatMap((step) => step.edgeIds)).toEqual(["client-r1"]);
    expect(result.steps.at(-1)?.state).toBe("blocked");
  });

  it.each(methods)("%s separates control-plane setup from data packet movement", (method) => {
    const result = simulate({ method });
    const receiveIndex = result.steps.findIndex((step) => step.id === "receive");
    expect(receiveIndex).toBeGreaterThan(0);
    expect(result.steps.slice(0, receiveIndex).every((step) => step.edgeIds.length === 0 && step.state === "ready" && step.frameLabel.startsWith("CONTROL PLANE"))).toBe(true);
    expect(result.steps.at(-1)?.state).toBe("success");
    expect(result.steps.flatMap((step) => step.edgeIds).at(-1)).toBe("r4-destination");
  });

  it.each([
    { upperCost: 0 }, { lowerCost: 1.5 }, { upperCost: Infinity },
    { upperBandwidth: 0 }, { lowerBandwidth: NaN },
    { upperDelay: -10 }, { lowerDelay: 15 },
    { upperLocalPref: -1 }, { lowerLocalPref: 4_294_967_296 },
  ])("rejects invalid protocol numbers %j", (overrides) => {
    expect(() => simulate(overrides)).toThrow(RangeError);
  });

  it("rejects unsupported runtime identifiers and non-boolean switches", () => {
    expect(() => simulate({ method: "fake" as RoutingMethod })).toThrow(RangeError);
    expect(() => simulate({ failure: "fake" as RoutingLabInput["failure"] })).toThrow(RangeError);
    expect(() => simulate({ staticPath: "fake" as RoutingLabInput["staticPath"] })).toThrow(RangeError);
    expect(() => simulate({ policyMatch: "yes" as unknown as boolean })).toThrow(RangeError);
  });

  it("does not mutate the caller or leak mutable state across simulations", () => {
    const input = { ...DEFAULT_ROUTING_INPUT };
    const result = getRoutingMethodSimulation(input);
    result.input.upperCost = 999;
    result.candidates[0].nodeIds.push("bad");
    result.candidates[0].asPath.push(1);
    expect(input).toEqual(DEFAULT_ROUTING_INPUT);
    const second = getRoutingMethodSimulation(input);
    expect(second.candidates[0].nodeIds).toEqual(["r1", "r2", "r4"]);
    expect(second.candidates[0].asPath).toEqual([65010, 65040]);
  });
});
