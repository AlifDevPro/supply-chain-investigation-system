import { normalizeUnit } from "@/lib/domain/signal-input";
import { hasDelayLanguage, parseDelayLength } from "@/lib/investigation/signals";
import { EXTRACTION_PROMPT_VERSION, SOURCE_BEGIN, SOURCE_END, type ExtractionField } from "./extraction-schema";
import { AiUnavailableError, type AiProvider, type GenerateJsonRequest, type GenerateJsonResponse } from "./provider";

type Field = { value: string | number; quote: string } | null;

const firstMatch = (text: string, re: RegExp): Field => {
  const m = re.exec(text);
  if (!m) return null;
  return { value: m[1] ?? m[0], quote: m[0] };
};

/** Deterministic stand-in for a model: regular expressions over the delimited source text. */
export function mockExtract(source: string): Record<ExtractionField, Field> {
  const purchaseOrder = firstMatch(source, /\b(PO-\d{3,8})\b/);
  const shipment = firstMatch(source, /\b(SHP-\d{3,8})\b/);
  const productionOrder = firstMatch(source, /\b(PRD-\d{3,8})\b/);
  const lot = firstMatch(source, /\blot\s+([A-Z]{2,4}-\d{2,6})\b/i);
  const taken = new Set([purchaseOrder, shipment, productionOrder, lot].map((f) => f?.value));
  let material: Field = null;
  for (const m of source.matchAll(/\b([A-Z]{2}-\d{4})\b/g)) {
    if (!taken.has(m[1])) {
      material = { value: m[1]!, quote: m[0] };
      break;
    }
  }

  let delayDays: Field = null;
  if (hasDelayLanguage(source)) {
    const m = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|twenty|thirty)[\s-]*(days?|weeks?)\b/i.exec(source);
    const days = m ? parseDelayLength(m[0]) : null;
    if (m && days !== null) delayDays = { value: days, quote: m[0] };
  }

  let quantity: Field = null;
  let unit: Field = null;
  const q = /\b(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(m|meters?|metres?|yd|yds|yards?|kg|kgs|pcs|pieces?)\b/i.exec(source);
  if (q) {
    const u = normalizeUnit(q[2]!);
    if (u) {
      quantity = { value: Number(q[0].replace(/[^\d.]/g, "").replace(/\.$/, "")), quote: q[0] };
      unit = { value: u, quote: q[0] };
    }
  }
  return { delayDays, quantity, unit, purchaseOrder, material, shipment, lot, productionOrder };
}

function sourceOf(user: string): string {
  const start = user.indexOf(SOURCE_BEGIN);
  const end = user.lastIndexOf(SOURCE_END);
  if (start < 0 || end < start) return "";
  return user.slice(start + SOURCE_BEGIN.length, end).trim();
}

/** Deterministic provider for tests and development. It is labelled as such and never presented as a model. */
export class MockProvider implements AiProvider {
  readonly kind = "mock" as const;
  readonly model = "mock-extractor-1";
  readonly label = "mock provider (deterministic, not a model)";

  async generateJson(request: GenerateJsonRequest): Promise<GenerateJsonResponse> {
    if (request.task !== EXTRACTION_PROMPT_VERSION) throw new AiUnavailableError(`unsupported_task`);
    const text = JSON.stringify(mockExtract(sourceOf(request.user)));
    return { text, usage: { inputTokens: null, outputTokens: null } };
  }
}
