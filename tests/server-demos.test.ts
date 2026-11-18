import { describe, expect, it } from "vitest";
import {
  advanceDhcpExchange, advanceDhcpTime, advanceDnsQuery, advanceDnsTime, changeDnsAuthority,
  clearDnsCache, configureDhcpReservation, createDhcpState, createDnsState, dhcpPool,
  getDhcpOffer, selectDhcpClient, startDhcpExchange, startDnsQuery,
  type DhcpState, type DnsState,
} from "@/lib/server-demos";

function resolveDns(state: DnsState) {
  let current = startDnsQuery(state);
  for (let step = 0; step < 12 && current.phase !== "complete"; step++) current = advanceDnsQuery(current);
  expect(current.phase).toBe("complete");
  return current;
}

function allocateDhcp(state: DhcpState) {
  let current = startDhcpExchange(state);
  for (let step = 0; step < 4 && !["ack", "exhausted", "nak"].includes(current.phase); step++) current = advanceDhcpExchange(current);
  return current;
}

describe("DNS referral and cache simulation", () => {
  it("gets an answer only from the authority, then caches and returns it", () => {
    let state = startDnsQuery(createDnsState());
    while (state.phase !== "authoritative-query") {
      expect(state.answer).toBeNull();
      expect(state.cache).toBeNull();
      state = advanceDnsQuery(state);
    }
    state = advanceDnsQuery(state);
    expect(state.cache).toEqual({ name: "example.com", address: "203.0.113.24", expiresAt: 60 });
    expect(advanceDnsQuery(state).phase).toBe("complete");
    expect(state.history).toContain("root-referral");
    expect(state.history).toContain("tld-referral");
  });

  it("answers a valid cache hit without contacting authority servers or resetting TTL", () => {
    const first = resolveDns(createDnsState());
    const cached = resolveDns(advanceDnsTime(first, 30));
    expect(cached.history).toEqual(["client-query", "cache-hit", "complete"]);
    expect(cached.cache?.expiresAt).toBe(60);
    expect(cached.cacheHits).toBe(1);
    expect(cached.cacheMisses).toBe(1);
  });

  it("expires exactly at TTL and fetches a changed authoritative record", () => {
    const initial = changeDnsAuthority(resolveDns(createDnsState()));
    expect(resolveDns(advanceDnsTime(initial, 59)).answer).toBe("203.0.113.24");
    const refreshed = resolveDns(advanceDnsTime(initial, 60));
    expect(refreshed.answer).toBe("203.0.113.42");
    expect(refreshed.cache?.expiresAt).toBe(120);
    expect(refreshed.history).toContain("authoritative-query");
  });

  it("keeps an active exchange stable and allows an explicit cache clear", () => {
    const running = startDnsQuery(createDnsState());
    expect(startDnsQuery(running)).toBe(running);
    expect(advanceDnsTime(running, 60)).toBe(running);
    expect(changeDnsAuthority(running)).toBe(running);
    const cleared = clearDnsCache(resolveDns(createDnsState()));
    expect(cleared.cache).toBeNull();
    expect(resolveDns(cleared).cacheMisses).toBe(2);
  });
});

describe("DHCP offer, reservation, and lease simulation", () => {
  it("keeps an Offer provisional and records the lease only at ACK", () => {
    let state = startDhcpExchange(createDhcpState());
    state = advanceDhcpExchange(state);
    expect(state.phase).toBe("offer");
    expect(state.offeredAddress).toBe(dhcpPool[0]);
    expect(state.leases).toEqual([]);
    state = advanceDhcpExchange(state);
    expect(state.phase).toBe("request");
    expect(state.leases).toEqual([]);
    state = advanceDhcpExchange(state);
    expect(state.phase).toBe("ack");
    expect(state.leases).toEqual([{ clientId: "client-a", address: dhcpPool[0], expiresAt: 120 }]);
  });

  it("never gives an active lease to a different client", () => {
    const first = allocateDhcp(createDhcpState());
    const second = allocateDhcp(selectDhcpClient(first, "client-b"));
    expect(second.leases.map((lease) => lease.address)).toEqual([dhcpPool[0], dhcpPool[1]]);
    expect(startDhcpExchange(second)).toBe(second);
  });

  it("keeps a reserved address for its client even when the other addresses are exhausted", () => {
    let state = configureDhcpReservation(createDhcpState(), true);
    expect(getDhcpOffer(state, "client-a")).toBe(dhcpPool[3]);
    for (const clientId of ["client-b", "client-c", "client-d"] as const) state = allocateDhcp(selectDhcpClient(state, clientId));
    expect(getDhcpOffer(state, "client-e")).toBeNull();
    expect(getDhcpOffer(state, "client-a")).toBe(dhcpPool[3]);
    state = allocateDhcp(selectDhcpClient(state, "client-a"));
    expect(new Set(state.leases.map((lease) => lease.address)).size).toBe(4);
  });

  it("has no Offer on pool exhaustion, then reuses addresses after lease expiration", () => {
    const exhausted = allocateDhcp(createDhcpState("full"));
    expect(exhausted.phase).toBe("exhausted");
    expect(exhausted.offeredAddress).toBeNull();
    expect(exhausted.leases).toHaveLength(4);
    expect(getDhcpOffer(advanceDhcpTime(exhausted, 119), "client-e")).toBeNull();
    const expired = advanceDhcpTime(exhausted, 120);
    expect(expired.leases).toEqual([]);
    expect(allocateDhcp(expired).leases[0]).toEqual({ clientId: "client-e", address: dhcpPool[0], expiresAt: 240 });
  });

  it("rejects a requested address if it becomes occupied before ACK", () => {
    let state = advanceDhcpExchange(advanceDhcpExchange(startDhcpExchange(createDhcpState())));
    state = { ...state, leases: [{ clientId: "client-b", address: dhcpPool[0], expiresAt: 120 }] };
    const rejected = advanceDhcpExchange(state);
    expect(rejected.phase).toBe("nak");
    expect(rejected.leases).toEqual(state.leases);
  });

  it("does not change reservations or virtual time during an exchange or overwrite existing allocations", () => {
    const running = startDhcpExchange(createDhcpState());
    expect(configureDhcpReservation(running, true)).toBe(running);
    expect(selectDhcpClient(running, "client-b")).toBe(running);
    expect(advanceDhcpTime(running, 120)).toBe(running);
    const allocated = allocateDhcp(createDhcpState());
    expect(configureDhcpReservation(allocated, true)).toBe(allocated);
  });
});
