import { Hero } from "@/components/Hero";
import { FeatureCards } from "@/components/FeatureCards";
import { EmbeddedPreview } from "@/components/EmbeddedPreview";
import { home } from "@/content/site";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-[1152px] px-[24px]">
      <Hero title={home.title} lead={home.lead} />
      <FeatureCards features={home.features} />
      <EmbeddedPreview src={home.embed.src} title={home.embed.title} />
    </main>
  );
}
