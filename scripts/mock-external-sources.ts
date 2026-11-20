/**
 * Local mock source server for Phase 6 HTTPS adapters (loopback HTTP).
 * Serves synthetic mailbox / ERP / carrier JSON. Never production credentials.
 * Run: npm run mock:sources
 */
import { createServer } from "node:http";

const PORT = Number(process.env.MOCK_SOURCES_PORT ?? 3099);
const KEY = process.env.MOCK_SOURCES_API_KEY ?? "mock-source-key-demo-only";

function unauthorized(res: import("node:http").ServerResponse) {
  res.writeHead(401, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "unauthorized" }));
}

function json(res: import("node:http").ServerResponse, body: unknown) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const now = () => new Date().toISOString();

createServer((req, res) => {
  const auth = req.headers.authorization ?? "";
  if (auth !== `Bearer ${KEY}`) return unauthorized(res);
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, { kind: "health", health: { status: "ok", checkedAt: now() } });
  }

  if (req.method === "GET" && url.pathname === "/mailbox/messages") {
    return json(res, {
      kind: "signals",
      signals: [
        {
          sourceType: "supplier_email",
          sourceSystem: "Mock mailbox (synthetic)",
          sourceRecordId: `mock-mail-${Date.now()}`,
          label: "Supplier notice: navy twill NV-4410 for PO-77410 will arrive four days late",
          excerpt: "8,000 m of navy twill will arrive four days later than promised.",
          references: { purchaseOrder: "PO-77410", material: "NV-4410" },
          quantity: { value: 8000, unit: "m" },
          dataMode: "synthetic",
        },
      ],
    });
  }

  if (req.method === "GET" && url.pathname === "/erp/purchase-orders") {
    return json(res, {
      kind: "signals",
      signals: [
        {
          sourceType: "erp_purchase_order",
          sourceSystem: "Mock ERP (synthetic)",
          sourceRecordId: `mock-erp-${Date.now()}`,
          label: "ERP sync: open purchase order PO-77210 still open",
          references: { purchaseOrder: "PO-77210", material: "TR-5502" },
          attributes: { routineSync: true },
          dataMode: "synthetic",
        },
      ],
    });
  }

  if (req.method === "GET" && url.pathname === "/carrier/shipments") {
    return json(res, {
      kind: "signals",
      signals: [
        {
          sourceType: "shipment",
          sourceSystem: "Mock carrier (synthetic)",
          sourceRecordId: `mock-carrier-${Date.now()}`,
          label: "Carrier update: SHP-30871 delayed in transit",
          references: { shipment: "SHP-30871", purchaseOrder: "PO-77120" },
          dataMode: "synthetic",
        },
      ],
    });
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "not_found" }));
}).listen(PORT, "127.0.0.1", () => {
  console.log(`Mock external sources listening on http://127.0.0.1:${PORT}`);
  console.log("Paths: /mailbox/messages /erp/purchase-orders /carrier/shipments /health");
  console.log("Auth: Bearer (MOCK_SOURCES_API_KEY or default demo key). Never use in production.");
});
