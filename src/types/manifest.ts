export type AuthType = "oauth2" | "apiKey" | "basic" | "none";

export type OAuth2AuthConfig = {
  type: "oauth2";
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  pkce?: boolean;
  authorizationParams?: Record<string, string>;
  tokenAuthMethod?: "body" | "basic";
  tokenRequestFormat?: "form" | "json";
};

export type ApiKeyAuthConfig = {
  type: "apiKey";
  in: "header" | "query";
  name: string;
};

export type BasicAuthConfig = {
  type: "basic";
};

export type NoAuthConfig = {
  type: "none";
};

export type AuthConfig =
  | OAuth2AuthConfig
  | ApiKeyAuthConfig
  | BasicAuthConfig
  | NoAuthConfig;


export type TriggerType = "webhook" | "cron" | "poll";

export type TriggerManifest = {
  key: string;
  name: string;
  description: string;
  triggerType: TriggerType;
  outputSchema: Record<string, unknown>;
};


export type ActionManifest = {
  key: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  requiresConnection: boolean;
};


export type ProviderManifest = {
  key: string;
  name: string;
  description: string;
  iconUrl?: string;
  docsUrl?: string;
  authType: AuthType;
  authConfig: AuthConfig;
  triggers: TriggerManifest[];
  actions: ActionManifest[];
};
