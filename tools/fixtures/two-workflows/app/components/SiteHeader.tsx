import Link from "next/link";
import { site } from "@/content/site";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between px-[24px] py-[16px]">
      <Link href="/" className="font-semibold">
        {site.name}
      </Link>
      <nav className="flex gap-[24px] text-[14px] leading-[20px]">
        {site.nav.map((item) =>
          item.route ? (
            <Link key={item.label} href={item.href}>
              {item.label}
            </Link>
          ) : (
            <a key={item.label} href={item.href}>
              {item.label}
            </a>
          ),
        )}
      </nav>
    </header>
  );
}
