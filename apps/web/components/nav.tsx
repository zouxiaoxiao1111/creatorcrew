"use client";

import { cn } from "@creatorcrew/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "工作台", icon: "▦" },
  { href: "/inspiration", label: "灵感库", icon: "✦" },
  { href: "/review", label: "草稿审核", icon: "✓" },
  { href: "/settings", label: "设置", icon: "⚙" },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-zinc-900 text-white"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
            )}
          >
            <span className="w-4 text-center text-xs opacity-80">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
