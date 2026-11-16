import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IpAddressDemo, parseIpv4Octet } from "@/components/computer/ip-address-demo";

describe("IPv4 learning demo", () => {
  it.each(["0", "1", "24", "128", "192", "255"])("accepts the decimal octet %s", (input) => {
    expect(parseIpv4Octet(input)).toBe(Number(input));
  });

  it.each(["", " ", " 24", "24 ", "256", "999", "1000", "-1", "+1", "1.5", "1e2", "0x10", "01", "00", "NaN"])("rejects an invalid octet without silently changing it: %s", (input) => {
    expect(parseIpv4Octet(input)).toBeNull();
  });

  it("starts with a complete accessible 32-bit example", () => {
    const html = renderToStaticMarkup(<IpAddressDemo />);
    expect(html).toContain("192.168.10.24");
    for (const octet of ["11000000", "10101000", "00001010", "00011000"]) {
      expect(html).toContain(octet);
    }
    expect(html.match(/aria-pressed="(?:true|false)"/g)).toHaveLength(32);
    expect(html.match(/aria-invalid="false"/g)).toHaveLength(4);
    expect(html).toContain('aria-live="polite"');
  });
});
