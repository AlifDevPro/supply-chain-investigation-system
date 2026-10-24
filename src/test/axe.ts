import axe from "axe-core";

/**
 * Runs axe-core against a rendered container. jsdom has no layout engine, so color-contrast is disabled
 * here; contrast is covered by src/lib/design/contrast.test.ts against the real token values.
 */
export async function axeViolations(container: Element): Promise<string[]> {
  const results = await axe.run(container, {
    rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length} node(s))`);
}
