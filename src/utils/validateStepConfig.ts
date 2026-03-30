  import Ajv from "ajv";
  import addFormats from "ajv-formats";
  import { getActionManifest } from "../engines/pluginRegistry";

  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);

  export type ValidationResult = {
    valid: boolean;
    errors: { field: string; message: string }[];
  };

  export function validateStepConfig(
    actionKey: string,
    config: unknown,
  ): ValidationResult {
    const actionManifest = getActionManifest(actionKey);

    if (!actionManifest) {
      return {
        valid: false,
        errors: [{ field: "_root", message: `Unknown action key: ${actionKey}` }],
      };
    }

    const schema = actionManifest.inputSchema;

    if (!schema || Object.keys(schema).length === 0) {
      return { valid: true, errors: [] };
    }

    const validate = ajv.compile(schema);
    const valid = validate(config);

    if (valid) {
      return { valid: true, errors: [] };
    }

    const errors = (validate.errors ?? []).map((err) => ({
      field: err.instancePath || err.params?.missingProperty || "_root",
      message: err.message || "Validation failed",
    }));

    return { valid: false, errors };
  }
