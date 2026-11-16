export const dnsDomain = "example.com";
export const dnsTtlSeconds = 60;
export const dnsAddresses = ["203.0.113.24", "203.0.113.42"] as const;

export type DnsPhase = "ready" | "client-query" | "cache-miss" | "cache-hit" | "root-query" | "root-referral" | "tld-query" | "tld-referral" | "authoritative-query" | "authoritative-answer" | "complete";
export type DnsCacheEntry = { name: string; address: string; expiresAt: number };
export type DnsState = {
  phase: DnsPhase;
  now: number;
  authoritativeAddress: typeof dnsAddresses[number];
  cache: DnsCacheEntry | null;
  answer: string | null;
  cacheHits: number;
  cacheMisses: number;
  history: DnsPhase[];
};

export function remainingSeconds(expiresAt: number, now: number) {
  return Math.max(0, expiresAt - now);
}

export function createDnsState(): DnsState {
  return { phase: "ready", now: 0, authoritativeAddress: dnsAddresses[0], cache: null, answer: null, cacheHits: 0, cacheMisses: 0, history: [] };
}

export function isDnsInProgress(state: DnsState) {
  return state.phase !== "ready" && state.phase !== "complete";
}

export function startDnsQuery(state: DnsState): DnsState {
  if (isDnsInProgress(state)) return state;
  return { ...state, phase: "client-query", answer: null, history: ["client-query"] };
}

export function advanceDnsQuery(state: DnsState): DnsState {
  let next: DnsState;
  switch (state.phase) {
    case "client-query": {
      const hit = state.cache?.name === dnsDomain && state.cache.expiresAt > state.now;
      next = hit
        ? { ...state, phase: "cache-hit", answer: state.cache!.address, cacheHits: state.cacheHits + 1 }
        : { ...state, phase: "cache-miss", cacheMisses: state.cacheMisses + 1 };
      break;
    }
    case "cache-miss": next = { ...state, phase: "root-query" }; break;
    case "root-query": next = { ...state, phase: "root-referral" }; break;
    case "root-referral": next = { ...state, phase: "tld-query" }; break;
    case "tld-query": next = { ...state, phase: "tld-referral" }; break;
    case "tld-referral": next = { ...state, phase: "authoritative-query" }; break;
    case "authoritative-query":
      next = {
        ...state,
        phase: "authoritative-answer",
        answer: state.authoritativeAddress,
        cache: { name: dnsDomain, address: state.authoritativeAddress, expiresAt: state.now + dnsTtlSeconds },
      };
      break;
    case "cache-hit":
    case "authoritative-answer": next = { ...state, phase: "complete" }; break;
    default: return state;
  }
  return { ...next, history: [...state.history, next.phase] };
}

export function advanceDnsTime(state: DnsState, seconds: number): DnsState {
  if (isDnsInProgress(state) || !Number.isSafeInteger(seconds) || seconds <= 0) return state;
  return { ...state, now: state.now + seconds };
}

export function changeDnsAuthority(state: DnsState): DnsState {
  if (isDnsInProgress(state)) return state;
  return { ...state, authoritativeAddress: state.authoritativeAddress === dnsAddresses[0] ? dnsAddresses[1] : dnsAddresses[0], phase: "ready", answer: null, history: [] };
}

export function clearDnsCache(state: DnsState): DnsState {
  if (isDnsInProgress(state)) return state;
  return { ...state, cache: null, phase: "ready", answer: null, history: [] };
}

export const dhcpPool = ["192.168.10.100", "192.168.10.101", "192.168.10.102", "192.168.10.103"] as const;
export const dhcpLeaseSeconds = 120;
export const dhcpClients = [
  { id: "client-a", label: "클라이언트 A", mac: "02:00:00:00:00:0a" },
  { id: "client-b", label: "클라이언트 B", mac: "02:00:00:00:00:0b" },
  { id: "client-c", label: "클라이언트 C", mac: "02:00:00:00:00:0c" },
  { id: "client-d", label: "클라이언트 D", mac: "02:00:00:00:00:0d" },
  { id: "client-e", label: "클라이언트 E", mac: "02:00:00:00:00:0e" },
] as const;
export type DhcpClientId = typeof dhcpClients[number]["id"];
export type DhcpPhase = "ready" | "discover" | "offer" | "request" | "ack" | "exhausted" | "nak";
export type DhcpLease = { clientId: DhcpClientId; address: string; expiresAt: number };
export type DhcpState = {
  phase: DhcpPhase;
  now: number;
  clientId: DhcpClientId;
  reserveForA: boolean;
  offeredAddress: string | null;
  leases: DhcpLease[];
  history: DhcpPhase[];
};

