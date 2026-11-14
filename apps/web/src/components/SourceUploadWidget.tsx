import { Upload } from "antd";
import { CloudUploadOutlined } from "@ant-design/icons";
import type { WidgetProps } from "@rjsf/utils";

export function SourceUploadWidget(props: WidgetProps) {
  const disabled = props.disabled || props.readonly;
  return (
    <div className="upload-widget">
      <Upload.Dragger
        hasControlInside
        disabled={disabled}
        accept={
          typeof props.options.accept === "string"
            ? props.options.accept
            : undefined
        }
        maxCount={1}
        beforeUpload={(file) => {
          props.onChange(file.name);
          return false;
        }}
        onRemove={() => props.onChange(undefined)}
      >
        <button
          type="button"
          className="upload-drag-button"
          id={props.id}
          aria-label={props.label || props.schema.title || "上传文件"}
          disabled={disabled}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <CloudUploadOutlined aria-hidden="true" />
          <span>
            将文件拖拽到此处，或 <b>点击上传</b>
          </span>
        </button>
      </Upload.Dragger>
    </div>
  );
}
