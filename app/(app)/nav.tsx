"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/lib/client";

const ITEMS = [
  ["/", "📈 Dashboard"],
  ["/materials", "1 · Materials"],
  ["/topics", "2 · Topic map"],
  ["/quiz", "3 · Diagnostic quiz"],
  ["/report", "4 · Gap report"],
  ["/plan", "5 · Revision plan"],
  ["/explain", "💬 Explain a topic"],
] as const;

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href} className={path === href ? "active" : ""}>
          {label}
        </Link>
      ))}
      <a
        href="#"
        onClick={async (e) => {
          e.preventDefault();
          await api("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        }}
      >
        Log out
      </a>
    </nav>
  );
}
