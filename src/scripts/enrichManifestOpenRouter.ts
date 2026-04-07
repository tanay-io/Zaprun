import "dotenv/config";
import axios from "axios";
import fs from "fs";
import path from "path";

type AnyObject = Record<string, any>;

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "qwen/qwen3-coder:free";
const MAX_RETRIES = 5;
const BASE_RETRY_DELAY_MS = 2000;
const REQUEST_TIMEOUT_MS = 120000;

function getRepoRoot(): string {
  return path.resolve(__dirname, "..", "..");
}

function getPluginDirName(providerKey: string): string {
  return providerKey === "notion" ? "Notion" : providerKey;
}

async function getProviderManifest(providerKey: string): Promise<any> {
  const pluginPath = path.resolve(
    getRepoRoot(),
    "src",
    "plugins",
    getPluginDirName(providerKey),
    "manifest",
  );
  const module = await import(pluginPath);
  return module[`${providerKey}Manifest`] || module.manifest;
}

function normalizeNotionTo2026(manifest: AnyObject): AnyObject {
  if (!manifest || !Array.isArray(manifest.actions)) {
    return manifest;
  }

  const notionVersionDescription =
    "Notion API version header. Use `2026-03-11` for current production usage.";

  for (const action of manifest.actions) {
    const inputSchema = action?.inputSchema;
    const headers = inputSchema?.properties?.headers;
    const notionVersion = headers?.properties?.["Notion-Version"];

    if (notionVersion && typeof notionVersion === "object") {
      notionVersion.description = notionVersionDescription;
    }

    if (action?.key === "notion.create_page") {
      const body = inputSchema?.properties?.body;
      const parent = body?.properties?.parent;
      if (parent?.oneOf && Array.isArray(parent.oneOf)) {
        for (const option of parent.oneOf) {
          const props = option?.properties;
          if (!props || typeof props !== "object") continue;

          if (props.database_id) {
            delete props.database_id;
            props.data_source_id = {
              type: "string",
              description: "The ID of the parent data source.",
            };

            if (Array.isArray(option.required)) {
              option.required = option.required.map((item: string) =>
                item === "database_id" ? "data_source_id" : item,
              );
            }

            if (props.type && typeof props.type === "object") {
              props.type.const = "data_source_id";
            }
          }
        }

        if (typeof parent.description === "string") {
          parent.description = parent.description
            .replace(/database_id/g, "data_source_id")
            .replace(/parent database/gi, "parent data source");
        }

        if (typeof parent["x-label"] === "string") {
          parent["x-label"] = parent["x-label"]
            .replace(/database_id/g, "data_source_id")
            .replace(/database/gi, "data source");
        }
      }
    }

    if (action?.key === "notion.append_block_children") {
      const body = inputSchema?.properties?.body;
      const props = body?.properties;
      if (props && typeof props === "object") {
        delete props.after;
        props.position = {
          type: "object",
          description:
            "Insertion position. Preferred over deprecated after. Examples: { type: 'end' }, { type: 'start' }, or { type: 'after_block', after_block: { id: 'BLOCK_ID' } }.",
          oneOf: [
            {
              type: "object",
              properties: {
                type: { type: "string", const: "end" },
              },
              required: ["type"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                type: { type: "string", const: "start" },
              },
              required: ["type"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                type: { type: "string", const: "after_block" },
                after_block: {
                  type: "object",
                  properties: {
                    id: {
                      type: "string",
                      description: "Block ID after which to insert.",
                    },
                  },
                  required: ["id"],
                  additionalProperties: false,
                },
              },
              required: ["type", "after_block"],
              additionalProperties: false,
            },
          ],
          "x-ask-user": true,
          "x-label": "Insert Position",
        };
      }
    }

    if (action?.key === "notion.create_comment") {
      const body = inputSchema?.properties?.body;
      const props = body?.properties;
      if (props && typeof props === "object") {
        body.required = ["rich_text"];
        body.anyOf = [
          { required: ["parent", "rich_text"] },
          { required: ["discussion_id", "rich_text"] },
        ];
      }
    }

    if (action?.key === "notion.update_page") {
      const body = inputSchema?.properties?.body;
      const props = body?.properties;
      if (props && typeof props === "object") {
        if (props.archived && !props.is_archived) {
          props.is_archived = props.archived;
        }
        delete props.archived;

        if (!props.is_locked) {
          props.is_locked = {
            type: "boolean",
            description:
              "Whether the page should be locked from editing in the Notion UI.",
            "x-ask-user": true,
            "x-label": "Lock Page",
          };
        }

        if (!props.erase_content) {
          props.erase_content = {
            type: "boolean",
            description:
              "Whether to erase all existing page content before template merge or on its own.",
            "x-ask-user": true,
            "x-label": "Erase Existing Content",
          };
        }

        if (!props.template) {
          props.template = {
            type: "object",
            description:
              "Optional template application. Supports default template or template_id, with optional timezone.",
            "x-ask-user": true,
            "x-label": "Template (JSON Object)",
          };
        }
      }
    }
  }

  return manifest;
}

