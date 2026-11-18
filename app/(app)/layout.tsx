import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import Nav from "./nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return (
    <div className="shell">
      <aside className="side">
        <div className="logo">
          Gap<span>Finder</span> AI
        </div>
        <Nav />
        <div className="user">{user.name}</div>
      </aside>
      <main>{children}</main>
    </div>
  );
}
