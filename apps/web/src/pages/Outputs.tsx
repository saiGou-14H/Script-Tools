import {
  Alert,
  App,
  Button,
  Empty,
  Modal,
  Select,
  Skeleton,
  Table,
  Tabs,
  Tooltip,
} from "antd";
import {
  CheckCircleFilled,
  DownloadOutlined,
  EyeOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api, apiPage } from "../api";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { serviceDate } from "../lib/service-display";
import {
  outputFixtures,
  inlineOutputFixtures,
  downloadPreviewOutput,
  type PreviewOutput,
} from "../lib/consumer-preview";
import type { OutputMetadata } from "../types";

type OutputTab = "files" | "text" | "json";
interface OutputRow {
  key: string;
  name: string;
  kind: OutputMetadata["kind"];
  mediaType: string;
  size: string;
  run: string;
  runId: string;
  batch: string;
  created: string;
  expires: string;
  availability: string;
  deliveryStates: string[];
  preview?: PreviewOutput;
}
const tabFor = (kind: OutputMetadata["kind"]): OutputTab =>
  kind === "file" ? "files" : kind === "json" ? "json" : "text";
const availabilityLabels: Record<string, string> = {
  READY: "产物已就绪",
  STAGED: "生成中",
  VALIDATING: "校验中",
  WAITING_DEPENDENCY: "等待依赖",
  FAILED: "生成失败",
  EXPIRED: "已过期",
  QUARANTINED: "已隔离",
  UNAVAILABLE: "暂不可用",
};
function byteSize(value: string) {
  const bytes = BigInt(value);
  if (bytes < 1024n) return `${bytes} B`;
  const unit =
    bytes >= 1073741824n ? 1073741824n : bytes >= 1048576n ? 1048576n : 1024n;
  const amount = (bytes * 100n) / unit;
  const fraction = String(amount % 100n)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return `${amount / 100n}${fraction ? `.${fraction}` : ""} ${unit === 1073741824n ? "GB" : unit === 1048576n ? "MB" : "KB"}`;
}
function liveRow(output: OutputMetadata): OutputRow {
  return {
    key: output.id,
    name: output.file_name || output.title || `产物 ${output.id.slice(0, 8)}`,
    kind: output.kind,
    mediaType: output.media_type,
    size: byteSize(output.size_bytes),
    run: `运行-${output.run_id.slice(0, 8)}`,
    runId: output.run_id,
    batch: output.batch_key,
    created: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(output.created_at)),
    expires: serviceDate(output.expires_at),
    availability: output.availability,
    deliveryStates: output.deliveries.map((delivery) => delivery.status),
  };
}
function previewRow(output: PreviewOutput): OutputRow {
  return {
    ...output,
    availability: output.ready ? "READY" : "STAGED",
    deliveryStates: output.deliveryStatus === "SENT" ? ["SENT"] : [],
    preview: output,
  };
}
function deliveryLabel(states: string[]) {
  if (!states.length) return "未触发";
  if (states.includes("UNKNOWN")) return "回执未知";
  if (states.includes("FAILED")) return "投递失败";
  if (states.some((state) => ["PENDING", "SENDING"].includes(state)))
    return "投递中";
  if (states.every((state) => state === "SENT")) return "已通知";
  if (states.every((state) => state === "SUPPRESSED")) return "已抑制";
  return states.includes("SENT") ? "部分已通知" : "状态待载入";
}

function fileIcon(output: OutputRow) {
  const type = output.mediaType.toLowerCase();
  const name = output.name.toLowerCase();
  if (type.includes("json") || name.endsWith(".json"))
    return { name: "file", color: "purple" };
  if (type.startsWith("image/") || /\.(png|jpe?g|gif|webp|svg)$/.test(name))
    return { name: "image", color: "purple" };
  if (type.includes("pdf") || name.endsWith(".pdf"))
    return { name: "pdf", color: "red" };
  if (
    /csv|excel|spreadsheet/.test(type) ||
    /\.(csv|tsv|xls|xlsx|ods)$/.test(name)
  )
    return { name: "excel", color: "green" };
  if (/word|opendocument\.text/.test(type) || /\.(docx?|odt)$/.test(name))
    return { name: "word", color: "blue" };
  if (/zip|compressed|tar/.test(type) || /\.(zip|7z|rar|tar|gz)$/.test(name))
    return { name: "archive", color: "purple" };
  return { name: "file", color: "blue" };
}

