import { ProviderManifest } from "../../types/manifest";

const notionHeadersSchema = {
  type: "object",
  properties: {
    "Notion-Version": {
      type: "string",
      description: "Notion API version header, for example ",
    },
  },
  additionalProperties: { type: "string" },
  required: ["Notion-Version"],
  description:
    "HTTP headers for the Notion API request. Authorization is injected automatically from the connection.",
} as const;

const connectionIdSchema = {
  type: "string",
  minLength: 1,
  description: "Connection id for the authorized Notion workspace",
} as const;

const genericOutputSchema = {
  type: "object",
  description: "Raw JSON response body returned by the Notion API",
} as const;

function notionAction(
  key: string,
  name: string,
  description: string,
  configSchema: Record<string, unknown>,
) {
  return {
    key,
    name,
    description,
    inputSchema: configSchema,
    outputSchema: genericOutputSchema,
    requiresConnection: true,
  } as const;
}

export const notionManifest: ProviderManifest = {
  key: "notion",
  name: "Notion",
  description:
    "Send authenticated requests to the Notion API for pages, data sources, blocks, comments, search, and user resources.",
  iconUrl:
    "https://upload.wikimedia.org/wikipedia/commons/4/45/Notion_app_logo.png",
  docsUrl: "https://developers.notion.com/reference/intro",
  authType: "oauth2",
  authConfig: {
    type: "oauth2",
    authorizationUrl: "https://api.notion.com/v1/oauth/authorize",
    tokenUrl: "https://api.notion.com/v1/oauth/token",
    scopes: [],
    pkce: false,
    authorizationParams: {
      owner: "user",
    },
    tokenAuthMethod: "basic",
    tokenRequestFormat: "json",
  },
  triggers: [],
  actions: [
    notionAction(
      "notion.api_request",
      "Notion API Request",
      "Call any Notion API endpoint with a raw HTTP configuration.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            enum: ["GET", "POST", "PATCH", "DELETE"],
            description: "HTTP method for the Notion API call",
          },
          url: {
            type: "string",
            minLength: 1,
            format: "uri",
            pattern: "^https://api\\.notion\\.com/v1/",
            description: "Full Notion API URL",
          },
          headers: notionHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: {
              anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
            },
            description: "Optional query string parameters",
          },
          body: {
            description: "Optional JSON body for POST and PATCH requests",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    notionAction(
      "notion.search",
      "Search",
      "Search pages and data sources in a Notion workspace.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "POST",
          },
          url: {
            type: "string",
            const: "https://api.notion.com/v1/search",
          },
          headers: notionHeadersSchema,
          body: {
            type: "object",
            description:
              "Notion search request body. Example: { query, filter, sort, start_cursor, page_size }",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    notionAction(
      "notion.create_page",
      "Create Page",
      "Create a new Notion page in a parent page or datai source.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "POST",
          },
          url: {
            type: "string",
            const: "https://api.notion.com/v1/pages",
          },
          headers: notionHeadersSchema,
          body: {
            type: "object",
            description:
              "Create page payload. Must include parent and properties, and may include children, icon, or cover.",
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    notionAction(
      "notion.get_page",
      "Get Page",
      "Retrieve a page by id.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "GET",
          },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.notion\\.com/v1/pages/[^/]+$",
          },
          headers: notionHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: {
              anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
            },
            description: "Optional query parameters",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    notionAction(
      "notion.update_page",
      "Update Page",
      "Update page properties, icon, cover, or archive state.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "PATCH",
          },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.notion\\.com/v1/pages/[^/]+$",
          },
          headers: notionHeadersSchema,
          body: {
            type: "object",
            description:
              "Update page payload. Example fields: properties, archived, in_trash, icon, cover.",
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    notionAction(
      "notion.query_data_source",
      "Query Data Source",
      "Query entries from a Notion data source.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "POST",
          },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.notion\\.com/v1/data_sources/[^/]+/query$",
          },
          headers: notionHeadersSchema,
          body: {
            type: "object",
            description:
              "Query payload. Example fields: filter, sorts, start_cursor, page_size.",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    notionAction(
      "notion.get_block_children",
      "Get Block Children",
      "List children for a block.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "GET",
          },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.notion\\.com/v1/blocks/[^/]+/children$",
          },
          headers: notionHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: {
              anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
            },
            description: "Optional query parameters such as start_cursor or page_size",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    notionAction(
      "notion.append_block_children",
      "Append Block Children",
      "Append child blocks to an existing block.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "PATCH",
          },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.notion\\.com/v1/blocks/[^/]+/children$",
          },
          headers: notionHeadersSchema,
          body: {
            type: "object",
            description:
              "Append children payload. Usually includes a children array and optionally after.",
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    notionAction(
      "notion.create_comment",
      "Create Comment",
      "Create a comment on a page or block discussion thread.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "POST",
          },
          url: {
            type: "string",
            const: "https://api.notion.com/v1/comments",
          },
          headers: notionHeadersSchema,
          body: {
            type: "object",
            description:
              "Create comment payload. Must follow Notion's comments API shape.",
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    notionAction(
      "notion.list_users",
      "List Users",
      "List users and bots in the connected Notion workspace.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            const: "GET",
          },
          url: {
            type: "string",
            const: "https://api.notion.com/v1/users",
          },
          headers: notionHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: {
              anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
            },
            description: "Optional query parameters such as start_cursor or page_size",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
  ],
};
