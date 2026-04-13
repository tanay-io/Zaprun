import { ProviderManifest } from "../../types/manifest";

const connectionIdSchema = {
  type: "string",
  minLength: 1,
  description:
    "Connection id for the authorized Stripe account. Use a secret key connection.",
} as const;

const stripeHeadersSchema = {
  type: "object",
  properties: {
    "Content-Type": {
      type: "string",
      enum: ["application/x-www-form-urlencoded", "application/json"],
      description:
        "Stripe v1 API request content type. Stripe docs primarily use form-encoded request bodies.",
    },
    "Idempotency-Key": {
      type: "string",
      description:
        "Optional idempotency key for safe retries on POST requests.",
    },
    "Stripe-Version": {
      type: "string",
      description:
        "Optional per-request API version override. If omitted, account default API version applies.",
    },
    "Stripe-Account": {
      type: "string",
      description:
        "Optional connected account id (acct_...) for Stripe Connect requests.",
    },
  },
  additionalProperties: { type: "string" },
  required: ["Content-Type"],
  description:
    "HTTP headers for the Stripe API request. Authorization is injected automatically from the connection.",
} as const;

const stripeQuerySchema = {
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
      description: "Stripe object id when present.",
    },
    object: {
      type: "string",
      description: "Stripe object type discriminator.",
    },
    error: {
      type: "object",
      description: "Stripe error payload when request fails.",
      additionalProperties: true,
    },
  },
  additionalProperties: true,
  description: "Raw JSON response body returned by the Stripe API.",
} as const;

const stripeEventSchema = {
  type: "object",
  properties: {
    id: {
      type: "string",
      description: "Event id, for example evt_...",
    },
    object: {
      type: "string",
      const: "event",
      description: "Stripe event object discriminator.",
    },
    type: {
      type: "string",
      description: "Stripe event type, for example payment_intent.succeeded.",
    },
    api_version: {
      type: "string",
      description: "API version used to render this event payload.",
    },
    created: {
      type: "number",
      description: "Unix timestamp when the event was created.",
    },
    livemode: {
      type: "boolean",
      description: "True for live mode events, false for test mode events.",
    },
    pending_webhooks: {
      type: "number",
      description: "Number of destinations yet to acknowledge this event.",
    },
    account: {
      type: "string",
      description: "Connected account id for Connect events when present.",
    },
    data: {
      type: "object",
      properties: {
        object: {
          type: "object",
          description: "Primary resource snapshot for the event.",
          additionalProperties: true,
        },
        previous_attributes: {
          type: "object",
          description: "Changed fields for update events, when present.",
          additionalProperties: true,
        },
      },
      additionalProperties: true,
      description: "Stripe event data envelope.",
    },
    request: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "Request id tied to the originating API call.",
        },
        idempotency_key: {
          type: "string",
          description: "Idempotency key used by the originating request.",
        },
      },
      additionalProperties: true,
      description: "Request metadata attached to the event.",
    },
  },
  additionalProperties: true,
  description: "Stripe webhook Event payload.",
} as const;

