import { describe, expect, it } from "vitest";
import { parseManagementQuery, parseMemoMutation } from "@/lib/birthday-memo-management";

describe("message management input boundary", () => {
  it("preserves Unicode text and validates create visibility", () => {
    const input = { action: "create", requestId: "12345678-1234-4234-8234-123456789abc", nickname: "친구🎂", message: "첫 줄\r\n<script>text</script>", status: "hidden" };
    expect(parseMemoMutation(input)).toEqual(input);
    expect(() => parseMemoMutation({ ...input, status: "deleted" })).toThrow();
    expect(() => parseMemoMutation({ ...input, nickname: " \u200b\ufeff " })).toThrow();
    expect(() => parseMemoMutation({ ...input, requestId: undefined })).toThrow();
  });
  it("requires exact identifiers and versions and refuses extra authority fields", () => {
    expect(parseMemoMutation({ action: "hide", id: "123", version: "4" })).toEqual({ action: "hide", id: "123", version: "4" });
    for (const id of ["0", "01", "1 OR 1=1", "9223372036854775808", 1]) expect(() => parseMemoMutation({ action: "trash", id, version: "1" })).toThrow();
    expect(() => parseMemoMutation({ action: "update", id: "1", nickname: "친구", message: "text" })).toThrow();
    expect(() => parseMemoMutation({ action: "hide", id: "1", version: "1", actorId: "123" })).toThrow();
    expect(() => parseMemoMutation({ action: "delete", id: "1", version: "1" })).toThrow();
    expect(() => parseMemoMutation({ action: ["hide"], id: "1", version: "1" })).toThrow();
  });
  it("validates search pagination and treats search text literally", () => {
    expect(parseManagementQuery(new URLSearchParams("q=%25_&status=hidden&page=2"))).toEqual({ q: "%_", status: "hidden", page: 2 });
    for (const query of ["q=a&q=b", "status=public", "page=-1", "q=%00", "sql=x"]) expect(() => parseManagementQuery(new URLSearchParams(query))).toThrow();
  });
});
