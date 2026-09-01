import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

import { DocumentProvider } from "@/lib/document-context";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocFlow AI",
  description:
    "Extract, review and approve document data in your browser — nothing leaves your machine.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/*
          One document, one provider, mounted above every route: the landing
          page starts the extraction and the review and success screens read the
          same state without any of it touching the URL or storage.
        */}
        <DocumentProvider>{children}</DocumentProvider>
      </body>
    </html>
  );
}
