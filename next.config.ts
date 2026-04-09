import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Apply to all routes.
        //
        // These two headers are required for SharedArrayBuffer, which
        // ffmpeg.wasm (used in VideoTrimmer) needs to process video frames
        // in a Web Worker.
        //
        // COEP: 'credentialless' (not 'require-corp') enables SharedArrayBuffer
        // for ffmpeg.wasm while still allowing cross-origin resources (Supabase
        // Storage images and videos) to load without requiring them to send a
        // Cross-Origin-Resource-Policy response header.
        //
        // 'require-corp' would block any cross-origin resource that doesn't
        // explicitly opt in via CORP — Supabase's CDN doesn't add that header,
        // so images and videos would silently fail to load.
        //
        // 'credentialless' gives the same SharedArrayBuffer access but sends
        // cross-origin no-cors requests without cookies, which is fine because
        // Supabase public-bucket URLs are unauthenticated.
        //
        // COOP: 'same-origin' is still required alongside COEP for
        // SharedArrayBuffer. It prevents cross-origin opener access, which is
        // safe here because the app uses Supabase PKCE redirect flow (not an
        // OAuth popup). If popup-based OAuth is ever added, relax this to
        // 'same-origin-allow-popups'.
        source: "/(.*)",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
