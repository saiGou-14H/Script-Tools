import { Alert, Button, Empty, Skeleton, Table, Tabs } from "antd";
import {
  CheckCircleFilled,
  CheckOutlined,
  FileTextOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Status, TileIcon } from "../components/ui";
import { Icon } from "../components/Icon";
import { ServicePurchaseButton } from "../components/ServicePurchaseButton";
import {
  serviceAvailable,
  serviceDate,
  serviceDeployment,
  serviceDuration,
  serviceVersion,
  marketReturnPath,
} from "../lib/service-display";
import { currency, useServices } from "./Market";
import { parameterExamples } from "../lib/schema-parameters";

export function ServiceDetailPage() {
  const { data = [], isPending, error, refetch } = useServices();
  const { bootstrap, role } = useWorkspace();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get("tab");
  const tab =
    requestedTab && ["intro", "io", "rules"].includes(requestedTab)
      ? requestedTab
      : "intro";
  const guest = role === "GUEST";
  const service =
    data.find((item) => item.id === id) ||
    (id === "demo" && bootstrap.data_mode === "prototype"
      ? data.find((item) => item.delivery_policy.icon === "table")
      : undefined);
  if (isPending) return <Skeleton active />;
  if (error)
    return (
      <Alert
        type="error"
        title="服务暂时无法加载"
        description={error.message}
        action={<Button onClick={() => void refetch()}>重试</Button>}
        showIcon
      />
    );
  if (!service) return <Empty description="服务不存在或已失效" />;
  const tableExample =
    bootstrap.data_mode === "prototype" &&
    service.input_schema_digest === "schema-table";
  const available = serviceAvailable(service);
  const deployed = service.deployment_status === "READY";
  const examples = parameterExamples(
    service.input_schema,
    service.input_ui_schema?.["ui:order"] || [],
    tableExample,
  );
  const workflow = tableExample
    ? [
        { title: "上传数据", text: "上传CSV文件" },
        { title: "选择去重字段", text: "选择去重字段" },
        { title: "获取处理结果", text: "执行处理后，获取本次交付文件" },
      ]
    : [
        { title: "填写参数", text: "按发布者的输入要求配置" },
        { title: "确认服务规则", text: "确认交付范围、价格和退款规则" },
        { title: "获取结果", text: "在订单与产物页面查看交付" },
      ];
  const standards = [
    service.delivery_policy.summary,
    `采用固定脚本版本 ${serviceVersion(service)}`,
    "执行进度与结果可在订单中追踪",
    `单次执行使用${serviceDuration(service.max_service_seconds)}时限`,
  ];
  const title = <h1>脚本服务详情</h1>;
  const breadcrumb = (
    <div className="retail-breadcrumb">
      <Link to={marketReturnPath(params.get("returnTo")) || "/market"}>
        脚本市场
      </Link>
      <span>/</span>
      <span>{service.title}</span>
    </div>
  );
  const info = (
    <dl className="service-basic-details">
      <dt>
        <Icon name="order" />
        服务名称
      </dt>
      <dd>{service.title}</dd>
      <dt>
        <Icon name="user" />
        发布者
      </dt>
      <dd>{service.delivery_policy.publisher_name}</dd>
      <dt>
        <Icon name="code" />
        版本
      </dt>
      <dd>
        <Status tone="gray">{serviceVersion(service)}</Status>
      </dd>
      <dt>
        <Icon name="shield" />
        部署状态
      </dt>
      <dd>
        <Status tone={deployed ? "green" : "gray"}>
          {serviceDeployment(service)}
        </Status>
      </dd>
      <dt>
        <Icon name="calendar" />
        最近更新
      </dt>
      <dd>{serviceDate(service.updated_at)}</dd>
      {!guest && (
        <>
          <dt>
            <Icon name="calendar" />
            服务日期
          </dt>
          <dd>{serviceDate(service.published_at)}</dd>
        </>
      )}
    </dl>
  );
  return (
    <div
      className={`service-detail-page ${guest ? "guest-service" : "member-service"}`}
    >
      <div className="service-detail-heading">
        {guest ? (
          <>
            {breadcrumb}
            {title}
          </>
        ) : (
          <>
            {title}
            {breadcrumb}
          </>
        )}
      </div>
      <div className="retail-detail-columns">
        <section className="retail-detail-main">
          <header className="retail-service-banner">
            <TileIcon name={service.delivery_policy.icon} color="gradient" />
            <div>
              <h2>{service.title}</h2>
              <div className="retail-publisher-line">
                <span>发布者　{service.delivery_policy.publisher_name}</span>
                <Status>{serviceVersion(service)}</Status>
                <Status tone={deployed ? "green" : "gray"}>
                  {deployed && <CheckOutlined />}
                  {serviceDeployment(service)}
                </Status>
              </div>
              <p>{service.description}</p>
            </div>
          </header>
          <section className="service-explanation-card">
            <Tabs
              activeKey={tab}
              onChange={(value) => {
                const next = new URLSearchParams(params);
                if (value === "intro") next.delete("tab");
                else next.set("tab", value);
                setParams(next);
              }}
              items={[
                {
                  key: "intro",
                  label: "服务介绍",
                  children: (
                    <div className="service-introduction">
                      <section className="service-usage">
                        <h2>{guest ? "用法说明" : "使用方法"}</h2>
                        {!guest && <p>{service.description}</p>}
                        <ol>
                          {workflow.map((step, index) => (
                            <li key={step.title}>
                              <b>{index + 1}</b>
                              <div>
                                <strong>
                                  {guest ? step.text : step.title}
                                </strong>
                                {!guest && <p>{step.text}</p>}
                              </div>
                            </li>
                          ))}
                        </ol>
                        <div className="service-limit-strip">
                          <span>
                            <Icon name="upload" />
                            按发布者Schema配置
                          </span>
                          <span>
                            <Icon name="database" />
                            {tableExample
                              ? "支持CSV格式"
                              : "参数要求见输入说明"}
                          </span>
                          <span>
                            <Icon name="clock" />
                            单次最长{" "}
                            {serviceDuration(service.max_service_seconds)}
                          </span>
                        </div>
                      </section>
                      <div className="service-example-and-delivery">
                        <section className="service-parameter-examples">
                          <h2>参数示例</h2>
                          {!guest && (
                            <p>
                              以下为典型设置示例，完整参数要求见输入与输出。
                            </p>
                          )}
                          {examples.length ? (
                            <Table
                              rowKey="name"
                              dataSource={
                                guest ? examples : examples.slice(0, 2)
                              }
                              pagination={false}
                              size="small"
                              scroll={{ x: guest ? 560 : 520 }}
                              columns={[
                                {
                                  title: guest ? "参数项" : "参数",
                                  dataIndex: "title",
                                },
                                {
                                  title: "示例值",
                                  dataIndex: "example",
                                  render: (value) =>
                                    guest ? <Status>{value}</Status> : value,
                                },
                                ...(guest
                                  ? [
                                      {
                                        title: "说明",
                                        dataIndex: "description",
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          ) : (
                            <p>该动作采用整体Schema定义，请查看输入与输出。</p>
                          )}
                        </section>
                        <section className="service-delivery-standards">
                          <h2>交付标准</h2>
                          {guest ? (
                            <ul>
                              {standards.map((text) => (
                                <li key={text}>
                                  <CheckCircleFilled />
                                  {text}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <>
                              <p>一次服务完成后，按发布版本交付以下内容。</p>
                              <div className="delivery-standard-cards">
                                <article>
                                  <TileIcon name="file" />
                                  <div>
                                    <h3>
                                      {tableExample
                                        ? "清洗后的文件"
                                        : "交付内容"}
                                    </h3>
                                    <p>{service.delivery_policy.summary}</p>
                                  </div>
                                </article>
                                <article>
                                  <TileIcon name="chart" />
                                  <div>
                                    <h3>处理结果</h3>
                                    <p>
                                      结果结构按本版本输出Schema展示，交付状态独立记录。
                                    </p>
                                  </div>
                                </article>
                              </div>
                            </>
                          )}
                        </section>
                      </div>
                    </div>
                  ),
                },
                {
                  key: "io",
                  label: "输入与输出",
                  children: (
                    <div className="service-schema-tab">
                      <h2>输入Schema</h2>
                      <pre
                        role="region"
                        aria-label="服务输入Schema"
                        tabIndex={0}
                      >
                        {JSON.stringify(service.input_schema, null, 2)}
                      </pre>
                      <h2>输出Schema</h2>
                      <pre
                        role="region"
                        aria-label="服务输出Schema"
                        tabIndex={0}
                      >
                        {service.output_schema === undefined
                          ? "发布版本尚未提供输出Schema"
                          : JSON.stringify(service.output_schema, null, 2)}
                      </pre>
                    </div>
                  ),
                },
                {
                  key: "rules",
                  label: "购买规则",
                  children: (
                    <div className="service-rules-tab">
                      <h2>一次完整服务</h2>
                      <p>包含本次服务及同次必要接续。</p>
                      <h2>退款规则</h2>
                      <p>{service.refund_policy.summary}</p>
                      <p>未执行可全额退服务费。成交后按本次合同执行。</p>
                      <h2>执行与核验</h2>
                      <p>
                        单次最长{serviceDuration(service.max_service_seconds)}
                        ，核验时限为
                        {serviceDuration(service.resolution_seconds)}。
                      </p>
                    </div>
                  ),
                },
              ]}
            />
          </section>
        </section>
        <aside className="retail-purchase-aside">
          <section className="retail-purchase-card">
            <div className="retail-service-price">
              ¥{currency(service.amount_minor)}
              <small>/次</small>
            </div>
            <ul className="purchase-service-benefits">
              {[
                guest
                  ? "包含一次完整服务及同次必要接续"
                  : "包含一次完整服务及同次必要接续（本次服务未完成前继续处理不再额外收费）",
                service.refund_policy.summary,
                "未执行可全额退服务费",
              ].map((text) => (
                <li key={text}>
                  <CheckCircleFilled />
                  {text}
                </li>
              ))}
            </ul>
            {!available && (
              <Alert
                type="warning"
                title={service.availability?.reason || "服务当前不可购买"}
                showIcon
              />
            )}
            <ServicePurchaseButton service={service} />
            {guest && info}
          </section>
          {!guest && (
            <>
              <section className="retail-purchase-notice">
                <h2>
                  <InfoCircleOutlined />
                  重要说明
                </h2>
                <ul>
                  <li>本服务按次付费，每次提供一次完整服务。</li>
                  <li>门票0元的预约场景，脚本服务按页面标价另行付费。</li>
                  <li>交付范围及退款规则在购买前展示，并按成交合同执行。</li>
                </ul>
              </section>
              <section className="retail-purchase-information">
                <h2>
                  <FileTextOutlined />
                  基本信息
                </h2>
                {info}
              </section>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