function extractJsonObject(text: string): string {
  const trimmed = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Model did not return a JSON object");
  }

  return match[0];
}

function sanitizeJsonText(text: string): string {
  return text
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function parseJsonWithDiagnostics(text: string): AnyObject {
  const candidates = [text, sanitizeJsonText(text)];
  let lastError: unknown;

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as AnyObject;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError instanceof SyntaxError) {
    const match = lastError.message.match(/position (\d+)/i);
    const index = match ? Number(match[1]) : -1;
    const snippet =
      index >= 0
        ? text.slice(Math.max(0, index - 160), Math.min(text.length, index + 160))
        : text.slice(0, 320);

    throw new Error(
      `Failed to parse model JSON near position ${index}. Snippet: ${snippet}`,
    );
  }

  throw lastError;
}

function buildDocsSection(providerKey: string): string {
  const normalized = providerKey.toLowerCase();

  if (normalized === "github") {
    return `DOCS TO USE
- https://docs.github.com/en/rest
- https://docs.github.com/en/rest/about-the-rest-api/about-the-rest-api
- https://docs.github.com/en/rest/about-the-rest-api/api-versions
- https://docs.github.com/en/rest/about-the-rest-api/breaking-changes
- https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
- https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
- https://docs.github.com/en/rest/repos/repos
- https://docs.github.com/en/rest/repos/contents
- https://docs.github.com/en/rest/issues/issues
- https://docs.github.com/en/rest/pulls/pulls
- https://docs.github.com/en/rest/search/search
- https://docs.github.com/en/rest/rate-limit/rate-limit`;
  }

  if (normalized === "notion") {
    return `DOCS TO USE
- https://developers.notion.com/reference/intro
- https://developers.notion.com/reference/versioning
- https://developers.notion.com/reference/post-page
- https://developers.notion.com/reference/retrieve-a-page
- https://developers.notion.com/reference/patch-page
- https://developers.notion.com/reference/move-page
- https://developers.notion.com/reference/post-search
- https://developers.notion.com/reference/get-block-children
- https://developers.notion.com/reference/patch-block-children
- https://developers.notion.com/reference/get-users
- https://developers.notion.com/reference/create-a-comment
- https://developers.notion.com/reference/query-a-data-source
- https://developers.notion.com/reference/database
- https://developers.notion.com/reference/parent-object
- https://developers.notion.com/reference/page
- https://developers.notion.com/reference/block
- https://developers.notion.com/reference/property-object
- https://developers.notion.com/reference/property-value-object
- https://developers.notion.com/reference/user
- https://developers.notion.com/reference/status-codes
- https://developers.notion.com/reference/request-limits`;
  }

  return `DOCS TO USE
- Official API reference, authentication, versioning, error handling, limits, and endpoint docs for ${providerKey}.`;
}

