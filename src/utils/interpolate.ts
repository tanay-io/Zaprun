export function interpolateConfig(config: any, context: any): any {
  // 1. If config is a string → replace {{payload.xxx}} or {{steps.xxx}}
  if (typeof config === "string") {
    return config.replace(
      /\{\{\s*([a-zA-Z0-9_]+)\.([^}]+)\s*\}\}/g,
      (_, root, path) => {
        const keys = path.split(".");
        let value = context[root];

        for (const key of keys) {
          if (value && typeof value === "object") {
            value = value[key];
          } else {
            value = undefined;
            break;
          }
        }

        return value !== undefined && value !== null ? String(value) : "";
      },
    );
  }

  // 2. If config is an array → recurse
  if (Array.isArray(config)) {
    return config.map((item) => interpolateConfig(item, context));
  }

  // 3. If config is an object → recurse
  if (typeof config === "object" && config !== null) {
    const result: any = {};

    for (const key in config) {
      result[key] = interpolateConfig(config[key], context);
    }

    return result;
  }
  return config;
}
