import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EMS — Aimexa Store",
  description: "Ecommerce Management System",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