function buildProviderInstructions(providerKey: string): string {
  const normalized = providerKey.toLowerCase();

  if (normalized === "github") {
    return `PRIMARY GROUNDING RULES
1) Treat official GitHub docs as source of truth and ignore stale model memory.
2) First read the linked GitHub docs and determine the current stable REST API version from those docs before enriching the manifest.
3) Use the current stable version and current request or response behavior from the docs rather than hardcoding a version from memory.
4) If docs are unclear, keep schema flexible instead of inventing strict enums or unsupported fields.

VERSIONING REQUIREMENTS (IMPORTANT)
- X-GitHub-Api-Version should remain required where headers are required by the base manifest.
- Descriptions should present whatever version the official docs currently describe as stable or recommended.
- Mention older supported versions only when the docs explicitly say they remain supported or relevant.
- Reflect current GitHub request requirements such as Accept and User-Agent accurately.
- Mark deprecated or removed response/request patterns explicitly with version context when relevant.

PROVIDER-SPECIFIC ENRICHMENT NOTES
- Preserve the existing action keys and top-level manifest shape.
- Expand body and queryParams schemas where GitHub docs are explicit.
- Prefer practical repository automation shapes: repos, contents, issues, pulls, search, rate limits.
- If an endpoint supports mutually exclusive request shapes, use anyOf/oneOf rather than flattening incorrectly.
- Keep schemas compatible with the shared HTTP executor contract: method, url, headers, queryParams, body.`;
  }

  if (normalized === "notion") {
    return `PRIMARY GROUNDING RULES
1) Treat official docs as source of truth and ignore stale model memory.
2) First read the linked Notion docs and determine the current production API version or recommended versioning guidance before enriching the manifest.
3) Use the current documented behavior rather than hardcoding a version from memory.
4) If docs are unclear, keep schema flexible instead of inventing strict enums or constraints.

VERSIONING REQUIREMENTS (IMPORTANT)
- Notion-Version should remain required.
- Descriptions should present whatever version the official docs currently recommend for production use.
- Mention older versions only where the docs explicitly present them as legacy compatibility context.
- Mark deprecated or removed fields explicitly with version context.

PROVIDER-SPECIFIC ENRICHMENT NOTES
- Preserve the existing action keys and top-level manifest shape.
- Expand loose body and queryParams into practical JSON Schema when confidence is high.
- Use x-ask-user: true for user-supplied values such as ids, titles, manual mappings, and ad-hoc filters.
- Keep existing method, url, and header fields intact unless clearly wrong.`;
  }

  return `PRIMARY GROUNDING RULES
1) Treat official docs as source of truth and ignore stale model memory.
2) Prefer the latest stable production behavior expected in 2026.
3) If docs are unclear, keep schema flexible instead of inventing strict enums or constraints.

VERSIONING REQUIREMENTS (IMPORTANT)
- Preserve the provider's current stable versioning guidance where applicable.
- Mark deprecated or removed fields explicitly with version context where possible.

PROVIDER-SPECIFIC ENRICHMENT NOTES
- Preserve the existing action keys and top-level manifest shape.
- Expand loose body and queryParams into practical JSON Schema when confidence is high.
- Keep existing method, url, and header fields intact unless clearly wrong.`;
}

