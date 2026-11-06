import type { NextConfig } from "next";

const noIndex = { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" };

const config: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      { source: "/portfolio/:path*", headers: [noIndex] },
      { source: "/admin/:path*", headers: [noIndex] },
    ];
  },
};

export default config;
