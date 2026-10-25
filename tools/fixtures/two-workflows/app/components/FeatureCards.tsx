import type { Feature } from "@/content/site";

export function FeatureCards({ features }: { features: Feature[] }) {
  return (
    <ul className="grid gap-[24px] md:grid-cols-3">
      {features.map((feature) => (
        <li key={feature.title} className="rounded-[12px] border border-[#e2e8f0] p-[24px]">
          <h3 className="font-semibold">{feature.title}</h3>
          <p className="mt-[8px] text-[14px] leading-[20px] text-[#475569]">{feature.body}</p>
        </li>
      ))}
    </ul>
  );
}
