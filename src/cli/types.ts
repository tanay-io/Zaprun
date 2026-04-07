export type CliProfile = {
  name: string;
  apiUrl: string;
  userId: string;
  active: boolean;
};

export type CliConfig = {
  schemaVersion: number;
  profiles: CliProfile[];
};
