import { ProviderManifest } from "../../types/manifest";

const connectionIdSchema = {
  type: "string",
  minLength: 1,
  description: "Connection id for the authorized Gmail account.",
} as const;

const gmailHeadersSchema = {
  type: "object",
  properties: {
    "Content-Type": {
      type: "string",
      const: "application/json",
      description: "Gmail API requests in this manifest use JSON bodies.",
    },
  },
  additionalProperties: { type: "string" },
  required: ["Content-Type"],
  description:
    "HTTP headers for Gmail API requests. Authorization is injected automatically from the OAuth connection.",
} as const;

const gmailQuerySchema = {
  type: "object",
  additionalProperties: {
    anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
  },
  description: "Optional query string parameters.",
} as const;

const genericOutputSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description: "Gmail resource id when returned by the endpoint.",
    },
    threadId: {
      type: "string",
      description: "Thread id associated with the message or thread resource.",
    },
    historyId: {
      type: "string",
      description: "Mailbox history id when present.",
    },
    messages: {
      type: "array",
      description: "List payload for message-list endpoints when present.",
      items: {
        type: "object",
        additionalProperties: true,
      },
    },
    error: {
      type: "object",
      description: "Google API error object when the request fails.",
      additionalProperties: true,
    },
  },
  additionalProperties: true,
  description: "Raw JSON response body returned by the Gmail API.",
} as const;

const gmailPushNotificationSchema = {
  type: "object",
  properties: {
    message: {
      type: "object",
      properties: {
        data: {
          type: "string",
          description:
            "Base64url-encoded JSON containing Gmail watch update fields like emailAddress and historyId.",
        },
        messageId: {
          type: "string",
          description: "Pub/Sub message id.",
        },
        publishTime: {
          type: "string",
          description: "RFC3339 publish timestamp.",
        },
        attributes: {
          type: "object",
          additionalProperties: { type: "string" },
          description: "Optional Pub/Sub attributes map.",
        },
      },
      additionalProperties: true,
      description: "Pub/Sub push message envelope sent by Gmail watch.",
    },
    subscription: {
      type: "string",
      description: "Pub/Sub subscription resource name.",
    },
  },
  additionalProperties: true,
  description:
    "Gmail push notification payload delivered through Google Cloud Pub/Sub push to the webhook endpoint.",
} as const;

function gmailAction(
  key: string,
  name: string,
  description: string,
  inputSchema: Record<string, unknown>,
) {
  return {
    key,
    name,
    description,
    inputSchema,
    outputSchema: genericOutputSchema,
    requiresConnection: true,
  } as const;
}