export function createDhcpState(scenario: "empty" | "full" = "empty"): DhcpState {
  return {
    phase: "ready", now: 0, clientId: scenario === "full" ? "client-e" : "client-a", reserveForA: false,
    offeredAddress: null, history: [],
    leases: scenario === "full" ? dhcpPool.map((address, index) => ({ clientId: dhcpClients[index].id, address, expiresAt: dhcpLeaseSeconds })) : [],
  };
}

export function isDhcpInProgress(state: DhcpState) {
  return state.phase === "discover" || state.phase === "offer" || state.phase === "request";
}

export function getActiveDhcpLeases(state: DhcpState) {
  return state.leases.filter((lease) => lease.expiresAt > state.now);
}

function canAssignDhcpAddress(state: DhcpState, address: string, clientId: DhcpClientId) {
  if (!(dhcpPool as readonly string[]).includes(address)) return false;
  if (getActiveDhcpLeases(state).some((lease) => lease.address === address && lease.clientId !== clientId)) return false;
  if (!state.reserveForA) return true;
  return clientId === "client-a" ? address === dhcpPool[3] : address !== dhcpPool[3];
}

export function getDhcpOffer(state: DhcpState, clientId: DhcpClientId): string | null {
  const existing = getActiveDhcpLeases(state).find((lease) => lease.clientId === clientId);
  if (existing && canAssignDhcpAddress(state, existing.address, clientId)) return existing.address;
  return dhcpPool.find((address) => canAssignDhcpAddress(state, address, clientId)) ?? null;
}

export function selectDhcpClient(state: DhcpState, clientId: DhcpClientId): DhcpState {
  if (isDhcpInProgress(state)) return state;
  return { ...state, clientId, phase: "ready", offeredAddress: null, history: [] };
}

export function configureDhcpReservation(state: DhcpState, enabled: boolean): DhcpState {
  if (isDhcpInProgress(state) || getActiveDhcpLeases(state).length > 0) return state;
  return { ...state, reserveForA: enabled, phase: "ready", offeredAddress: null, history: [] };
}

export function startDhcpExchange(state: DhcpState): DhcpState {
  if (isDhcpInProgress(state) || getActiveDhcpLeases(state).some((lease) => lease.clientId === state.clientId)) return state;
  return { ...state, phase: "discover", offeredAddress: null, history: ["discover"] };
}

export function advanceDhcpExchange(state: DhcpState): DhcpState {
  let next: DhcpState;
  switch (state.phase) {
    case "discover": {
      const address = getDhcpOffer(state, state.clientId);
      next = { ...state, phase: address ? "offer" : "exhausted", offeredAddress: address };
      break;
    }
    case "offer": next = { ...state, phase: "request" }; break;
    case "request": {
      if (!state.offeredAddress || !canAssignDhcpAddress(state, state.offeredAddress, state.clientId)) {
        next = { ...state, phase: "nak" };
        break;
      }
      const lease = { clientId: state.clientId, address: state.offeredAddress, expiresAt: state.now + dhcpLeaseSeconds };
      next = { ...state, phase: "ack", leases: [...getActiveDhcpLeases(state).filter((item) => item.clientId !== state.clientId), lease] };
      break;
    }
    default: return state;
  }
  return { ...next, history: [...state.history, next.phase] };
}

export function advanceDhcpTime(state: DhcpState, seconds: number): DhcpState {
  if (isDhcpInProgress(state) || !Number.isSafeInteger(seconds) || seconds <= 0) return state;
  const now = state.now + seconds;
  return { ...state, now, leases: state.leases.filter((lease) => lease.expiresAt > now) };
}
