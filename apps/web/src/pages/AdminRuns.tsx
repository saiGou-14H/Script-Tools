import { useState } from "react";
import { App, Button, Empty, Modal, Table } from "antd";
import { Link } from "react-router-dom";
import { AdminDiagnosisForm } from "../components/AdminDiagnosisForm";
import { AdminOperationDialog } from "../components/AdminOperationDialog";
import { Notice, PageHeading, Panel, Status } from "../components/ui";
import { useAdminOperations, type OperationKind } from "../admin-operations";

const runFixtures = [
  {
    id: "Run081",
    status: "ENDED",
    object: "景点预约服务",
    description: "常规运行，已完成",
    mode: "Docker",
    node: "docker01",
  },
  {
    id: "Run082",
    status: "VERIFYING",
    object: "脚本 · 预约流程",
    description: "运行完成，待进行外部效果核验",
    mode: "KVM",
    node: "kvm02",
  },
  {
    id: "Run083",
    status: "RUNNING",
    object: "脚本 · 余票查询",
    description: "正在执行，请勿重复操作",
    mode: "Docker",
    node: "docker01",
  },
];
export function AdminRunsPage() {
  const { enabled, operations, requestOperation } = useAdminOperations();
  const [selected, setSelected] = useState<(typeof runFixtures)[number]>();
  const [operation, setOperation] = useState<{
    kind: OperationKind;
    resourceId: string;
    title: string;
  }>();
  const { message } = App.useApp();
  if (!enabled)
    return (
      <div className="admin-page admin-runs-page">
        <PageHeading title="运行与排障" />
        <Empty description="运行诊断接口尚未接入" />
      </div>
    );
  const rows = enabled ? runFixtures : [];
  const pendingStop = operations.find((item) => item.kind === "RUN_STOP");
  const runStatus = (row: (typeof runFixtures)[number]) =>
    operations.some(
      (item) => item.resourceId === row.id && item.kind === "RUN_STOP",
    )
      ? "停止中"
      : operations.some(
            (item) => item.resourceId === row.id && item.kind === "RUN_ISOLATE",
          )
        ? "隔离待处理"
        : row.status === "ENDED"
          ? "已结束"
          : row.status === "VERIFYING"
            ? "待核验"
            : "运行中";
  return (
    <div className="admin-page admin-runs-page">
      <PageHeading
        title="运行与排障"
        description="查看全站运行元数据，提供受控排障会话、受控停止与外部效果核验，保障服务稳定可用。"
      />
      <div className="admin-runs-columns">
        <div>
          <Panel title="全站运行元数据表" className="admin-runs-table">
            <Table
              rowKey="id"
              dataSource={rows}
              pagination={false}
              columns={[
                {
                  title: "运行编号",
                  dataIndex: "id",
                  render: (_, row) => (
                    <Button type="link" onClick={() => setSelected(row)}>
                      {row.id}
                    </Button>
                  ),
                },
                {
                  title: "运行状态",
                  render: (_, row) => (
                    <Status
                      tone={
                        runStatus(row) === "已结束"
                          ? "gray"
                          : runStatus(row) === "运行中"
                            ? "green"
                            : "orange"
                      }
                    >
                      {runStatus(row)}
                    </Status>
                  ),
                },
                { title: "关联对象", dataIndex: "object" },
                { title: "运行说明", dataIndex: "description" },
              ]}
            />
          </Panel>
          <Panel title="受控停止" className="admin-controlled-stop">
            <div>
              <span className="stop-pending-ring" />
              <span>
                <h3>{enabled ? "停止中待清理" : "运行状态待采集"}</h3>
                <p>
                  {pendingStop
                    ? `${pendingStop.resourceId}的本地停止预览已记录，等待收敛与资源清理证据。`
                    : enabled
                      ? "已提交受控停止请求，正在完成收敛与资源清理，请耐心等待。"
                      : "运行控制接口尚未接入"}
                </p>
              </span>
            </div>
          </Panel>
          <Panel title="外部效果核验" className="admin-external-verification">
            <Button
              disabled={!enabled}
              onClick={() =>
                setOperation({
                  kind: "RUN_VERIFY",
                  resourceId: "Run082",
                  title: "原外部效果核验预览",
                })
              }
            >
              开始核验
            </Button>
            <span>独立执行外部效果核验，验证服务对外表现是否符合预期。</span>
          </Panel>
        </div>
        <Panel
          title="受控排障"
          className="admin-runtime-diagnosis admin-diagnosis-form"
        >
          <p>在受控范围内开启限时会话，安全读取指定对象的数据以定位问题。</p>
          <AdminDiagnosisForm resourceLabel="对象ID" />
          <div className="diagnosis-capability">
            <span>
              所需能力 <Status>data.diagnose</Status>
            </span>
            <span>
              密钥 <b>********</b>
            </span>
          </div>
        </Panel>
      </div>
      <Modal
        title="运行诊断元数据"
        open={Boolean(selected)}
        onCancel={() => setSelected(undefined)}
        footer={
          <Button onClick={() => setSelected(undefined)}>关闭运行详情</Button>
        }
      >
        <h3>{selected?.id}</h3>
        <p>
          {selected?.object}　{selected?.mode}　{selected?.node}
        </p>
        <p>{selected?.description}</p>
        <div className="row-actions">
          <Button
            disabled={
              !selected ||
              selected.status !== "RUNNING" ||
              operations.some(
                (item) =>
                  item.resourceId === selected.id && item.kind === "RUN_STOP",
              )
            }
            onClick={() => {
              if (selected) {
                setOperation({
                  kind: "RUN_STOP",
                  resourceId: selected.id,
                  title: `受控停止 ${selected.id}`,
                });
                setSelected(undefined);
              }
            }}
          >
            受控停止
          </Button>
          <Button
            disabled={!selected || selected.status === "ENDED"}
            onClick={() => {
              if (selected) {
                setOperation({
                  kind: "RUN_ISOLATE",
                  resourceId: selected.id,
                  title: `隔离执行 ${selected.id}`,
                });
                setSelected(undefined);
              }
            }}
          >
            隔离执行
          </Button>
          <Button
            onClick={() =>
              void message.info("读取运行正文需要有效的对象和字段排障授权")
            }
          >
            读取授权正文
          </Button>
        </div>
        {selected?.id === "Run082" && (
          <p>
            <Link to="/admin/travel/unresolved?booking=BK082">
              查看外部预约 BK082
            </Link>
          </p>
        )}
      </Modal>
      {operation && (
        <AdminOperationDialog
          title={operation.title}
          onClose={() => setOperation(undefined)}
          onConfirm={(reason, key) =>
            requestOperation(operation.kind, operation.resourceId, reason, key)
          }
        >
          <Notice>
            {operation.kind === "RUN_VERIFY"
              ? "按原外部操作和有效只读授权核验结果，当前记录本地查询预览。"
              : "停止与隔离请求保留既有外部效果状态，运行结束和清理完成等待节点证据。"}
          </Notice>
        </AdminOperationDialog>
      )}
    </div>
  );
}
