import { ProviderManifest } from "../../types/manifest";

const connectionIdSchema = {
  type: "string",
  minLength: 1,
  description: "Connection id for the authorized Slack workspace",
} as const;

const slackHeadersSchema = {
  type: "object",
  properties: {
    "Content-Type": {
      type: "string",
      const: "application/json",
      description: "Slack Web API write methods support JSON request bodies.",
    },
  },
  additionalProperties: { type: "string" },
  required: ["Content-Type"],
  description:
    "HTTP headers for the Slack API request. Authorization is injected automatically from the connection.",
} as const;

const slackQuerySchema = {
  type: "object",
  additionalProperties: {
    anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
  },
  description: "Optional query string parameters.",
} as const;

const genericOutputSchema = {
  type: "object",
  properties: {
    ok: {
      type: "boolean",
      description: "Slack API success flag.",
    },
    error: {
      type: "string",
      description: "Slack error code when ok=false.",
    },
  },
  additionalProperties: true,
  description: "Raw JSON response body returned by the Slack API.",
} as const;

const slackEventEnvelopeSchema = {
  type: "object",
  properties: {
    type: {
      type: "string",
      description:
        "Outer event type, such as event_callback or url_verification.",
    },
    team_id: {
      type: "string",
      description: "Workspace id where the event occurred.",
    },
    api_app_id: {
      type: "string",
      description: "Slack app id receiving the event.",
    },
    event_id: {
      type: "string",
      description: "Globally unique event id.",
    },
    event_time: {
      type: "number",
      description: "Unix epoch timestamp of dispatch time.",
    },
    challenge: {
      type: "string",
      description:
        "Slack URL verification challenge value for url_verification requests.",
    },
    event: {
      type: "object",
      description: "Inner Slack event payload.",
      additionalProperties: true,
    },
    authorizations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: true,
      },
      description: "Installations visible to the event.",
    },
  },
  additionalProperties: true,
  description: "Slack Events API event envelope.",
} as const;

