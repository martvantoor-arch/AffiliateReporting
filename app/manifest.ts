import type { MetadataRoute } from "next";

/**
 * Zonder manifest telt de app op iOS als bladwijzer, niet als webapp — en dan
 * bestaat Web Push er niet. `display: standalone` is dus geen cosmetiek maar
 * de voorwaarde voor notificaties.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kasboek — affiliate-inkomsten",
    short_name: "Kasboek",
    description:
      "Al je affiliate-inkomsten op één plek, met grafieken en trends.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f4f2ec",
    theme_color: "#f4f2ec",
    lang: "nl",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
