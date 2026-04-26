import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"] });

const GA_MEASUREMENT_ID = "G-68NKF20QJX";

export const metadata: Metadata = {
  title: "TimeStitch | Search Inside YouTube Videos",
  description: "Precise keyword search across YouTube transcripts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${outfit.className} antialiased`}>
        {children}
      </body>
      <GoogleAnalytics gaId={GA_MEASUREMENT_ID} />
    </html>
  );
}
