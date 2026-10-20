import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "سپردی",
    short_name: "سپردی",
    description: "دستیار هوشمند فروش در واتس‌اپ، اینستاگرام و تلگرام",
    lang: "fa",
    dir: "rtl",
    start_url: "/panel",
    display: "standalone",
    background_color: "#f7f8fc",
    theme_color: "#2b2451",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
