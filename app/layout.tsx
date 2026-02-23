import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OpenFS Incident Response",
  description: "AI-powered SRE incident triage with Claude",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