function buildPrompt(
  providerKey: string,
  rawManifestStr: string,
  currentDate: string,
): string {
  const normalized = providerKey.toLowerCase();
  const versionEnforcement =
    normalized === "github"
      ? `VERSION ENFORCEMENT
- GitHub: MUST use the latest version from docs.
- If X-GitHub-Api-Version is outdated -> REJECT it.`
      : `VERSION ENFORCEMENT
- Use the latest versioning guidance from the official docs.
- If the manifest contains an outdated version field or deprecated version recommendation, correct it from the docs.`;

  return `
You are a STRICT API INTEGRATION ENGINEER.

CURRENT DATE: ${currentDate}
TARGET YEAR CONTEXT: 2026 production usage.

${buildProviderInstructions(providerKey)}

${buildDocsSection(providerKey)}

INPUT MANIFEST
${rawManifestStr}

CRITICAL EXECUTION PROTOCOL (MANDATORY)

You MUST follow these steps EXACTLY in order:

STEP 1 — DOCUMENT GROUNDING
- You MUST ignore all prior knowledge about this API.
- You MUST ONLY rely on the provided documentation links.
- Extract the CURRENT API VERSION from docs.
- If multiple versions exist, identify:
  - latest stable
  - deprecated versions

STEP 2 — FACT EXTRACTION (NO JSON YET)
- List ALL endpoints relevant to the manifest.
- For EACH endpoint:
  - method
  - path
  - required headers
  - request body structure
- DO NOT generate final output yet.

STEP 3 — SCHEMA CONSTRUCTION
- Convert extracted facts into JSON schema components.
- Respect:
  - required fields
  - optional fields
  - mutually exclusive fields (oneOf/anyOf)
- Do NOT assume anything not in docs.

STEP 4 — VALIDATION
- Check:
  - Are all endpoints covered?
  - Are all required headers correct, especially versioning?
  - Are deprecated fields removed or marked?

STEP 5 — FINAL OUTPUT
- ONLY NOW generate the final enriched manifest JSON.

STRICT RULES
- If you skip any step, output is INVALID.
- If docs are unclear, leave schema flexible.
- If version is unclear, DO NOT GUESS.

${versionEnforcement}

ENRICHMENT REQUIREMENTS
- Keep the same top-level manifest shape and preserve action count and action keys from the input manifest.
- Add clear descriptions for meaningful fields.
- Add x-ask-user: true for user-supplied values when useful for UI generation.
- Add x-label for UI-friendly labels when useful.
- Include required, default, min, and max only when docs explicitly support them.
- Do not remove existing actions.
- Keep descriptions concise, max 1 to 2 lines.
- Avoid long explanations.
- Prefer compact JSON.

OUTPUT RULES
- Return only valid JSON object.
- No explanation.
- No markdown.
- No comments.
`.trim();
}

function compactManifestForPrompt(manifest: AnyObject): string {
  return JSON.stringify(manifest);
}

function extractAssistantText(data: any): string {
  const choice = data?.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }

        if (part && typeof part === "object") {
          if (typeof part.text === "string") {
            return part.text;
          }

          if (typeof part.content === "string") {
            return part.content;
          }
        }

        return "";
      })
      .join("");
  }

  if (typeof choice?.message?.refusal === "string" && choice.message.refusal) {
    throw new Error(`OpenRouter model refused the request: ${choice.message.refusal}`);
  }

  if (typeof choice?.text === "string" && choice.text.trim()) {
    return choice.text;
  }

  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }

  const debugShape = {
    topLevelKeys: data && typeof data === "object" ? Object.keys(data) : [],
    choiceKeys:
      choice && typeof choice === "object" ? Object.keys(choice) : [],
    messageKeys:
      choice?.message && typeof choice.message === "object"
        ? Object.keys(choice.message)
        : [],
    finishReason: choice?.finish_reason ?? null,
  };

  const rawSnippet =
    typeof data === "string"
      ? data.slice(0, 1200)
      : JSON.stringify(data).slice(0, 1200);

  throw new Error(
    `OpenRouter response did not include assistant text. Response shape: ${JSON.stringify(debugShape)} Raw: ${rawSnippet}`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRetryDelayMs(
  attempt: number,
  retryAfterHeader: string | string[] | undefined,
): number {
  const retryAfterValue = Array.isArray(retryAfterHeader)
    ? retryAfterHeader[0]
    : retryAfterHeader;

  const retryAfterSeconds = Number(retryAfterValue);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1000;
  }

  return BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
}

