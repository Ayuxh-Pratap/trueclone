// The first-party document the home page embeds, kept as the embed it is on the site (its own product surface)
export function EmbeddedPreview({ src, title }: { src: string; title: string }) {
  return <iframe className="my-[48px] h-[120px] w-full rounded-[12px] border border-[#e2e8f0]" src={src} title={title} />;
}
