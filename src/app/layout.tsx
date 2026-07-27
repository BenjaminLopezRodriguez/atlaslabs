import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Geist_Mono, Libre_Baskerville } from "next/font/google";

import { AuthKitProvider } from "@workos-inc/authkit-nextjs/components";

import { TRPCReactProvider } from "@/trpc/react";
import { cn } from "@/lib/utils";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

/** Display serif for headlines — https://fonts.google.com/specimen/Libre+Baskerville */
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-heading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atlas Labs",
  description:
    "Atlas is an agentic coding workspace — a cloud machine you and your agents build in together, from the browser or the CLI.",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={cn(
        geistSans.variable,
        geistMono.variable,
        libreBaskerville.variable,
        geistSans.className,
        "antialiased",
      )}
    >
      <body>
        <AuthKitProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
