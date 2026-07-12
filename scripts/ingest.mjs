import process from "node:process";

const baseUrl = process.env.TRAKR_SERVICE_URL ?? process.env.SMOKE_BASE_URL;
const key = process.env.INGEST_API_KEY;

if (!baseUrl) {
  console.error("TRAKR_SERVICE_URL or SMOKE_BASE_URL is required.");
  process.exit(1);
}

const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/ingest`, {
  method: "POST",
  headers: key ? { "x-ingest-api-key": key } : {},
});
const body = await response.text();
console.log(body);

if (!response.ok) {
  process.exit(1);
}
