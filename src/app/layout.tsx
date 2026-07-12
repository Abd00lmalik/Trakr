import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://trakr-production-c70e.up.railway.app"),
  title: "Trakr",
  description: "AI-powered Opportunity Companion exposed as an A2MCP service.",
  icons: {
    icon: "/icon.png",
    apple: "/apple-icon.png",
  },
  openGraph: {
    title: "Trakr",
    description: "AI-powered Opportunity Companion exposed as an A2MCP service.",
    images: ["/trakr-logo.png"],
  },
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
