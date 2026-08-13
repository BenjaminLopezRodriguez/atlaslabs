import "@/styles/globals.css";

import { type Metadata } from "next";
import { Geist, Geist_Mono, Libre_Baskerville, Newsreader } from "next/font/google";

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

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  variable: "--font-newsreader",
  display: "swap",
});

/** Logo / product-name stamp — Libre Baskerville */
const libreBaskerville = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  style: ["normal", "italic"],
  variable: "--font-logo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Atlas Labs — Specialist fine-tuned models",
  description:
    "Atlas Labs builds specialist fine-tuned LLMs with experts. Atlas Life brings that stack to kids on atlaslabs.life. Software, Remote, and hardware extend the same core.",
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
        newsreader.variable,
        libreBaskerville.variable,
        geistSans.className,
        "antialiased",
      )}
    >
      <body className="min-h-screen font-sans">
        <AuthKitProvider>
          <TRPCReactProvider>{children}</TRPCReactProvider>
        </AuthKitProvider>
      </body>
    </html>
  );
}
