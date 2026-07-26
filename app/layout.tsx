import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "SAS People | Employee Management and Onboarding Portal",
  description: "The private employee management and onboarding portal for SAS Finance Group Ghana.",
  icons: { icon: "/logo.png", shortcut: "/logo.png" },
  openGraph: { title: "SAS People", description: "Employee Management and Onboarding Portal", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "SAS People", description: "Employee Management and Onboarding Portal", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className={`${geist.variable} antialiased`}>{children}</body></html>;
}
