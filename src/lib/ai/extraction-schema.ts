import { z } from "zod";
import { unitSchema } from "@/lib/domain/common";

/** Prompt and output contract version. Stored with every extraction; bump it when either changes. */
export const EXTRACTION_PROMPT_VERSION = "signal-extraction.v1";

export const EXTRACTION_FIELDS = [
  "delayDays",
  "quantity",
  "unit",
  "purchaseOrder",
  "material",
  "shipment",
  "lot",
  "productionOrder",
] as const;
export type ExtractionField = (typeof EXTRACTION_FIELDS)[number];

export const REFERENCE_FIELDS = ["purchaseOrder", "material", "shipment", "lot", "productionOrder"] as const;
export type ReferenceField = (typeof REFERENCE_FIELDS)[number];

/** Delimiters around the untrusted source text in the user message. */
export const SOURCE_BEGIN = "<<<SOURCE_TEXT";
export const SOURCE_END = "SOURCE_TEXT>>>";

export const MAX_SOURCE_CHARS = 2000;
export const MAX_QUOTE_CHARS = 300;

/** Identifier shape for references: letters, digits and a few separators. Never free prose. */
export const REFERENCE_FORMAT = /^[A-Za-z0-9][A-Za-z0-9/_.-]{1,63}$/;

const quote = z.string().min(1).max(MAX_QUOTE_CHARS);

/** Per-field value schemas. A field failing its schema is dropped with `bad_format`; the rest survive. */
export const FIELD_SCHEMAS: Record<ExtractionField, z.ZodType<{ value: string | number; quote: string }>> = {
  delayDays: z.strictObject({ value: z.number().int().min(1).max(365), quote }),
  quantity: z.strictObject({ value: z.number().finite().min(0).max(10_000_000), quote }),
  unit: z.strictObject({ value: unitSchema, quote }),
  purchaseOrder: z.strictObject({ value: z.string().regex(REFERENCE_FORMAT), quote }),
  material: z.strictObject({ value: z.string().regex(REFERENCE_FORMAT), quote }),
  shipment: z.strictObject({ value: z.string().regex(REFERENCE_FORMAT), quote }),
  lot: z.strictObject({ value: z.string().regex(REFERENCE_FORMAT), quote }),
  productionOrder: z.strictObject({ value: z.string().regex(REFERENCE_FORMAT), quote }),
};

/**
 * Outer shape: only the known keys, each optional (missing means null). Unknown keys make the whole output
 * invalid, so a model cannot smuggle extra instructions or fields through.
 */
export const extractionEnvelopeSchema = z.strictObject(
  Object.fromEntries(EXTRACTION_FIELDS.map((f) => [f, z.unknown().optional()])) as Record<
    ExtractionField,
    z.ZodOptional<z.ZodUnknown>
  >,
);

const fieldJson = (value: Record<string, unknown>) => ({
  anyOf: [
    {
      type: "object",
      properties: { value, quote: { type: "string", maxLength: MAX_QUOTE_CHARS } },
      required: ["value", "quote"],
      additionalProperties: false,
    },
    { type: "null" },
  ],
});

/** JSON schema handed to the model as a formatting hint. The zod schemas above are what is enforced. */
export const EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    delayDays: fieldJson({ type: "integer", minimum: 1, maximum: 365 }),
    quantity: fieldJson({ type: "number", minimum: 0 }),
    unit: fieldJson({ type: "string", enum: ["m", "yd", "kg", "pcs"] }),
    ...Object.fromEntries(REFERENCE_FIELDS.map((f) => [f, fieldJson({ type: "string", maxLength: 64 })])),
  },
  required: [...EXTRACTION_FIELDS],
  additionalProperties: false,
};
