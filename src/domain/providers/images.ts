import { apiKeyFor, baseUrlFor } from "./index.ts";

// Image generation via OpenAI's images API. Returns a value usable directly as
// an <img src> — a base64 data URL when the model returns b64_json, else the URL.
export const generateImage = async (model: string, prompt: string, signal?: AbortSignal): Promise<string> => {
  const apiKey = await apiKeyFor("openai");
  if (!apiKey) throw new Error("No OpenAI API key set. Add one in Settings.");
  const base = (await baseUrlFor("openai")) || "https://api.openai.com/v1";

  const res = await fetch(`${base}/images/generations`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    signal,
    body: JSON.stringify({ model, prompt, n: 1, size: "1024x1024" }),
  });
  if (!res.ok) throw new Error(`Image generation failed: ${res.status} ${await res.text()}`);

  const data = (await res.json()) as { data: { b64_json?: string; url?: string }[] };
  const first = data.data[0];
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url) return first.url;
  throw new Error("Image generation returned no image.");
};