export function OutputsPage() {
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const requested = params.get("output");
  const examples = [...outputFixtures, ...inlineOutputFixtures];
  const exampleDetail = prototype
    ? examples.find((output) => output.key === requested)
    : undefined;
  const detail = useQuery({
    queryKey: ["personal", bootstrap.user?.id, "output", requested],
    enabled: !prototype && !!requested,
    queryFn: () =>
      api<OutputMetadata>(`/outputs/${encodeURIComponent(requested!)}`),
  });
  const requestedKind = params.get("kind");
  const kind: OutputTab =
    requestedKind === "files" ||
    requestedKind === "text" ||
    requestedKind === "json"
      ? requestedKind
      : exampleDetail
        ? tabFor(exampleDetail.kind)
        : detail.data
          ? tabFor(detail.data.kind)
          : "files";
  const invalidKind =
    requestedKind !== null &&
    !["files", "text", "json"].includes(requestedKind);
  const query = useInfiniteQuery({
    queryKey: ["personal", bootstrap.user?.id, "outputs", kind],
    enabled: !prototype,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => {
      const search = new URLSearchParams({
        limit: "20",
      });
      if (kind === "text") search.set("kinds", "text,message");
      else search.set("kind", kind === "files" ? "file" : kind);
      if (pageParam) search.set("cursor", pageParam);
      return apiPage<OutputMetadata>(`/outputs?${search}`, { signal });
    },
    getNextPageParam: (page) => page.next_cursor || undefined,
  });
  const data = prototype
    ? examples.filter((output) => tabFor(output.kind) === kind).map(previewRow)
    : (query.data?.pages.flatMap((page) => page.items) || []).map(liveRow);
  const requestedRow = exampleDetail
    ? previewRow(exampleDetail)
    : detail.data
      ? liveRow(detail.data)
      : undefined;
  if (
    requestedRow &&
    tabFor(requestedRow.kind) === kind &&
    !data.some((output) => output.key === requestedRow.key)
  )
    data.unshift(requestedRow);
  const selected = requested
    ? data.find((output) => output.key === requested)
    : data[0];
  const missing = !!requested && prototype && !exampleDetail;
  const wrongKind = !!requestedRow && tabFor(requestedRow.kind) !== kind;
  function select(output: OutputRow) {
    const next = new URLSearchParams(params);
    next.set("output", output.key);
    next.set("kind", tabFor(output.kind));
    next.delete("preview");
    setParams(next);
  }
  function switchTab(next: string) {
    const search = new URLSearchParams(params);
    search.set("kind", next);
    search.delete("output");
    search.delete("preview");
    setParams(search);
  }
  const canRead = (output?: OutputRow) =>
    !invalidKind && !!output?.preview && output.availability === "READY";
  const previewOpen = params.get("preview") === "1" && canRead(selected);
  function closePreview() {
    const next = new URLSearchParams(params);
    next.delete("preview");
    setParams(next);
  }
  function notify(output: OutputRow) {
    select(output);
    void message.info("通知渠道尚未配置，未发送消息");
  }
  function previewOutput(output: OutputRow) {
    const next = new URLSearchParams(params);
    next.set("output", output.key);
    next.set("kind", tabFor(output.kind));
    next.set("preview", "1");
    setParams(next);
  }
  function download(output: OutputRow) {
    select(output);
    if (output.preview) downloadPreviewOutput(output.preview);
  }
  function actions(output: OutputRow) {
    return (
      <div className="row-actions">
        <Tooltip title={!prototype ? "正文存储接口待接入" : undefined}>
          <Button
            icon={<EyeOutlined aria-hidden />}
            disabled={!canRead(output)}
            onClick={() => previewOutput(output)}
          >
            安全预览
          </Button>
        </Tooltip>
        <Tooltip title={!prototype ? "文件下载接口待接入" : undefined}>
          <Button
            icon={<DownloadOutlined aria-hidden />}
            disabled={!canRead(output)}
            onClick={() => download(output)}
          >
            下载
          </Button>
        </Tooltip>
        <Tooltip title={!prototype ? "通知投递接口待接入" : undefined}>
          <Button
            icon={<SendOutlined aria-hidden />}
            disabled={!canRead(output)}
            onClick={() => notify(output)}
          >
            重投通知
          </Button>
        </Tooltip>
      </div>
    );
  }
  return (
    <div className="outputs-page">
      <PageHeading
        title="结果与产物"
        description="查看脚本运行后生成的文本、JSON和文件等产物，支持安全预览、下载或重投通知。"
        extra={prototype ? <Status>本地开发示例</Status> : undefined}
      />
      <div className="output-service-banner">
        <TileIcon name="stack" color="gradient" />
        <div>
          <h2>脚本一次服务说明</h2>
          <div className="output-service-rules">
            <span>
              <CheckCircleFilled aria-hidden />
              每单只有一次完整服务，同次接续不额外收费。
            </span>
            <span>
              <CheckCircleFilled aria-hidden />
              门票0元不等于脚本服务免费。
            </span>
            <span>
              <CheckCircleFilled aria-hidden />
              未达目标的退款规则由发布者选择，购买前展示，成交后固定。
            </span>
          </div>
        </div>
      </div>
      {(missing || invalidKind || wrongKind) && (
        <Alert
          className="output-feedback"
          type="warning"
          showIcon
          title={
            missing
              ? "指定产物不存在或已失效"
              : invalidKind
                ? "产物分类无效，请选择有效分类"
                : "所选产物不属于当前分类"
          }
          action={
            wrongKind && requestedRow ? (
              <Button onClick={() => select(requestedRow)}>查看所属分类</Button>
            ) : undefined
          }
        />
      )}
      {detail.error && (
        <Alert
          className="output-feedback"
          type="error"
          showIcon
          title="指定产物暂时无法加载"
          description={detail.error.message}
          action={<Button onClick={() => void detail.refetch()}>重试</Button>}
        />
      )}
      {query.error && (
        <Alert
          className="output-feedback"
          type="error"
          showIcon
          title="产物列表暂时无法加载"
          description={query.error.message}
          action={<Button onClick={() => void query.refetch()}>重试</Button>}
        />
      )}
      <Panel className="outputs-panel">
        <Tabs
          activeKey={kind}
          onChange={switchTab}
          items={[
            { key: "text", label: "文本" },
            { key: "json", label: "JSON" },
            { key: "files", label: "文件" },
          ]}
        />
        <div className="outputs-toolbar">
          {kind !== "files" && data.length > 0 && (
            <Select
              className="output-selector"
              aria-label="选择产物"
              value={selected?.key}
              options={data.map((output) => ({
                value: output.key,
                label: output.name,
              }))}
              onChange={(id) =>
                select(data.find((output) => output.key === id)!)
              }
            />
          )}
          <Tooltip title={selected?.name}>
            <Button
              icon={<EyeOutlined aria-hidden />}
              disabled={!canRead(selected)}
              onClick={() => selected && previewOutput(selected)}
            >
              安全预览
            </Button>
          </Tooltip>
          <Tooltip title={selected?.name}>
            <Button
              icon={<DownloadOutlined aria-hidden />}
              disabled={!canRead(selected)}
              onClick={() => selected && download(selected)}
            >
              下载
            </Button>
          </Tooltip>
          <Button
            type="primary"
            disabled={!canRead(selected)}
            onClick={() => selected && notify(selected)}
          >
            重投通知
          </Button>
        </div>
        {!prototype && query.isPending ? (
          <Skeleton className="output-loading" active />
        ) : kind === "files" ? (
          <Table
            rowKey="key"
            tableLayout="fixed"
            scroll={{ x: 1490 }}
            pagination={false}
            dataSource={data}
            rowClassName={(row) =>
              requested === row.key ? "output-row-selected" : ""
            }
            onRow={(row) => ({
              "aria-selected": selected?.key === row.key,
              onClick: (event) => {
                if (!(event.target as HTMLElement).closest("button,a"))
                  select(row);
              },
            })}
            columns={[
              {
                title: "文件名称",
                dataIndex: "name",
                width: 220,
                render: (value, row) => (
                  <div className="entity-cell">
                    <TileIcon {...fileIcon(row)} />
                    <b title={value}>{value}</b>
                  </div>
                ),
              },
              { title: "大小", dataIndex: "size", width: 110 },
              {
                title: "关联运行",
                dataIndex: "run",
                width: 188,
                render: (value, row) => (
                  <Link
                    className="dark-link"
                    to={`/me/runs/${encodeURIComponent(row.runId)}`}
                  >
                    {value}
                  </Link>
                ),
              },
              { title: "批次", dataIndex: "batch", width: 85, ellipsis: true },
              { title: "生成时间", dataIndex: "created", width: 165 },
              { title: "保留至", dataIndex: "expires", width: 112 },
              {
                title: "产物状态",
                width: 120,
                render: (_, row) => (
                  <Status
                    tone={
                      row.availability === "READY"
                        ? "green"
                        : [
                              "FAILED",
                              "EXPIRED",
                              "QUARANTINED",
                              "UNAVAILABLE",
                            ].includes(row.availability)
                          ? "gray"
                          : "blue"
                    }
                  >
                    {availabilityLabels[row.availability] || row.availability}
                  </Status>
                ),
              },
              {
                title: "通知状态",
                width: 105,
                render: (_, row) => (
                  <Status
                    tone={
                      deliveryLabel(row.deliveryStates) === "已通知"
                        ? "green"
                        : "gray"
                    }
                  >
                    {deliveryLabel(row.deliveryStates)}
                  </Status>
                ),
              },
              { title: "操作", width: 385, render: (_, row) => actions(row) },
            ]}
          />
        ) : (
          <div className="output-text-view">
            {selected && (
              <div className="output-inline-metadata">
                <Status>
                  {selected.kind === "message"
                    ? "消息"
                    : selected.kind === "json"
                      ? "JSON"
                      : "文本"}
                </Status>
                <Status
                  tone={selected.availability === "READY" ? "green" : "gray"}
                >
                  {availabilityLabels[selected.availability] ||
                    selected.availability}
                </Status>
                <Status
                  tone={
                    deliveryLabel(selected.deliveryStates) === "已通知"
                      ? "green"
                      : "gray"
                  }
                >
                  {deliveryLabel(selected.deliveryStates)}
                </Status>
                <Link to={`/me/runs/${encodeURIComponent(selected.runId)}`}>
                  {selected.run}
                </Link>
                <span>{selected.batch}</span>
                <span>保留至 {selected.expires}</span>
              </div>
            )}
            {selected?.preview && canRead(selected) ? (
              <pre>{selected.preview.content}</pre>
            ) : selected ? (
              <Empty
                description={
                  selected.preview
                    ? availabilityLabels[selected.availability] ||
                      "产物暂不可用"
                    : "正文存储接口待接入，当前可查看产物元数据"
                }
              />
            ) : (
              <Empty description="暂无产物" />
            )}
          </div>
        )}
        {!prototype && query.hasNextPage && (
          <Button
            className="output-load-more"
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            加载更多
          </Button>
        )}
        {!prototype && data.length > 0 && (
          <Notice>
            产物元数据已加载，正文存储、文件下载与通知投递接口待接入。
          </Notice>
        )}
        <Notice>
          提示　重投通知不会重新运行或扣费，仅用于再次向您发送已有结果的通知。
        </Notice>
      </Panel>
      <Modal
        title={selected ? `安全预览 · ${selected.name}` : "安全预览"}
        open={previewOpen}
        onCancel={closePreview}
        footer={<Button onClick={closePreview}>关闭</Button>}
      >
        <pre>{previewOpen ? selected?.preview?.content : undefined}</pre>
      </Modal>
    </div>
  );
}
