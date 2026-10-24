import { Geist, Geist_Mono } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata = {
  title: {
    default: "Programming Haven — Get vetted. Get hired.",
    template: "%s · Programming Haven",
  },
  description:
    "AI-powered preparation for the screening pipelines of Toptal, Turing, Lemon.io, A.Team, Braintrust and " +
    "remote jobs in the US, UK and Europe.",
  applicationName: "Programming Haven",
  appleWebApp: { capable: true, title: "Haven", statusBarStyle: "black-translucent" },
};

export const viewport = {
  themeColor: "#070a12",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
