import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "GapFinder AI",
  description: "Find what you don't know. Diagnosis-first study app grounded in your own material.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
