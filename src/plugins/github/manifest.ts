import { ProviderManifest } from "../../types/manifest";

const connectionIdSchema = {
  type: "string",
  minLength: 1,
  description: "Connection id for the authorized GitHub account",
} as const;

const githubHeadersSchema = {
  type: "object",
  properties: {
    Accept: {
      type: "string",
      description:
        "GitHub media type header. Use application/vnd.github+json.",
    },
    "X-GitHub-Api-Version": {
      type: "string",
      description:
        "GitHub REST API version header.",
    },
    "User-Agent": {
      type: "string",
      description:
        "Valid User-Agent header for GitHub API requests, for example Zaprun-GitHub-Plugin.",
    },
  },
  additionalProperties: { type: "string" },
  required: ["Accept", "X-GitHub-Api-Version", "User-Agent"],
  description:
    "HTTP headers for the GitHub API request. Authorization is injected automatically from the connection. Include Accept, X-GitHub-Api-Version, and User-Agent.",
} as const;

const githubQuerySchema = {
  type: "object",
  additionalProperties: {
    anyOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
  },
  description: "Optional query string parameters.",
} as const;

const genericOutputSchema = {
  type: "object",
  description: "Raw JSON response body returned by the GitHub API.",
} as const;

const githubWebhookOutputSchema = {
  type: "object",
  properties: {
    event: {
      type: "string",
      description: "GitHub webhook event type from X-GitHub-Event.",
    },
    deliveryId: {
      type: "string",
      description: "Unique delivery id from X-GitHub-Delivery.",
    },
    payload: {
      type: "object",
      description: "Raw GitHub webhook payload JSON.",
    },
  },
  additionalProperties: true,
  description: "Normalized GitHub webhook payload received by Zaprun.",
} as const;

const gitIdentitySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    name: {
      type: "string",
      minLength: 1,
      description: "Display name for the commit identity.",
    },
    email: {
      type: "string",
      minLength: 1,
      description: "Email address for the commit identity.",
    },
  },
  required: ["name", "email"],
  description: "Git commit identity object.",
} as const;

