import { MemoError } from "./birthday-memo-validation";

const busy = () => new MemoError("vrchat_unavailable", 503, "지금은 VRChat 표시 이름을 확인할 수 없어요. 잠시 후 다시 시도해 주세요.");
const limited = () => new MemoError("vrchat_rate_limited", 429, "VRChat 검색 요청이 많아요. 잠시 후 다시 시도해 주세요.");
let retryAfter = 0;

export async function requireExactDisplayName(nickname: string) {
  const auth = process.env.VRCHAT_SERVICE_AUTH;
  if (!auth || !/^[\w.~-]+$/.test(auth)) throw busy();
  if (Date.now() < retryAfter) throw limited();

  const url = new URL("https://api.vrchat.cloud/api/1/users");
  url.search = new URLSearchParams({ search: nickname, sort: "exact", n: "100" }).toString();
  const signal = AbortSignal.timeout(8000);
  try {
    for (let page = 0; page < 3; page++) {
      url.searchParams.set("offset", String(page * 100));
      const response = await fetch(url, {
        headers: { Cookie: "auth=" + auth, "User-Agent": "UnderyBirthday/1.0 (https://github.com/Undery33/Undery/issues)" },
        cache: "no-store", redirect: "error", signal,
      });
      if (response.status === 429) {
        const delay = response.headers.get("retry-after") ?? "";
        const until = /^\d+$/.test(delay) ? Date.now() + Number(delay) * 1000 : Date.parse(delay);
        retryAfter = Math.max(Date.now() + 60000, Number.isFinite(until) ? until : 0);
        throw limited();
      }
      if (!response.ok) throw busy();
      const users: unknown = await response.json();
      if (!Array.isArray(users) || !users.every(user => typeof user?.displayName === "string")) throw busy();
      if (users.some(user => user.displayName === nickname)) return;
      if (users.length < 100) {
        throw new MemoError("name_not_found", 422, "정확히 일치하는 VRChat 표시 이름을 찾을 수 없어요. 대소문자와 공백을 확인해 주세요.");
      }
    }
    // An incomplete search cannot establish that the name doesn't exist.
    throw busy();
  } catch (error) {
    if (error instanceof MemoError) throw error;
    throw busy();
  }
}