function stripeAction(
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

export const stripeManifest: ProviderManifest = {
  key: "stripe",
  name: "Stripe",
  description:
    "Send authenticated requests to the Stripe API for customers, payment intents, invoices, and event-driven workflows.",
  iconUrl: "https://stripe.com/img/v3/newsroom/social.png",
  docsUrl: "https://docs.stripe.com/api",
  authType: "apiKey",
  authConfig: {
    type: "apiKey",
    in: "header",
    name: "Authorization",
  },
  triggers: [
    {
      key: "stripe.webhook",
      name: "Stripe Webhook",
      description:
        "Receive Stripe webhook Event payloads via POST /webhook/:zapId. Validate Stripe-Signature in your webhook handler when secrets are configured.",
      triggerType: "webhook",
      outputSchema: stripeEventSchema,
    },
  ],
  actions: [
    stripeAction(
      "stripe.api_request",
      "Stripe API Request",
      "Call any Stripe API endpoint with a raw HTTP configuration.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            enum: ["GET", "POST", "DELETE"],
            description: "HTTP method for the Stripe API call.",
          },
          url: {
            type: "string",
            minLength: 1,
            format: "uri",
            pattern: "^https://api\\.stripe\\.com/v1/",
            description: "Full Stripe API URL.",
          },
          headers: stripeHeadersSchema,
          queryParams: stripeQuerySchema,
          body: {
            description:
              "Optional request body. Stripe v1 endpoints are generally form-encoded.",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    stripeAction(
      "stripe.create_customer",
      "Create Customer",
      "Create a customer using POST /v1/customers.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: { type: "string", const: "https://api.stripe.com/v1/customers" },
          headers: stripeHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              email: {
                type: "string",
                format: "email",
                description: "Customer email address.",
              },
              name: {
                type: "string",
                minLength: 1,
                maxLength: 256,
                description: "Customer full name or business name.",
              },
              phone: {
                type: "string",
                minLength: 1,
                maxLength: 20,
                description: "Customer phone number.",
              },
              description: {
                type: "string",
                description: "Internal note shown with the customer in Stripe.",
              },
              payment_method: {
                type: "string",
                description: "Optional payment method id to attach.",
              },
              metadata: {
                type: "object",
                additionalProperties: { type: "string" },
                description:
                  "Metadata map (up to 50 key-value pairs). Values are strings.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    stripeAction(
      "stripe.list_customers",
      "List Customers",
      "List customers with optional email and pagination filters.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: { type: "string", const: "https://api.stripe.com/v1/customers" },
          headers: stripeHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              email: {
                type: "string",
                format: "email",
                description: "Exact, case-sensitive email filter.",
              },
              limit: {
                type: "number",
                minimum: 1,
                maximum: 100,
                description: "Number of results to return (1-100).",
              },
              starting_after: {
                type: "string",
                description: "Pagination cursor for next page.",
              },
              ending_before: {
                type: "string",
                description: "Pagination cursor for previous page.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    stripeAction(
      "stripe.create_payment_intent",
      "Create PaymentIntent",
      "Create a payment intent using POST /v1/payment_intents.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            const: "https://api.stripe.com/v1/payment_intents",
          },
          headers: stripeHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              amount: {
                type: "number",
                minimum: 1,
                description:
                  "Amount in the smallest currency unit (for example cents).",
              },
              currency: {
                type: "string",
                pattern: "^[a-z]{3}$",
                description: "Lowercase 3-letter ISO currency code.",
              },
              customer: {
                type: "string",
                description: "Customer id (cus_...) when applicable.",
              },
              payment_method: {
                type: "string",
                description: "Payment method id to attach.",
              },
              confirm: {
                type: "boolean",
                description: "Set true to confirm immediately during creation.",
              },
              receipt_email: {
                type: "string",
                format: "email",
                description: "Receipt recipient email address.",
              },
              description: {
                type: "string",
                description: "Optional internal description.",
              },
              setup_future_usage: {
                type: "string",
                enum: ["off_session", "on_session"],
                description: "Future usage hint for saved payment methods.",
              },
              metadata: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Metadata map for this payment intent.",
              },
            },
            required: ["amount", "currency"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    stripeAction(
      "stripe.confirm_payment_intent",
      "Confirm PaymentIntent",
      "Confirm a payment intent using POST /v1/payment_intents/:id/confirm.",
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
              "^https://api\\.stripe\\.com/v1/payment_intents/[^/]+/confirm$",
            description:
              "Payment intent confirm URL, for example https://api.stripe.com/v1/payment_intents/pi_123/confirm",
          },
          headers: stripeHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              payment_method: {
                type: "string",
                description: "Payment method id to confirm with.",
              },
              receipt_email: {
                type: "string",
                format: "email",
                description: "Receipt recipient email address.",
              },
              return_url: {
                type: "string",
                format: "uri",
                description:
                  "Return URL for redirect-based confirmation flows.",
              },
              off_session: {
                anyOf: [{ type: "boolean" }, { type: "string" }],
                description:
                  "Use when the customer is not in session during confirmation.",
              },
              metadata: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Metadata updates for the payment intent.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    stripeAction(
      "stripe.create_invoice",
      "Create Invoice",
      "Create a draft invoice using POST /v1/invoices.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: { type: "string", const: "https://api.stripe.com/v1/invoices" },
          headers: stripeHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              customer: {
                type: "string",
                minLength: 1,
                description: "Customer id to bill.",
              },
              auto_advance: {
                type: "boolean",
                description:
                  "If true, Stripe can automatically finalize/collect invoice.",
              },
              collection_method: {
                type: "string",
                enum: ["charge_automatically", "send_invoice"],
                description: "Invoice collection mode.",
              },
              description: {
                type: "string",
                description: "Invoice memo/description.",
              },
              subscription: {
                type: "string",
                description:
                  "Optional subscription id filter for invoice items.",
              },
              days_until_due: {
                type: "number",
                minimum: 1,
                description:
                  "Days until due when collection_method is send_invoice.",
              },
              metadata: {
                type: "object",
                additionalProperties: { type: "string" },
                description: "Metadata map for this invoice.",
              },
            },
            required: ["customer"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    stripeAction(
      "stripe.finalize_invoice",
      "Finalize Invoice",
      "Finalize a draft invoice using POST /v1/invoices/:id/finalize.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.stripe\\.com/v1/invoices/[^/]+/finalize$",
            description:
              "Invoice finalize URL, for example https://api.stripe.com/v1/invoices/in_123/finalize",
          },
          headers: stripeHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              auto_advance: {
                type: "boolean",
                description:
                  "If false, invoice state does not auto-advance after finalization.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    stripeAction(
      "stripe.list_invoices",
      "List Invoices",
      "List invoices with optional customer, status, and pagination filters.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: { type: "string", const: "https://api.stripe.com/v1/invoices" },
          headers: stripeHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              customer: {
                type: "string",
                description: "Only return invoices for this customer id.",
              },
              status: {
                type: "string",
                enum: ["draft", "open", "paid", "uncollectible", "void"],
                description: "Invoice status filter.",
              },
              subscription: {
                type: "string",
                description: "Only return invoices for this subscription id.",
              },
              collection_method: {
                type: "string",
                enum: ["charge_automatically", "send_invoice"],
                description: "Collection method filter.",
              },
              limit: {
                type: "number",
                minimum: 1,
                maximum: 100,
                description: "Number of results to return (1-100).",
              },
              starting_after: {
                type: "string",
                description: "Pagination cursor for next page.",
              },
              ending_before: {
                type: "string",
                description: "Pagination cursor for previous page.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    stripeAction(
      "stripe.pay_invoice",
      "Pay Invoice",
      "Attempt payment for an invoice using POST /v1/invoices/:id/pay.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.stripe\\.com/v1/invoices/[^/]+/pay$",
            description:
              "Invoice pay URL, for example https://api.stripe.com/v1/invoices/in_123/pay",
          },
          headers: stripeHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              forgive: {
                type: "boolean",
                description: "Forgive invoice payment when true.",
              },
              off_session: {
                type: "boolean",
                description: "Set true for off-session payment attempts.",
              },
              paid_out_of_band: {
                type: "boolean",
                description: "Set true when payment happened outside Stripe.",
              },
              payment_method: {
                type: "string",
                description: "Optional payment method id override.",
              },
            },
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
  ],
};
