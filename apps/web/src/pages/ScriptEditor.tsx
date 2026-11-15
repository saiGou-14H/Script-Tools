import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Input, Select, Tabs, Tree, App, Spin } from "antd";
import {
  CheckOutlined,
  FileOutlined,
  FolderFilled,
  PlusOutlined,
  SafetyOutlined,
  InboxOutlined,
  FileTextOutlined,
  CodeOutlined,
} from "@ant-design/icons";
import { PageHeading, Panel, Status } from "../components/ui";
import { Empty } from "antd";
import { useParams } from "react-router-dom";
import { initialScriptFiles, usePublisherPreview } from "../publisher-preview";
import Ajv2020 from "ajv/dist/2020";
import manifestSchema from "../generated/manifest-schema.json";
import { initialEditorFile } from "../lib/script-editor";
import { SourceCodeEditor } from "../components/SourceCodeEditor";

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
  return <ScriptEditor key={id} id={id} />;
}

function ScriptEditor({ id }: { id: string }) {
  const { scripts, drafts, saveDraft, loadDraft, loading } =
    usePublisherPreview();
  const script = scripts.find(
    (item) => item.id === (id === "demo" ? "table" : id),
  );
  const initialFiles = script
    ? drafts[script.id] || (script.versionId ? {} : initialScriptFiles(script))
    : {};
  const [files, setFiles] = useState(initialFiles);
  const [selected, setSelected] = useState(initialEditorFile(initialFiles));
  const [openFiles, setOpenFiles] = useState([initialEditorFile(initialFiles)]);
  const [sourceRetry, setSourceRetry] = useState(0);
  const [loadingSource, setLoadingSource] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!script) return;
    let active = true;
    setLoadingSource(true);
    loadDraft(script.id)
      .then((source) => {
        if (!active) return;
        setFiles(source);
        const entry = initialEditorFile(source);
        setSelected(entry);
        setOpenFiles([entry]);
      })
      .catch((failure) => {
        if (active) setError(failure.message);
      })
      .finally(() => {
        if (active) setLoadingSource(false);
      });
    return () => {
      active = false;
    };
  }, [script?.id, script?.versionId, sourceRetry]);
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
  if (loading || loadingSource) return <Spin />;
  if (!script) return <Empty description="脚本不存在或已失效" />;
  if (script.versionId && Object.keys(files).length === 0)
    return (
      <Alert
        type="error"
        showIcon
        message={error || "源码尚未加载"}
        action={
          <Button onClick={() => setSourceRetry((value) => value + 1)}>
            重试
          </Button>
        }
      />
    );
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
    try {
      const current = JSON.parse(files["manifest.json"] || "{}");
      if (!current || typeof current !== "object" || Array.isArray(current))
        throw new Error("清单必须是JSON对象，请先修正清单内容");
      setFiles((previous) => ({
        ...previous,
        "manifest.json": JSON.stringify({ ...current, ...patch }, null, 2),
      }));
      setValidated(false);
    } catch {
      void message.error("清单JSON无效，请先在manifest.json中修正内容");
    }
  }
  const actionNames =
    manifest.actions && typeof manifest.actions === "object"
      ? Object.keys(manifest.actions)
      : [];
  const action = manifest.actions?.[manifest.default_action || actionNames[0]];
  function openFile(file: string) {
    setSelected(file);
    setOpenFiles((current) =>
      current.includes(file) ? current : [...current, file],
    );
  }
  function closeFile(file: string) {
    const remaining = openFiles.filter((item) => item !== file);
    setOpenFiles(remaining);
    if (selected === file) {
      const index = openFiles.indexOf(file);
      setSelected(remaining[Math.min(index, remaining.length - 1)] || "");
    }
  }
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
            loading={saving}
            onClick={async () => {
              setSaving(true);
              try {
                await saveDraft(script.id, files);
                void message.success(
                  script.versionId ? "草稿已保存" : "草稿预览已保存",
                );
              } catch (failure) {
                void message.error((failure as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            保存草稿
          </Button>
          <Button aria-label="校验" icon={<CheckOutlined />} onClick={validate}>
            校验
          </Button>
          <Button
            type="primary"
            icon={<InboxOutlined />}
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
              aria-label="新建文件"
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
                  onOk: (close) => {
                    const name = (
                      document.getElementById(
                        "new-script-file",
                      ) as HTMLInputElement
                    )?.value.trim();
                    if (!name || /[\\/]/.test(name)) {
                      void message.error("请输入有效的文件名");
                      return;
                    }
                    if (Object.hasOwn(files, name)) {
                      void message.error("文件已存在，请使用其他文件名");
                      return;
                    }
                    setFiles((previous) => ({ ...previous, [name]: "" }));
                    openFile(name);
                    setValidated(false);
                    close();
                  },
                })
              }
            />
          }
        >
          <Tree
            blockNode
            showIcon
            selectedKeys={[selected]}
            defaultExpandAll
            onSelect={(keys) => {
              if (typeof keys[0] === "string" && keys[0] in files)
                openFile(keys[0]);
            }}
            treeData={[
              {
                key: "root",
                title: "/（脚本根目录）",
                icon: <FolderFilled />,
                children: Object.keys(files).map((name) => ({
                  key: name,
                  title: name,
                  icon: name.endsWith(".json") ? (
                    <CodeOutlined />
                  ) : (
                    <FileTextOutlined />
                  ),
                })),
              },
            ]}
          />
        </Panel>
        <Panel className="code-panel">
          <Tabs
            activeKey={selected}
            type="editable-card"
            hideAdd
            locale={{ removeAriaLabel: "关闭文件页签" }}
            onChange={setSelected}
            onEdit={(key, action) => {
              if (action === "remove" && typeof key === "string")
                closeFile(key);
            }}
            items={openFiles.map((file) => ({
              key: file,
              label: file,
            }))}
          />
          {selected ? (
            <SourceCodeEditor
              key={selected}
              file={selected}
              value={files[selected] || ""}
              onChange={(value) => {
                setFiles((previous) => ({
                  ...previous,
                  [selected]: value,
                }));
                setValidated(false);
              }}
            />
          ) : (
            <Empty
              className="code-empty"
              description="选择文件查看和编辑"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Panel>
        <Panel title="脚本配置">
          <div className="editor-config-row">
            <label>入口文件 ⓘ</label>
            <Select
              aria-label="入口文件"
              value={manifest.entrypoint || ""}
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
              value={manifest.language || ""}
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
              value={manifest.default_action || ""}
              onChange={(default_action) => updateManifest({ default_action })}
              options={actionNames.map((value) => ({ value }))}
            />
          </div>
          <h3>
            输入 Schema{" "}
            <Button
              type="link"
              size="small"
              onClick={() => openFile("manifest.json")}
            >
              编辑
            </Button>
          </h3>
          <pre role="region" aria-label="输入Schema预览" tabIndex={0}>
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
              onClick={() => openFile("manifest.json")}
            >
              编辑
            </Button>
          </h3>
          <pre role="region" aria-label="输出Schema预览" tabIndex={0}>
            {JSON.stringify(action?.output_schema ?? {}, null, 2)}
          </pre>
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
      {!error && (
        <Alert
          className="editor-validation"
          type={validated ? "success" : "info"}
          title={validated ? "清单校验成功" : "草稿待校验"}
          description={
            validated
              ? "已通过manifest 2.0结构校验，入口与依赖锁文件存在。代码构建和测试继续由后端验证。"
              : "保存编辑内容后可校验清单结构、入口与依赖锁文件。"
          }
          showIcon
        />
      )}
    </>
  );
}
