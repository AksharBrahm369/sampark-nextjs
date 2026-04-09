import "./globals.css";

export const metadata = {
  title: "Sabha Attendance Follow-up",
  description: "Manage Swaminarayan Sabha attendance follow-ups",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
