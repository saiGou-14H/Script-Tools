import { useMemo, useState } from "react";
import { Alert, Button, Input, Select, Tabs, Tree, App } from "antd";
import {
  CheckOutlined,
  FileOutlined,
  FolderFilled,
  PlusOutlined,
  SafetyOutlined,
} from "@ant-design/icons";
import { PageHeading, Panel, Status } from "../components/ui";
import { Empty } from "antd";
import { useParams } from "react-router-dom";
import { initialScriptFiles, usePublisherPreview } from "../publisher-preview";
import Ajv2020 from "ajv/dist/2020";
import manifestSchema from "../generated/manifest-schema.json";

const validateManifest = new Ajv2020({
  allErrors: true,
  strict: false,
}).compile<{ entrypoint: string; dependencies_lock: string }>(manifestSchema);
interface EditableManifest {
  version?: string;
  entrypoint?: string;
  language?: string;
  default_action?: string;
  input_schema?: unknown;
  actions?: Record<string, { input_schema?: unknown; output_schema?: unknown }>;
  network_requirements?: { domains?: string[] };
}

export function ScriptEditorPage() {
  const { id = "demo" } = useParams();
  const { scripts, drafts, saveDraft } = usePublisherPreview();
  const script = scripts.find(
    (item) => item.id === (id === "demo" ? "table" : id),
  );
  const initialFiles = script
    ? drafts[script.id] || initialScriptFiles(script)
    : {};
  const [files, setFiles] = useState(initialFiles);
  const [selected, setSelected] = useState(
    Object.keys(initialFiles)[0] || "main.py",
  );
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState("");
  const manifest = useMemo<EditableManifest>(() => {
    try {
      const parsed = JSON.parse(files["manifest.json"] || "{}");
      return validateManifest(parsed) ? (parsed as EditableManifest) : {};
    } catch {
      return {};
    }
  }, [files["manifest.json"]]);
  const { message, modal } = App.useApp();
  if (!script) return <Empty description="脚本不存在或已失效" />;
  function validate() {
    try {
      const parsed = JSON.parse(files["manifest.json"]);
      if (!validateManifest(parsed))
        throw new Error(
          validateManifest.errors
            ?.map((item) => `${item.instancePath || "/"} ${item.message}`)
            .join("\n"),
        );
      if (!files[parsed.entrypoint])
        throw new Error("入口文件不存在或内容为空");
      if (!(parsed.dependencies_lock in files))
        throw new Error("依赖锁文件不存在");
      setError("");
      setValidated(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "清单格式有误");
      setValidated(false);
    }
  }
  function updateManifest(patch: Partial<EditableManifest>) {
    setFiles((previous) => ({
      ...previous,
      "manifest.json": JSON.stringify({ ...manifest, ...patch }, null, 2),
    }));
    setValidated(false);
  }
  const actionNames =
    manifest.actions && typeof manifest.actions === "object"
      ? Object.keys(manifest.actions)
      : [];
  const action = manifest.actions?.[manifest.default_action || actionNames[0]];
  return (
    <>
      <PageHeading title="脚本编辑" />
      <div className="editor-title">
        <h2>
          <FileOutlined /> {script.title}草稿{" "}
          {manifest.version
            ? manifest.version.startsWith("v")
              ? manifest.version
              : `v${manifest.version}`
            : script.draftVersion || script.version}{" "}
          <Status tone="gray">草稿</Status>
        </h2>
        <div>
          <Button
            onClick={() => {
              saveDraft(script.id, files);
              void message.success("草稿预览已保存");
            }}
          >
            保存草稿
          </Button>
          <Button aria-label="校验" icon={<CheckOutlined />} onClick={validate}>
            校验
          </Button>
          <Button
            type="primary"
            onClick={() =>
              modal.info({
                title: "封存版本",
                content:
                  "版本封存服务正在接入。清单校验和完整构建检查接通后可提交封存。",
              })
            }
          >
            封存版本
          </Button>
        </div>
      </div>
      <div className="editor-layout">
        <Panel
          title="文件"
          extra={
            <Button
              size="small"
              icon={<PlusOutlined />}
              onClick={() =>
                modal.confirm({
                  title: "新建文件",
                  content: (
                    <Input
                      id="new-script-file"
                      placeholder="文件名，例如 utils.py"
                    />
                  ),
                  onOk: () => {
                    const name = (
                      document.getElementById(
                        "new-script-file",
                      ) as HTMLInputElement
                    )?.value.trim();
                    if (!name || /[\\/]/.test(name))
                      return Promise.reject(new Error("请输入有效的文件名"));
                    setFiles((previous) => ({ ...previous, [name]: "" }));
                    setSelected(name);
                  },
                })
              }
            />
          }
        >
          <Tree
            showIcon
            selectedKeys={[selected]}
            defaultExpandAll
            onSelect={(keys) => {
              if (typeof keys[0] === "string" && keys[0] in files)
                setSelected(keys[0]);
            }}
            treeData={[
              {
                key: "root",
                title: "/（脚本根目录）",
                icon: <FolderFilled />,
                children: Object.keys(files).map((name) => ({
                  key: name,
                  title: name,
                  icon: <FileOutlined />,
                })),
              },
            ]}
          />
        </Panel>
        <Panel className="code-panel">
          <Tabs
            activeKey={selected}
            items={[{ key: selected, label: selected }]}
          />
          <div className="code-editor">
            <div className="line-numbers">
              {files[selected].split("\n").map((_, index) => (
                <div key={index}>{index + 1}</div>
              ))}
            </div>
            <Input.TextArea
              aria-label="脚本代码"
              value={files[selected]}
              onChange={(event) => {
                setFiles((previous) => ({
                  ...previous,
                  [selected]: event.target.value,
                }));
                setValidated(false);
              }}
              spellCheck={false}
            />
          </div>
        </Panel>
        <Panel title="脚本配置">
          <div className="editor-config-row">
            <label>入口文件 ⓘ</label>
            <Select
              aria-label="入口文件"
              value={manifest.entrypoint}
              options={Object.keys(files)
                .filter((name) => /\.(py|[cm]?js)$/.test(name))
                .map((value) => ({ value }))}
              onChange={(entrypoint) => updateManifest({ entrypoint })}
            />
          </div>
          <div className="editor-config-row">
            <label>运行环境</label>
            <Select
              aria-label="运行环境"
              value={manifest.language}
              onChange={(language) => updateManifest({ language })}
              options={[
                { value: "python", label: "Python" },
                { value: "nodejs", label: "Node.js" },
              ]}
            />
          </div>
          <div className="editor-config-row">
            <label>动作类型</label>
            <Select
              aria-label="动作类型"
              value={manifest.default_action}
              onChange={(default_action) => updateManifest({ default_action })}
              options={actionNames.map((value) => ({ value }))}
            />
          </div>
          <h3>
            输入 Schema{" "}
            <Button
              type="link"
              size="small"
              onClick={() => setSelected("manifest.json")}
            >
              编辑
            </Button>
          </h3>
          <pre>
            {JSON.stringify(
              action?.input_schema ?? manifest.input_schema ?? {},
              null,
              2,
            )}
          </pre>
          <h3>
            输出 Schema{" "}
            <Button
              type="link"
              size="small"
              onClick={() => setSelected("manifest.json")}
            >
              编辑
            </Button>
          </h3>
          <pre>{JSON.stringify(action?.output_schema ?? {}, null, 2)}</pre>
          <h3>网络权限 ⓘ</h3>
          <div className="network-scope">
            <SafetyOutlined />{" "}
            {manifest.network_requirements?.domains?.length
              ? manifest.network_requirements.domains.join("、")
              : "无外部访问"}
          </div>
        </Panel>
      </div>
      {error && (
        <Alert type="error" title="清单校验失败" description={error} showIcon />
      )}
      {validated && (
        <Alert
          className="editor-validation"
          type="success"
          title="清单校验成功"
          description="已通过manifest 2.0结构校验，入口与依赖锁文件存在。代码构建和测试继续由后端验证。"
          showIcon
        />
      )}
    </>
  );
}
