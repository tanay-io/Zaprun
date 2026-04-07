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

    // 2026 recommends position over deprecated after.
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

    // Comment parent/discussion_id are mutually exclusive in docs.
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

    // Update page modern fields.
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

export async function enrichManifest(providerKey: string) {
  if (!process.env.GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY is not set in environment variables");
    process.exit(1);
  }

  // 1. Setup the model (Pro is better for structured complex docs)
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    // fallback to flash if pro hits free tier limits.
    generationConfig: { responseMimeType: "application/json" }, // Forces JSON
  });

  // 2. Load your raw manifest
  const rawManifest = await getProviderManifest(providerKey);
  const rawManifestStr = JSON.stringify(rawManifest, null, 2);
  const currentDate = new Date().toISOString().slice(0, 10);

  const prompt = `
You are a Senior Integration Engineer enriching the ${providerKey} manifest.

CURRENT DATE: ${currentDate}
TARGET YEAR CONTEXT: 2026 production usage.

PRIMARY GROUNDING RULES
1) Treat official docs as source of truth and ignore stale model memory.
2) First read every linked Notion doc and determine the current production API version or recommended versioning guidance before enriching the manifest.
3) Use the current documented behavior rather than hardcoding a version from memory.
4) If docs are unclear, keep schema flexible instead of inventing strict enums/constraints.

DOCS TO USE
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
- https://developers.notion.com/reference/request-limits

INPUT MANIFEST
${rawManifestStr}

TASK
Return one enriched manifest JSON object that keeps the same top-level shape and action keys, while improving request schemas.

ENRICHMENT REQUIREMENTS
- Expand loose body/queryParams into practical JSON Schema when confidence is high.
- Add clear description for meaningful fields.
- Add x-ask-user: true for user-supplied values (ids, titles, manual mappings, ad-hoc filters).
- Add x-label for UI-friendly labels.
- Include required/default/min/max only when docs explicitly support it.
- Keep existing method/url/header fields intact unless clearly wrong.

VERSIONING REQUIREMENTS (IMPORTANT)
- Notion-Version should remain required.
- Descriptions should present whatever version the official docs currently recommend for production use.
- Mention older versions only where the docs explicitly present them as legacy compatibility context.
- Mark deprecated/removed fields explicitly with version context.

OUTPUT RULES
- Return only valid JSON object (no markdown, no comments, no code fences).
- Preserve action count and action keys from the input manifest.
- Do not remove existing actions.
- Before producing the JSON, read the linked docs first and infer the current stable versioning guidance from them.
  `;

  console.log(`⏳ Requesting enrichment for ${providerKey} from Gemini...`);
  const result = await model.generateContent(prompt);
  const enrichedText = result.response.text();
  const jsonText = extractJsonObject(enrichedText);
  const parsed = JSON.parse(jsonText) as AnyObject;

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
  console.log(`✅ ${providerKey} manifest enriched and saved to ${outPath}!`);
}

// Run if called directly
if (require.main === module) {
  // Default to notion if no arg is provided
  const provider = process.argv[2] || "notion";
  enrichManifest(provider).catch(console.error);
}
