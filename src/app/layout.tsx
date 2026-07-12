import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trakr",
  description: "AI-powered Opportunity Companion exposed as an A2MCP service.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
