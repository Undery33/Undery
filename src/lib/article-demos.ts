// A document can only select its own bundled example, never arbitrary code.
export const technologyDemos = ["vlan", "routing", "dns", "dhcp"] as const;
export type TechnologyDemo = (typeof technologyDemos)[number];

export function splitTechnologyDemo(slug: string, body: string): { demo: TechnologyDemo; before: string; after: string } | undefined {
  const demo = technologyDemos.find((item) => item === slug);
  if (!demo) return undefined;
  const sections = body.split(`<!-- demo:${demo} -->`);
  if (sections.length !== 2) return undefined;
  return { demo, before: sections[0], after: sections[1] };
}
