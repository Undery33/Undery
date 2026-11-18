import { describe, expect, it } from "vitest";
import { validateMemoOwnerDeletion } from "@/lib/birthday-memo-validation";

const valid = ["1", "a".repeat(64), "b".repeat(32), "trash"] as const;
describe("owner deletion input", () => {
  it("accepts canonical IDs including the PostgreSQL bigint maximum", () => {
    expect(validateMemoOwnerDeletion(...valid)).toEqual({ entryId: "1", token: valid[1], requestId: valid[2], confirm: "trash" });
    expect(validateMemoOwnerDeletion("9223372036854775807", valid[1], valid[2], "trash").entryId).toBe("9223372036854775807");
  });
  it.each(["", "0", "01", "-1", "+1", "1.0", "1e2", " 1", "1\n", "９", "9223372036854775808", "9".repeat(100)])("rejects invalid entry ID %j", value => {
    expect(() => validateMemoOwnerDeletion(value, valid[1], valid[2], valid[3])).toThrow(expect.objectContaining({ code: "invalid_delete_request", status: 400 }));
  });
  it.each(["", "A".repeat(64), "a".repeat(63), "a".repeat(65), "g".repeat(64), `${"a".repeat(64)}\n`])("rejects invalid owner secret %j", value => {
    expect(() => validateMemoOwnerDeletion(valid[0], value, valid[2], valid[3])).toThrow(expect.objectContaining({ status: 400 }));
  });
  it.each(["", "B".repeat(32), "b".repeat(31), "b".repeat(33), "z".repeat(32), "d5872071-61a6-40be-8882-13b2ac807c41"]) ("rejects invalid request ID %j", value => {
    expect(() => validateMemoOwnerDeletion(valid[0], valid[1], value, valid[3])).toThrow(expect.objectContaining({ status: 400 }));
  });
  it.each(["", "delete", "true", "Trash", "trash "])("requires explicit trash confirmation %j", value => {
    expect(() => validateMemoOwnerDeletion(valid[0], valid[1], valid[2], value)).toThrow(expect.objectContaining({ status: 400 }));
  });
});
