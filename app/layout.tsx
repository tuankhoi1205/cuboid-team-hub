import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Cuboid Team Hub · Không gian làm việc",
  description: "Không gian quản lý dự án annotation 3D Cuboid, điểm danh, báo cáo và chất lượng của team.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased">{children}</body>
    </html>
  );
}
