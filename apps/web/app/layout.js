import "./globals.css";
import { Providers } from "@/components/Providers";
import CommandPalette from "@/components/CommandPalette";

const inter = {
  variable: "--font-inter",
};

const jetbrainsMono = {
  variable: "--font-jetbrains-mono",
};

export const metadata = {
  title: "workBYLiNE | The Context Layer for AI-Era Hiring",
  description: "Evidence-backed trust packets, verifiable provenance, and human-in-the-loop hiring decisions.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans antialiased min-h-screen bg-background text-foreground`}>
        <Providers>
          {children}
          <CommandPalette />
        </Providers>
      </body>
    </html>
  );
}
