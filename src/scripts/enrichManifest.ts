import "dotenv/config";
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

type AnyObject = Record<string, any>;

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

    // 2026 page parent model uses data_source_id for data source parenting.
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
  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("Model did not return a JSON object");
  }

  return match[0];
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

  if (normalized === "slack") {
    return `DOCS TO USE
- https://docs.slack.dev/apis/web-api/
- https://docs.slack.dev/apis/events-api/
- https://docs.slack.dev/apis/events-api/using-http-request-urls/
- https://docs.slack.dev/authentication/installing-with-oauth/
- https://docs.slack.dev/reference/methods/oauth.v2.access/
- https://docs.slack.dev/reference/methods/chat.postMessage/
- https://docs.slack.dev/reference/methods/chat.update/
- https://docs.slack.dev/reference/methods/conversations.list/
- https://docs.slack.dev/reference/methods/conversations.create/
- https://docs.slack.dev/reference/methods/conversations.invite/
- https://docs.slack.dev/reference/methods/users.lookupByEmail/
- https://docs.slack.dev/reference/methods/files.getUploadURLExternal/
- https://docs.slack.dev/reference/methods/files.completeUploadExternal/`;
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

  if (normalized === "slack") {
    return `PRIMARY GROUNDING RULES
1) Treat official Slack docs as source of truth and ignore stale model memory.
2) First read the linked Slack docs and verify current behavior for Web API, OAuth v2, and Events API payloads.
3) Use current documented request/response behavior instead of assumptions from older Slack APIs.
4) If docs are unclear, keep schema flexible instead of inventing strict enums or constraints.

VERSIONING REQUIREMENTS (IMPORTANT)
- Slack Web API does not require a per-request API version header; do not invent one.
- Keep existing auth and endpoint guidance aligned with docs: OAuth token exchange and Web API bearer token usage.
- Mark deprecated or legacy fields only when the docs explicitly identify them.

PROVIDER-SPECIFIC ENRICHMENT NOTES
- Preserve the existing action keys and top-level manifest shape, including triggers.
- Preserve Slack Events API envelope support, including url_verification challenge payloads.
- Keep method, url, headers, queryParams, and body compatible with the shared HTTP executor contract.
- Keep connectionId and OAuth assumptions intact; do not add token fields to action inputs.`;
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
      : normalized === "slack"
        ? `VERSION ENFORCEMENT
- Slack: DO NOT invent API version headers.
- Keep Slack API URLs and OAuth token exchange behavior aligned with official docs.
- If docs indicate method-specific payload changes, apply them without changing action keys.`
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

STEP 1 - DOCUMENT GROUNDING
- You MUST ignore all prior knowledge about this API.
- You MUST ONLY rely on the provided documentation links.
- Extract the CURRENT API VERSION from docs.
- If multiple versions exist, identify:
  - latest stable
  - deprecated versions

STEP 2 - FACT EXTRACTION (NO JSON YET)
- List ALL endpoints relevant to the manifest.
- For EACH endpoint:
  - method
  - path
  - required headers
  - request body structure
- DO NOT generate final output yet.

STEP 3 - SCHEMA CONSTRUCTION
- Convert extracted facts into JSON schema components.
- Respect:
  - required fields
  - optional fields
  - mutually exclusive fields (oneOf/anyOf)
- Do NOT assume anything not in docs.

STEP 4 - VALIDATION
- Check:
  - Are all endpoints covered?
  - Are all required headers correct, especially versioning?
  - Are deprecated fields removed or marked?

STEP 5 - FINAL OUTPUT
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

function restoreMissingTopLevelSections(
  rawManifest: AnyObject,
  enrichedManifest: AnyObject,
): AnyObject {
  const merged: AnyObject = { ...enrichedManifest };

  if (
    Array.isArray(rawManifest?.triggers) &&
    rawManifest.triggers.length > 0 &&
    (!Array.isArray(enrichedManifest?.triggers) ||
      enrichedManifest.triggers.length === 0)
  ) {
    merged.triggers = rawManifest.triggers;
  }

  return merged;
}

export async function enrichManifest(providerKey: string) {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is not set in environment variables");
    process.exit(1);
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" }, // Forces JSON
  });

  // 2. Load your raw manifest
  const rawManifest = await getProviderManifest(providerKey);
  const rawManifestStr = JSON.stringify(rawManifest, null, 2);
  const currentDate = new Date().toISOString().slice(0, 10);
  const prompt = buildPrompt(providerKey, rawManifestStr, currentDate);

  console.log(`⏳ Requesting enrichment for ${providerKey} from Gemini...`);
  const result = await model.generateContent(prompt);
  const enrichedText = result.response.text();
  const jsonText = extractJsonObject(enrichedText);
  const parsed = JSON.parse(jsonText) as AnyObject;
  const hydrated = restoreMissingTopLevelSections(rawManifest, parsed);

  const finalManifest =
    providerKey.toLowerCase() === "notion"
      ? normalizeNotionTo2026(hydrated)
      : hydrated;

  const enriched = JSON.stringify(finalManifest, null, 2);

  const outPath = path.resolve(
    getRepoRoot(),
    "src",
    "plugins",
    getPluginDirName(providerKey),
    "manifest.enriched.json",
  );
  fs.writeFileSync(outPath, enriched);
  console.log(`✅ ${providerKey} manifest enriched and saved to ${outPath}!`);
}

// Run if called directly
if (require.main === module) {
  // Default to notion if no arg is provided
  const provider = process.argv[2] || "notion";
  enrichManifest(provider).catch(console.error);
}