function slackAction(
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

export const slackManifest: ProviderManifest = {
  key: "slack",
  name: "Slack",
  description:
    "Send authenticated requests to the Slack Web API for messaging, conversations, users, and files.",
  iconUrl:
    "https://a.slack-edge.com/80588/marketing/img/meta/slack_hash_256.png",
  docsUrl: "https://docs.slack.dev/",
  authType: "oauth2",
  authConfig: {
    type: "oauth2",
    authorizationUrl: "https://slack.com/oauth/v2/authorize",
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    scopes: [
      "chat:write",
      "channels:read",
      "channels:write",
      "channels:write.invites",
      "groups:read",
      "groups:write",
      "im:read",
      "mpim:read",
      "users:read.email",
      "files:write",
    ],
    pkce: false,
    tokenAuthMethod: "basic",
    tokenRequestFormat: "form",
  },
  triggers: [
    {
      key: "slack.events_webhook",
      name: "Slack Events Webhook",
      description:
        "Receive Slack Events API payloads over HTTP. Payload includes event_callback envelopes and url_verification challenge requests.",
      triggerType: "webhook",
      outputSchema: slackEventEnvelopeSchema,
    },
  ],
  actions: [
    slackAction(
      "slack.api_request",
      "Slack API Request",
      "Call any Slack Web API endpoint with a raw HTTP configuration.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTP method for the Slack API call.",
          },
          url: {
            type: "string",
            minLength: 1,
            format: "uri",
            pattern: "^https://slack\\.com/api/",
            description: "Full Slack API URL.",
          },
          headers: slackHeadersSchema,
          queryParams: slackQuerySchema,
          body: {
            description:
              "Optional JSON body. Tokens should not be sent in body because Authorization is injected automatically.",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    slackAction(
      "slack.post_message",
      "Post Message",
      "Send a message to a conversation using chat.postMessage.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://slack.com/api/chat.postMessage",
          },
          headers: slackHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              channel: {
                type: "string",
                minLength: 1,
                description:
                  "Channel, private channel, MPIM, IM, or user id depending on context.",
              },
              text: {
                type: "string",
                description:
                  "Message text. Recommended as fallback text when blocks are used.",
              },
              blocks: {
                type: "array",
                items: { type: "object" },
                description: "Block Kit array for rich messages.",
              },
              attachments: {
                type: "array",
                items: { type: "object" },
                description: "Legacy attachments array.",
              },
              thread_ts: {
                type: "string",
                description: "Parent message ts to post as a reply.",
              },
              reply_broadcast: {
                type: "boolean",
                description: "Broadcast a threaded reply to channel.",
              },
              unfurl_links: {
                type: "boolean",
              },
              unfurl_media: {
                type: "boolean",
              },
              metadata: {
                type: "object",
                additionalProperties: true,
              },
            },
            required: ["channel"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    slackAction(
      "slack.update_message",
      "Update Message",
      "Update a message using chat.update.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: { type: "string", const: "https://slack.com/api/chat.update" },
          headers: slackHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              channel: {
                type: "string",
                minLength: 1,
                description: "Conversation id containing the target message.",
              },
              ts: {
                type: "string",
                minLength: 1,
                description: "Timestamp id of the message to update.",
              },
              text: { type: "string" },
              blocks: {
                type: "array",
                items: { type: "object" },
              },
              attachments: {
                type: "array",
                items: { type: "object" },
              },
              file_ids: {
                type: "array",
                items: { type: "string" },
              },
              metadata: {
                type: "object",
                additionalProperties: true,
              },
            },
            required: ["channel", "ts"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    slackAction(
      "slack.list_conversations",
      "List Conversations",
      "List channels and conversations visible to the token using conversations.list.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            const: "https://slack.com/api/conversations.list",
          },
          headers: slackHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              cursor: { type: "string" },
              exclude_archived: { type: "boolean" },
              limit: { type: "number", minimum: 1, maximum: 999 },
              team_id: { type: "string" },
              types: {
                type: "string",
                description:
                  "Comma-separated list of conversation types: public_channel,private_channel,mpim,im.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    slackAction(
      "slack.create_conversation",
      "Create Conversation",
      "Create a public or private channel using conversations.create.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://slack.com/api/conversations.create",
          },
          headers: slackHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: {
                type: "string",
                minLength: 1,
                maxLength: 80,
                pattern: "^[a-z0-9_-]+$",
                description:
                  "Channel name using lowercase letters, numbers, hyphens, and underscores.",
              },
              is_private: { type: "boolean" },
              team_id: { type: "string" },
            },
            required: ["name"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    slackAction(
      "slack.invite_to_conversation",
      "Invite Users To Conversation",
      "Invite users to a channel with conversations.invite.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://slack.com/api/conversations.invite",
          },
          headers: slackHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              channel: {
                type: "string",
                minLength: 1,
                description: "Channel id where users should be invited.",
              },
              users: {
                type: "string",
                minLength: 1,
                description: "Comma-separated list of user ids to invite.",
              },
              force: {
                type: "boolean",
                description:
                  "When true with multiple users, valid users are invited even if some ids are invalid.",
              },
            },
            required: ["channel", "users"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    slackAction(
      "slack.lookup_user_by_email",
      "Lookup User By Email",
      "Find a user by email with users.lookupByEmail.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            const: "https://slack.com/api/users.lookupByEmail",
          },
          headers: slackHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              email: {
                type: "string",
                format: "email",
                description: "Email address belonging to a workspace user.",
              },
            },
            required: ["email"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "queryParams"],
      },
    ),
    slackAction(
      "slack.get_upload_url_external",
      "Get Upload URL External",
      "Start external file upload with files.getUploadURLExternal.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://slack.com/api/files.getUploadURLExternal",
          },
          headers: slackHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              filename: {
                type: "string",
                minLength: 1,
              },
              length: {
                type: "number",
                minimum: 1,
                description: "File size in bytes.",
              },
              snippet_type: { type: "string" },
              alt_txt: { type: "string" },
            },
            required: ["filename", "length"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    slackAction(
      "slack.complete_upload_external",
      "Complete Upload External",
      "Finalize an upload started with files.getUploadURLExternal.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://slack.com/api/files.completeUploadExternal",
          },
          headers: slackHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              files: {
                type: "array",
                minItems: 1,
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    id: { type: "string", minLength: 1 },
                    title: { type: "string" },
                  },
                  required: ["id"],
                },
              },
              channel_id: { type: "string" },
              channels: {
                type: "string",
                description:
                  "Comma-separated channel ids or user ids to share the file to.",
              },
              thread_ts: { type: "string" },
              initial_comment: { type: "string" },
              blocks: {
                type: "array",
                items: { type: "object" },
              },
            },
            required: ["files"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
  ],
};