function githubAction(
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

export const githubManifest: ProviderManifest = {
  key: "github",
  name: "GitHub",
  description:
    "Send authenticated requests to the GitHub REST API for repositories, contents, issues, pull requests, search, and user resources.",
  iconUrl:
    "https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png",
  docsUrl: "https://docs.github.com/en/rest",
  authType: "oauth2",
  authConfig: {
    type: "oauth2",
    authorizationUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scopes: ["repo", "read:user", "user:email"],
    pkce: false,
    tokenAuthMethod: "body",
    tokenRequestFormat: "form",
  },
  triggers: [
    {
      key: "github.webhook",
      name: "GitHub Webhook",
      description:
        "Receive GitHub webhook events through Zaprun at POST /webhook/:zapId. Trigger config can include secret and events filters.",
      triggerType: "webhook",
      outputSchema: githubWebhookOutputSchema,
    },
  ],
  actions: [
    githubAction(
      "github.api_request",
      "GitHub API Request",
      "Call any GitHub REST API endpoint with a raw HTTP configuration.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            description: "HTTP method for the GitHub API call.",
          },
          url: {
            type: "string",
            minLength: 1,
            format: "uri",
            pattern: "^https://api\\.github\\.com/",
            description: "Full GitHub API URL.",
          },
          headers: githubHeadersSchema,
          queryParams: githubQuerySchema,
          body: {
            description: "Optional JSON body for POST, PUT, PATCH, or DELETE requests.",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    githubAction(
      "github.get_authenticated_user",
      "Get Authenticated User",
      "Get the GitHub user for the current OAuth connection.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: { type: "string", const: "https://api.github.com/user" },
          headers: githubHeadersSchema,
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    githubAction(
      "github.list_user_repos",
      "List User Repositories",
      "List repositories visible to the authenticated user.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: { type: "string", const: "https://api.github.com/user/repos" },
          headers: githubHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              visibility: {
                type: "string",
                enum: ["all", "public", "private"],
                description: "Limit results to repositories with the selected visibility.",
              },
              affiliation: {
                type: "string",
                description:
                  "Comma-separated affiliation filters such as owner, collaborator, or organization_member.",
              },
              type: {
                type: "string",
                enum: ["all", "owner", "public", "private", "member"],
                description: "Legacy repository type filter.",
              },
              sort: {
                type: "string",
                enum: ["created", "updated", "pushed", "full_name"],
                description: "Field used to sort results.",
              },
              direction: {
                type: "string",
                enum: ["asc", "desc"],
                description: "Sort direction.",
              },
              per_page: {
                type: "number",
                minimum: 1,
                maximum: 100,
                description: "Results per page.",
              },
              page: {
                type: "number",
                minimum: 1,
                description: "Page number.",
              },
            },
            description:
              "Optional query parameters for filtering and pagination. GitHub also supports affiliation for owner, collaborator, and organization_member filtering.",
          },
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    githubAction(
      "github.get_repo",
      "Get Repository",
      "Get a repository by owner and repo.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+$",
            description: "Repository URL, for example https://api.github.com/repos/octocat/Hello-World",
          },
          headers: githubHeadersSchema,
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    githubAction(
      "github.create_repo",
      "Create Repository",
      "Create a repository for the authenticated user.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: { type: "string", const: "https://api.github.com/user/repos" },
          headers: githubHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              name: {
                type: "string",
                minLength: 1,
                description: "Repository name.",
              },
              description: {
                type: "string",
                description: "Repository description.",
              },
              homepage: {
                type: "string",
                description: "Optional project homepage URL.",
              },
              private: {
                type: "boolean",
                description: "Whether the repository is private.",
              },
              has_issues: {
                type: "boolean",
                description: "Enable GitHub Issues.",
              },
              has_projects: {
                type: "boolean",
                description: "Enable GitHub Projects.",
              },
              has_wiki: {
                type: "boolean",
                description: "Enable GitHub Wiki.",
              },
              auto_init: {
                type: "boolean",
                description: "Create an initial commit with an empty README.",
              },
              gitignore_template: {
                type: "string",
                description: "Optional .gitignore template name.",
              },
              license_template: {
                type: "string",
                description: "Optional license template name.",
              },
            },
            required: ["name"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    githubAction(
      "github.get_repo_contents",
      "Get Repository Contents",
      "Get file or directory contents from a repository.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+/contents/.+",
            description: "Contents URL, for example https://api.github.com/repos/octocat/Hello-World/contents/README.md",
          },
          headers: githubHeadersSchema,
          queryParams: githubQuerySchema,
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    githubAction(
      "github.create_or_update_file",
      "Create Or Update File",
      "Create a new file or update an existing file in a repository.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "PUT" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+/contents/.+",
            description: "Contents URL for the target file.",
          },
          headers: githubHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              message: {
                type: "string",
                minLength: 1,
                description: "Commit message.",
              },
              content: {
                type: "string",
                minLength: 1,
                description: "New file contents encoded as Base64.",
              },
              sha: {
                type: "string",
                description: "Required when updating an existing file.",
              },
              branch: {
                type: "string",
                description: "Branch name to write to.",
              },
              committer: {
                ...gitIdentitySchema,
                description:
                  "Optional committer identity object. If provided, include name and email.",
              },
              author: {
                ...gitIdentitySchema,
                description:
                  "Optional author identity object. If provided, include name and email.",
              },
            },
            required: ["message", "content"],
            description:
              "Create or update file request body. Updating an existing file requires sha. Writing under .github/workflows may also require the workflow OAuth scope in addition to repo.",
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    githubAction(
      "github.delete_file",
      "Delete File",
      "Delete a file from a repository.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "DELETE" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+/contents/.+",
            description: "Contents URL for the target file.",
          },
          headers: githubHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              message: {
                type: "string",
                minLength: 1,
                description: "Commit message for the deletion.",
              },
              sha: {
                type: "string",
                minLength: 1,
                description: "Blob SHA of the file being deleted.",
              },
              branch: {
                type: "string",
                description: "Branch name to delete from.",
              },
              committer: {
                ...gitIdentitySchema,
                description:
                  "Optional committer identity object. If provided, include name and email.",
              },
              author: {
                ...gitIdentitySchema,
                description:
                  "Optional author identity object. If provided, include name and email.",
              },
            },
            required: ["message", "sha"],
            description:
              "Delete file request body. Deleting under .github/workflows may also require the workflow OAuth scope in addition to repo.",
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    githubAction(
      "github.list_issues",
      "List Issues",
      "List issues for a repository. Read assignee data from the assignees array rather than depending on the older singular assignee field.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+/issues$",
            description: "Issues URL for the repository.",
          },
          headers: githubHeadersSchema,
          queryParams: githubQuerySchema,
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    githubAction(
      "github.create_issue",
      "Create Issue",
      "Create a new issue in a repository. GitHub issue responses should be read from the assignees array rather than depending on the older singular assignee field.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+/issues$",
            description: "Issues URL for the repository.",
          },
          headers: githubHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: {
                type: "string",
                minLength: 1,
                description: "Issue title.",
              },
              body: {
                type: "string",
                description: "Issue body in Markdown.",
              },
              assignees: {
                type: "array",
                items: { type: "string" },
                description: "Usernames to assign.",
              },
              labels: {
                type: "array",
                items: {
                  anyOf: [{ type: "string" }, { type: "number" }],
                },
                description: "Issue labels.",
              },
              milestone: {
                anyOf: [{ type: "number" }, { type: "string" }],
                description: "Milestone number.",
              },
            },
            required: ["title"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    githubAction(
      "github.list_pull_requests",
      "List Pull Requests",
      "List pull requests for a repository.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+/pulls$",
            description: "Pull requests URL for the repository.",
          },
          headers: githubHeadersSchema,
          queryParams: githubQuerySchema,
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
    githubAction(
      "github.create_pull_request",
      "Create Pull Request",
      "Create a pull request in a repository. Avoid depending on deprecated null placeholder response fields and instead read the documented current response shape.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "POST" },
          url: {
            type: "string",
            format: "uri",
            pattern: "^https://api\\.github\\.com/repos/[^/]+/[^/]+/pulls$",
            description: "Pull requests URL for the repository.",
          },
          headers: githubHeadersSchema,
          body: {
            type: "object",
            additionalProperties: false,
            properties: {
              title: {
                type: "string",
                description: "Pull request title.",
              },
              issue: {
                anyOf: [{ type: "number" }, { type: "string" }],
                description:
                  "Optional existing issue number to convert into a pull request. If provided, title may be omitted.",
              },
              body: {
                type: "string",
                description: "Pull request body in Markdown.",
              },
              head: {
                type: "string",
                minLength: 1,
                description: "Name of the branch where your changes are implemented.",
              },
              base: {
                type: "string",
                minLength: 1,
                description: "Name of the branch you want the changes pulled into.",
              },
              head_repo: {
                type: "string",
                description:
                  "Optional head repository name when both branches are in organizations owned by the same user or org.",
              },
              draft: {
                type: "boolean",
                description: "Whether to open the pull request as a draft.",
              },
              maintainer_can_modify: {
                type: "boolean",
                description: "Allow maintainers to modify the pull request branch.",
              },
            },
            anyOf: [
              { required: ["title", "head", "base"] },
              { required: ["issue", "head", "base"] },
            ],
          },
        },
        required: ["connectionId", "method", "url", "headers", "body"],
      },
    ),
    githubAction(
      "github.search_repositories",
      "Search Repositories",
      "Search public and accessible repositories.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            const: "https://api.github.com/search/repositories",
          },
          headers: githubHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              q: {
                type: "string",
                minLength: 1,
                description: "GitHub repository search query.",
              },
              sort: {
                type: "string",
                description:
                  "Optional sort field. Supported values depend on GitHub search docs and can include created, updated, comments, reactions variants, and other documented search sorts.",
              },
              order: {
                type: "string",
                enum: ["asc", "desc"],
                description: "Sort order.",
              },
              per_page: {
                type: "number",
                minimum: 1,
                maximum: 100,
                description: "Results per page.",
              },
              page: {
                type: "number",
                minimum: 1,
                description: "Page number.",
              },
            },
            required: ["q"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "queryParams"],
      },
    ),
    githubAction(
      "github.search_issues",
      "Search Issues And Pull Requests",
      "Search issues and pull requests across accessible repositories.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: {
            type: "string",
            const: "https://api.github.com/search/issues",
          },
          headers: githubHeadersSchema,
          queryParams: {
            type: "object",
            additionalProperties: false,
            properties: {
              q: {
                type: "string",
                minLength: 1,
                description: "GitHub issue and pull request search query.",
              },
              sort: {
                type: "string",
                description: "Optional sort field.",
              },
              order: {
                type: "string",
                enum: ["asc", "desc"],
                description: "Sort order.",
              },
              per_page: {
                type: "number",
                minimum: 1,
                maximum: 100,
                description: "Results per page.",
              },
              page: {
                type: "number",
                minimum: 1,
                description: "Page number.",
              },
            },
            required: ["q"],
          },
        },
        required: ["connectionId", "method", "url", "headers", "queryParams"],
      },
    ),
    githubAction(
      "github.get_rate_limit",
      "Get Rate Limits",
      "Get the current rate limit status for the authenticated user. Prefer the resources object, especially resources.core, instead of depending on deprecated top-level rate fields.",
      {
        type: "object",
        additionalProperties: false,
        properties: {
          connectionId: connectionIdSchema,
          method: { type: "string", const: "GET" },
          url: { type: "string", const: "https://api.github.com/rate_limit" },
          headers: githubHeadersSchema,
        },
        required: ["connectionId", "method", "url", "headers"],
      },
    ),
  ],
};
