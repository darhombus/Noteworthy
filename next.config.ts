import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Client Router Cache — Next 14.2+ shipped with `staleTimes.dynamic = 0`,
  // which disables RSC payload reuse for any route that reads cookies/auth
  // (i.e. every page in this app). Without this, navigating back to a page
  // you visited 3 seconds ago refetches the entire payload and re-fires
  // loading.tsx. Bumping `dynamic` makes recently-visited pages render
  // instantly from cache — the SPA feel users expect. router.refresh()
  // (used by LiveDataRefresh on writes) still busts the cache, so freshness
  // is preserved when data actually changes.
  experimental: {
    staleTimes: {
      dynamic: 180,
      static: 180,
    },
  },

  // NOTE: Cross-Origin-Embedder-Policy / Cross-Origin-Opener-Policy headers
  // were previously set globally to enable SharedArrayBuffer for
  // ffmpeg.wasm. VideoTrimmer was rewritten to use the browser-native
  // MediaRecorder API (see VideoTrimmer.tsx for rationale) so SAB is no
  // longer needed. The headers were forcing cross-origin isolation on every
  // page — disabling some browser optimisations and serialising cross-origin
  // resource loads (Supabase Storage images/videos) for no benefit. Removed.
};

export default nextConfig;
