import "./globals.css";

export const metadata = { title: "Equipo de agentes", description: "Orquestador, Develop y Testing trabajando juntos" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
