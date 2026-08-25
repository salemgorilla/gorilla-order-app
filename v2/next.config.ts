import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    /**
     * The S&S product photography hosts. The apparel catalog came live on
     * 25 Aug (the API key finally worked), and every garment photo loads
     * full-size ("_fl") from a third-party host through a bare <img> — the
     * cost the no-img-element warnings have been flagging all along, moot
     * while the catalog was dark and not moot now. Allowing the hosts here
     * turns on /_next/image for them, so the catalog <img>s can convert to
     * next/image incrementally — and it is also what let the garment
     * placement zones in lib/garment-zones.ts be verified against the real
     * photos (the optimizer is the one server in this stack that can fetch
     * them from everywhere).
     *
     * Only these two hosts, deliberately: the optimizer will fetch and
     * re-serve whatever it is allowed, so a broad pattern would make the
     * app an open image proxy.
     */
    remotePatterns: [
      { protocol: "https", hostname: "www.ssactivewear.com" },
      { protocol: "https", hostname: "cdn.ssactivewear.com" },
    ],
  },
};

export default nextConfig;
