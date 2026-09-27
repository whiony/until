import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Until — Expiration tracker",
  description:
    "Keep expiration dates in sight. A personal shelf for food, beauty, medicine, and everyday things.",
  manifest: "/manifest.webmanifest?v=7",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Until" },
  icons: {
    icon: [
      { url: "/favicon-v7.svg", type: "image/svg+xml" },
      { url: "/favicon-32-v7.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-16-v7.png", sizes: "16x16", type: "image/png" },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon-v7.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        url: "/icons/apple-touch-icon-167-v7.png",
        sizes: "167x167",
        type: "image/png",
      },
      {
        url: "/icons/apple-touch-icon-152-v7.png",
        sizes: "152x152",
        type: "image/png",
      },
    ],
  },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f6f5ef",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
