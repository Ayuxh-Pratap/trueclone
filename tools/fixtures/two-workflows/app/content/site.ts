// The site's copy and links, in one place: change text here, not in the components

export type NavLink = { label: string; href: string; route?: boolean };
export type Feature = { title: string; body: string };

export const site = {
  name: "Fixture",
  // routes of the app use next/link; a page outside the converted scope opens the live site
  nav: [
    { label: "About", href: "/about", route: true },
    { label: "Pricing", href: "http://localhost:5611/pricing?plan=pro#faq" },
    { label: "Elsewhere", href: "https://example.com/" },
  ] satisfies NavLink[],
  footer: "© Fixture",
};

export const home = {
  title: "Ship faster",
  lead: "Everything a small team needs, in one place.",
  features: [
    { title: "Fast", body: "It is fast." },
    { title: "Kind", body: "It is kind." },
    { title: "Open", body: "It is open." },
  ] satisfies Feature[],
  // the first-party document the page embeds (recorded by the capture as a dependency of this page)
  embed: { src: "http://embed.localhost:5611/frame.html", title: "Embedded" },
};

export const about = {
  title: "About",
  lead: "We make small, kind tools.",
};