export async function enrichManifestOpenRouter(providerKey: string) {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set in environment variables");
    process.exit(1);
  }

  const rawManifest = await getProviderManifest(providerKey);
  const rawManifestStr = compactManifestForPrompt(rawManifest);
  const currentDate = new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt(providerKey, rawManifestStr, currentDate);

  console.log(
    `Requesting enrichment for ${providerKey} from OpenRouter model ${OPENROUTER_MODEL}...`,
  );

  let response;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      response = await axios.post(
        OPENROUTER_URL,
        {
          model: OPENROUTER_MODEL,
          temperature: 0.1,
          max_tokens: 12000,
          messages: [
            {
              role: "system",
              content:
                "You produce only valid JSON objects that preserve manifest structure while enriching request schemas from official API docs.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        },
        {
          timeout: REQUEST_TIMEOUT_MS,
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "Accept-Encoding": "identity",
            Connection: "close",
            ...(process.env.OPENROUTER_HTTP_REFERER
              ? { "HTTP-Referer": process.env.OPENROUTER_HTTP_REFERER }
              : {}),
            ...(process.env.OPENROUTER_X_TITLE
              ? { "X-Title": process.env.OPENROUTER_X_TITLE }
              : {}),
          },
          validateStatus: () => true,
        },
      );
    } catch (error: any) {
      const code = error?.code;
      const message = String(error?.message ?? "");
      const isRetriableNetworkError =
        code === "ECONNRESET" ||
        code === "ETIMEDOUT" ||
        code === "ECONNABORTED" ||
        /aborted/i.test(message);

      if (isRetriableNetworkError && attempt < MAX_RETRIES) {
        const delayMs = BASE_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.warn(
          `OpenRouter network failure on attempt ${attempt}/${MAX_RETRIES} (${code ?? message}). Retrying in ${Math.ceil(delayMs / 1000)}s...`,
        );
        await sleep(delayMs);
        continue;
      }

      throw error;
    }

    if (response.status >= 200 && response.status < 300) {
      break;
    }

    if (response.status === 429 && attempt < MAX_RETRIES) {
      const delayMs = getRetryDelayMs(
        attempt,
        response.headers["retry-after"],
      );
      console.warn(
        `OpenRouter rate-limited request attempt ${attempt}/${MAX_RETRIES}. Retrying in ${Math.ceil(delayMs / 1000)}s...`,
      );
      await sleep(delayMs);
      continue;
    }

    if (response.status === 429) {
      const rawMessage =
        response.data?.error?.metadata?.raw ?? response.data?.error?.message;
      throw new Error(
        `OpenRouter rate limit persisted after ${MAX_RETRIES} attempts. ${rawMessage ?? "Retry later or use a different model / BYOK provider key."}`,
      );
    }

    throw new Error(
      `OpenRouter request failed with HTTP ${response.status}: ${JSON.stringify(response.data)}`,
    );
  }

  if (!response) {
    throw new Error("OpenRouter request did not produce a response");
  }

  const assistantText = extractAssistantText(response.data);
  const jsonText = extractJsonObject(assistantText);
  const parsed = parseJsonWithDiagnostics(jsonText);

  const finalManifest =
    providerKey.toLowerCase() === "notion"
      ? normalizeNotionTo2026(parsed)
      : parsed;

  const enriched = JSON.stringify(finalManifest, null, 2);
  const outPath = path.resolve(
    getRepoRoot(),
    "src",
    "plugins",
    getPluginDirName(providerKey),
    "manifest.enriched.json",
  );

  fs.writeFileSync(outPath, enriched);
  console.log(`Saved enriched manifest to ${outPath}`);
}

if (require.main === module) {
  const provider = process.argv[2] || "github";
  enrichManifestOpenRouter(provider).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
