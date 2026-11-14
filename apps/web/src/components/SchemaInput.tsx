import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import RjsfForm from "@rjsf/antd";
import CoreForm, { type FormProps } from "@rjsf/core";
import { getSchemaType, type RJSFSchema } from "@rjsf/utils";
import { Alert, Button, Form, Input } from "antd";
import { validatorForSchema } from "../lib/schema-validator";

export interface SchemaInputHandle {
  validateForm(): boolean;
  getValue(): unknown;
}
type Props = Omit<
  FormProps,
  "schema" | "validator" | "formData" | "onChange"
> & {
  schema: RJSFSchema | boolean;
  formData: unknown;
  onChange(value: unknown): void;
};

export const SchemaInput = forwardRef<SchemaInputHandle, Props>(
  function SchemaInput({ schema, formData, onChange, ...props }, ref) {
    const form = useRef<CoreForm>(null);
    const [jsonMode, setJsonMode] = useState(false);
    const [rawInput, setRawInput] = useState(
      () => JSON.stringify(formData, null, 2) ?? "null",
    );
    const [error, setError] = useState("");
    const schemaType =
      typeof schema === "object" ? getSchemaType(schema) : undefined;
    const compilationError = useMemo(
      () =>
        typeof schema === "object"
          ? validatorForSchema(schema).rawValidation(schema, undefined)
              .validationError
          : undefined,
      [schema],
    );
    const forceJSON =
      !!compilationError ||
      typeof schema === "boolean" ||
      !schemaType ||
      schemaType === "null" ||
      (typeof schema === "object" &&
        Array.isArray(schema.type) &&
        schema.type.includes("null"));
    const useJSON = forceJSON || jsonMode;

    useEffect(() => {
      setJsonMode(false);
      setRawInput(JSON.stringify(formData, null, 2) ?? "null");
      setError("");
    }, [schema]);

    function jsonValue() {
      if (schema === false) throw new Error("发布者的输入Schema不接受任何输入");
      let value;
      try {
        value = JSON.parse(rawInput);
      } catch {
        throw new Error("请输入有效JSON参数");
      }
      if (
        typeof schema === "object" &&
        !validatorForSchema(schema).isValid(schema, value, schema)
      )
        throw new Error("输入未通过发布者Schema校验");
      return value;
    }
    useImperativeHandle(ref, () => ({
      validateForm() {
        if (!useJSON) return form.current?.validateForm() || false;
        try {
          onChange(jsonValue());
          setError("");
          return true;
        } catch (failure) {
          setError((failure as Error).message);
          return false;
        }
      },
      getValue() {
        return useJSON ? jsonValue() : form.current?.state.formData;
      },
    }));
    function switchMode() {
      if (jsonMode) {
        try {
          onChange(jsonValue());
        } catch (failure) {
          setError((failure as Error).message);
          return;
        }
      } else
        setRawInput(
          JSON.stringify(form.current?.state.formData ?? formData, null, 2) ??
            "null",
        );
      setError("");
      setJsonMode(!jsonMode);
    }
    return (
      <div className="schema-input">
        {compilationError && (
          <Alert
            type="error"
            showIcon
            title="参数Schema无法编译，请核对定义。"
          />
        )}
        {schema === false ? (
          <Alert
            type="warning"
            showIcon
            title="发布者的输入Schema为false，当前动作不接受任何输入。"
          />
        ) : useJSON ? (
          <Form.Item label="JSON参数" colon={false}>
            <Input.TextArea
              aria-label="JSON参数输入"
              rows={4}
              value={rawInput}
              onChange={(event) => setRawInput(event.target.value)}
            />
          </Form.Item>
        ) : (
          <RjsfForm
            {...props}
            ref={form}
            schema={schema as RJSFSchema}
            validator={validatorForSchema(schema)}
            formData={formData}
            onChange={(event) => onChange(event.formData)}
          />
        )}
        {!forceJSON && (
          <div className="schema-input-toolbar">
            <Button size="small" type="link" onClick={switchMode}>
              {jsonMode ? "返回表单" : "JSON输入"}
            </Button>
          </div>
        )}
        {error && (
          <Alert
            className="schema-input-error"
            type="error"
            showIcon
            title={error}
          />
        )}
      </div>
    );
  },
);