export const gmailManifest: ProviderManifest = {
  key: "gmail",
  name: "Gmail",
  description:
    "Send authenticated requests to the Gmail API for message, draft, thread, and mailbox automation workflows.",
  iconUrl: "https://ssl.gstatic.com/ui/v1/icons/mail/rfr/gmail.ico",
  docsUrl: "https://developers.google.com/gmail/api/reference/rest",
  authType: "oauth2",
  authConfig: {
    type: "oauth2",
    authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/gmail.metadata",
    ],
    pkce: false,
    tokenAuthMethod: "body",
    tokenRequestFormat: "form",
    authorizationParams: {
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
    },
  },
  triggers: [
    {
      key: "gmail.watch_notification",
      name: "Gmail Watch Notification",
      description:
        "Receive Gmail watch push notifications (Pub/Sub push envelope) on POST /webhook/:zapId.",
      triggerType: "webhook",
      outputSchema: gmailPushNotificationSchema,
    },
  ],
  actions: [
    gmailAction(
      "gmail.api_request",
      "Gmail API Request",
      "Call any Gmail REST API endpoint with a raw HTTP configuration.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTP method for the Gmail API call.",
          },
          url: {
            type: "string",
            minLength: 1,
            format: "uri",
            pattern: "^https://gmail\\.googleapis\\.com/gmail/v1/",
            description: "Full Gmail API URL.",
          },
          headers: gmailHeadersSchema,
          queryParams: gmailQuerySchema,
          body: {
            description: "Optional JSON request body.",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    gmailAction(
      "gmail.watch_mailbox",
      "Watch Mailbox",
      "Start or renew push notifications using users.watch.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://gmail.googleapis.com/gmail/v1/users/me/watch",
          },
          headers: gmailHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              topicName: {
                type: "string",
                minLength: 1,
                pattern: "^projects/[^/]+/topics/[^/]+$",
                description:
                  "Fully qualified Pub/Sub topic name, for example projects/my-project/topics/my-topic.",
              },
              labelIds: {
                type: "array",
                items: { type: "string" },
                description:
                  "Optional label filters. If omitted, changes across mailbox are watched.",
              },
              labelFilterBehavior: {
                type: "string",
                enum: ["include", "exclude"],
                description:
                  "How labelIds are applied: include only matching labels or exclude matching labels.",
              },
            },
            required: ["topicName"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    gmailAction(
      "gmail.list_history",
      "List Mailbox History",
      "Fetch mailbox changes after a history id using users.history.list.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            const: "https://gmail.googleapis.com/gmail/v1/users/me/history",
          },
          headers: gmailHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              startHistoryId: {
                type: "string",
                minLength: 1,
                description:
                  "Required start history id from watch response, message/thread historyId, or prior history.list response.",
              },
              maxResults: {
                type: "number",
                minimum: 1,
                maximum: 500,
                description:
                  "Maximum number of history records to return (1-500).",
              },
              pageToken: {
                type: "string",
                description:
                  "Pagination token from a previous history response.",
              },
              labelId: {
                type: "string",
                description: "Optional label id filter for history records.",
              },
              historyTypes: {
                anyOf: [
                  {
                    type: "array",
                    items: {
                      type: "string",
                      enum: [
                        "messageAdded",
                        "messageDeleted",
                        "labelAdded",
                        "labelRemoved",
                      ],
                    },
                  },
                  {
                    type: "string",
                    description:
                      "Comma-separated history types for clients that send text input.",
                  },
                ],
                description:
                  "Optional history type filters: messageAdded, messageDeleted, labelAdded, labelRemoved.",
              },
            },
            required: ["startHistoryId"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "queryParams"],
      },
    ),
    gmailAction(
      "gmail.stop_mailbox_watch",
      "Stop Mailbox Watch",
      "Stop push notifications for the mailbox using users.stop.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://gmail.googleapis.com/gmail/v1/users/me/stop",
          },
          headers: gmailHeadersSchema,
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    gmailAction(
      "gmail.list_messages",
      "List Messages",
      "List mailbox messages using users.messages.list.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            const: "https://gmail.googleapis.com/gmail/v1/users/me/messages",
          },
          headers: gmailHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              q: {
                type: "string",
                description:
                  "Gmail search query (same syntax as Gmail search box).",
              },
              maxResults: {
                type: "number",
                minimum: 1,
                maximum: 500,
                description: "Maximum number of messages to return (1-500).",
              },
              pageToken: {
                type: "string",
                description: "Pagination token from previous response.",
              },
              includeSpamTrash: {
                type: "boolean",
                description: "Include spam and trash in results when true.",
              },
              labelIds: {
                anyOf: [
                  {
                    type: "array",
                    items: { type: "string" },
                  },
                  {
                    type: "string",
                    description:
                      "Comma-separated label ids for clients that send text input.",
                  },
                ],
                description: "Label filters to apply to the message list.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    gmailAction(
      "gmail.get_message",
      "Get Message",
      "Get a specific message by id using users.messages.get.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            format: "uri",
            pattern:
              "^https://gmail\\.googleapis\\.com/gmail/v1/users/me/messages/[^/]+$",
            description:
              "Message URL, for example https://gmail.googleapis.com/gmail/v1/users/me/messages/18c0...",
          },
          headers: gmailHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              format: {
                type: "string",
                enum: ["minimal", "full", "raw", "metadata"],
                description: "Response format for the message payload.",
              },
              metadataHeaders: {
                anyOf: [
                  {
                    type: "array",
                    items: { type: "string" },
                  },
                  {
                    type: "string",
                    description:
                      "Comma-separated header names for clients that send text input.",
                  },
                ],
                description: "Header names to include with format=metadata.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    gmailAction(
      "gmail.send_message",
      "Send Message",
      "Send a MIME email using users.messages.send.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const:
              "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
          },
          headers: gmailHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              raw: {
                type: "string",
                minLength: 1,
                description:
                  "Base64url-encoded RFC 2822 email message (MIME content).",
              },
              threadId: {
                type: "string",
                description:
                  "Optional thread id to send as a reply in an existing thread.",
              },
              labelIds: {
                type: "array",
                items: { type: "string" },
                description: "Optional label ids to apply to the sent message.",
              },
            },
            required: ["raw"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    gmailAction(
      "gmail.modify_message",
      "Modify Message Labels",
      "Add or remove labels on a message using users.messages.modify.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            format: "uri",
            pattern:
              "^https://gmail\\.googleapis\\.com/gmail/v1/users/me/messages/[^/]+/modify$",
            description:
              "Modify URL, for example https://gmail.googleapis.com/gmail/v1/users/me/messages/18c0.../modify",
          },
          headers: gmailHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              addLabelIds: {
                type: "array",
                items: { type: "string" },
                description: "Labels to add to the message.",
              },
              removeLabelIds: {
                type: "array",
                items: { type: "string" },
                description: "Labels to remove from the message.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    gmailAction(
      "gmail.create_draft",
      "Create Draft",
      "Create a draft message using users.drafts.create.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://gmail.googleapis.com/gmail/v1/users/me/drafts",
          },
          headers: gmailHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              message: {
                type: "object",
                additionalProperties: false,
                properties: {
                  raw: {
                    type: "string",
                    minLength: 1,
                    description:
                      "Base64url-encoded RFC 2822 draft message content.",
                  },
                  threadId: {
                    type: "string",
                    description: "Optional thread id for draft replies.",
                  },
                  labelIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional labels for the draft message.",
                  },
                },
                required: ["raw"],
              },
            },
            required: ["message"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    gmailAction(
      "gmail.list_threads",
      "List Threads",
      "List conversation threads using users.threads.list.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            const: "https://gmail.googleapis.com/gmail/v1/users/me/threads",
          },
          headers: gmailHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              q: {
                type: "string",
                description: "Gmail search query used to filter threads.",
              },
              maxResults: {
                type: "number",
                minimum: 1,
                maximum: 500,
                description: "Maximum number of threads to return (1-500).",
              },
              pageToken: {
                type: "string",
                description: "Pagination token from previous response.",
              },
              includeSpamTrash: {
                type: "boolean",
                description: "Include spam and trash when true.",
              },
              labelIds: {
                anyOf: [
                  {
                    type: "array",
                    items: { type: "string" },
                  },
                  {
                    type: "string",
                    description:
                      "Comma-separated label ids for clients that send text input.",
                  },
                ],
                description: "Label filters to apply to thread listing.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
  ],
};
