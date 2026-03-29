import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/app/context/AuthContext";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Jaanu",
  description: "Jaanu - Your Buddy",
  icons: {
    icon: "/jaanu-icon.svg",
    shortcut: "/jaanu-icon.svg",
    apple: "/jaanu-icon.svg",
  },
  openGraph: {
    title: "Jaanu",
    description: "Jaanu - Your Buddy",
    images: [{ url: "/jaanu-icon.svg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
