import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Until — Expiration tracker",
  description:
    "Keep expiration dates in sight. A personal shelf for food, beauty, medicine, and everyday things.",
  manifest: "/manifest.webmanifest?v=4",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Until" },
  icons: {
    icon: "/favicon.svg?v=4",
    apple: [
      {
        url: "/apple-touch-icon.png?v=4",
        sizes: "180x180",
        type: "image/png",
      },
      {
        url: "/icons/apple-touch-icon-167.png?v=4",
        sizes: "167x167",
        type: "image/png",
      },
      {
        url: "/icons/apple-touch-icon-152.png?v=4",
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
