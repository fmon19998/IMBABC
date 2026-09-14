import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "IMBABC — Broadcast WhatsApp Bisnis Tanpa Ribet",
  description: "Kelola broadcast, kontak, inbox, dan aktivitas pelanggan melalui WhatsApp Business Platform.",
  icons: {
    icon: "/imbabc-logo.png",
    shortcut: "/imbabc-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id">
      <body className="antialiased">{children}</body>
    </html>
  );
}
