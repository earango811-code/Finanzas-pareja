import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finanzas en pareja",
  description: "Presupuesto compartido, gastos personales y quién le debe a quién.",
  applicationName: "Finanzas en pareja",
  appleWebApp: { capable: true, title: "Finanzas", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png" }, // el favicon sale de src/app/icon.svg
};

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-CO">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
