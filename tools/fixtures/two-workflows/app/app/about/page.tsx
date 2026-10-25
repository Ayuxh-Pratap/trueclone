import type { Metadata } from "next";
import { Hero } from "@/components/Hero";
import { about } from "@/content/site";

export const metadata: Metadata = { title: "About · Fixture" };

export default function AboutPage() {
  return (
    <main className="mx-auto max-w-[1152px] px-[24px]">
      <Hero title={about.title} lead={about.lead} />
    </main>
  );
}
