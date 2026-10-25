type HeroProps = { title: string; lead: string };

export function Hero({ title, lead }: HeroProps) {
  return (
    <section className="py-[96px] text-center">
      <h1 className="text-[48px] leading-[56px] font-bold">{title}</h1>
      <p className="mt-[16px] text-[18px] leading-[28px] text-[#475569]">{lead}</p>
    </section>
  );
}
