/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // On Windows, fork-based compiler workers contend on `.next/trace` (EPERM).
  // Running the compilers in one process keeps builds reliable on this machine.
  experimental: {
    webpackBuildWorker: false,
  },
  // PeerJS / MQTT / Three.js are only imported from client components that are
  // mounted with ssr:false, so no server-side browser shims are required.
};

export default nextConfig;
