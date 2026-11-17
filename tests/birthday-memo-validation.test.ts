import { describe, expect, it } from "vitest";
import { parseMemoOrder, parseMemoPage, parseMemoUrl, validateMemo, validateToken } from "@/lib/birthday-memo-validation";

describe("birthday memo input validation", () => {
  it.each(["", "   ", "\u00a0\u3000", "\u200b\ufeff", "\u2060"])("rejects a visually blank nickname %j", nickname => {
    expect(() => validateMemo(nickname, "축하해요")).toThrow("닉네임을 입력");
  });
  it("preserves the exact strings checked by the Unity receipt, including .NET/JS trim differences", () => {
    const payload = { nickname: "\ufeff친구\ufeff", message: "첫 줄\r\n둘째 줄\r셋째 줄\n<b>원문</b> & + % 🎂" };
    expect(validateMemo(payload.nickname, payload.message)).toEqual(payload);
    expect(validateMemo("친구", "")).toEqual({ nickname: "친구", message: "" });
  });
  it("counts Unicode scalar values without splitting supplementary characters", () => {
    expect(validateMemo("🎂".repeat(24), "🎂".repeat(300)).message).toHaveLength(600);
    expect(() => validateMemo("🎂".repeat(25), "")).toThrow("24자");
    expect(() => validateMemo("이름", "🎂".repeat(301))).toThrow("300자");
  });
  it.each(["a\u0000", "a\u0001", "a\u007f", "\ud800", "\udfff"])("rejects invalid text %j", value => {
    expect(() => validateMemo("이름", value)).toThrow("사용할 수 없는 문자");
  });
  it.each(["이름\n", "이름\r", "이름\t"])("keeps nickname single-line %j", value => {
    expect(() => validateMemo(value, "message")).toThrow("한 줄");
  });
  it("requires an opaque 256-bit token", () => {
    expect(validateToken("a".repeat(64))).toHaveLength(64);
    for (const value of ["", "a".repeat(63), "A".repeat(64), "g".repeat(64), "a".repeat(65)]) expect(() => validateToken(value)).toThrow();
  });
});

describe("birthday memo request parsing", () => {
  it("decodes Korean, line breaks, ampersands and literal plus signs once", () => {
    const payload = "축하 & + %\r\n🎂";
    const url = parseMemoUrl(`https://undery.link/birthday/memo/submit?message=${encodeURIComponent(payload)}`, ["message"]);
    expect(url.searchParams.get("message")).toBe(payload);
  });
  it.each(["?message=%", "?message=%ZZ", "?message=%ED%A0%80", "?message=%FF"])("rejects malformed encoding %s", query => {
    expect(() => parseMemoUrl(`https://undery.link/birthday/memo/submit${query}`, ["message"])).toThrow("인코딩");
  });
  it.each(["?nickname=a&nickname=b", "?nickname=a&admin=true", "?%6eickname=a&nickname=b"])("rejects ambiguous query %s", query => {
    expect(() => parseMemoUrl(`https://undery.link/birthday/memo/submit${query}`, ["nickname"])).toThrow("항목");
  });
  it("rejects oversized request URLs before looking up storage", () => {
    expect(() => parseMemoUrl(`https://undery.link/birthday/memo/submit?message=${"a".repeat(6000)}`, ["message"])).toThrow("너무 깁니다");
  });
  it("accepts the static oldest-first page URLs authored into the world", () => {
    const url = parseMemoUrl("https://undery.link/birthday/memo/feed?page=999&order=oldest", ["page", "order"]);
    expect(parseMemoPage(url.searchParams.get("page"))).toBe(999);
    expect(parseMemoOrder(url.searchParams.get("order"))).toBe("oldest");
    expect(parseMemoPage(null)).toBe(0);
    expect(parseMemoOrder(null)).toBe("oldest");
  });
  it.each(["-1", "1.5", "1e2", "01", "10000000", ""])("rejects invalid page %s", value => {
    expect(() => parseMemoPage(value)).toThrow();
  });
  it("rejects an unknown order", () => { expect(() => parseMemoOrder("random")).toThrow(); });
});
