import legacyValidator, { customizeValidator } from "@rjsf/validator-ajv8";
import Ajv2020 from "ajv/dist/2020.js";
import type { RJSFSchema } from "@rjsf/utils";

const currentValidator = customizeValidator({ AjvClass: Ajv2020 });

export function validatorForSchema(schema: RJSFSchema | boolean | undefined) {
  const dialect = schema && typeof schema === "object" ? schema.$schema : "";
  return typeof dialect === "string" && dialect.includes("/draft-07/")
    ? legacyValidator
    : currentValidator;
}
