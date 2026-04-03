import { ProviderManifest } from "../../types/manifest";

/**
 * HTTP provider manifest — the reference plugin implementation.
 *
 * This is the simplest possible integration: no auth, one action (make an HTTP request).
 * Every future plugin (Slack, GitHub, Gmail, Stripe) follows this same pattern.
 */
export const httpManifest: ProviderManifest = {
  key: "http",
  name: "HTTP Request",
  description:
    "Make outbound HTTP requests to any URL. Supports GET, POST, PUT, PATCH, DELETE with custom headers and body.",
  iconUrl: undefined,
  docsUrl: undefined,
  authType: "none",
  authConfig: { type: "none" },

  triggers: [],

  actions: [
    {
      key: "http",
      name: "HTTP Request",
      description:
        "Execute an HTTP request with configurable method, URL, headers, and body.",
      inputSchema: {
        type: "object",
        properties: {
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTP method",
          },
          url: {
            type: "string",
            format: "uri",
            description: "Request URL",
          },
          headers: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Request headers",
          },
          queryParams: {
            type: "object",
            additionalProperties: { type: "string" },
            description: "Query params appended to URL",
          },
          body: {
            description: "Request body (for POST/PUT/PATCH)",
          },
        },
        required: ["method", "url"],
      },
      outputSchema: {
        type: "object",
        description: "The HTTP response body",
      },
      requiresConnection: false,
    },
  ],
};
