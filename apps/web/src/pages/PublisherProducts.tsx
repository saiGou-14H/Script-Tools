import { useRef, useState } from "react";
import {
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Radio,
  Select,
  Skeleton,
  Table,
  Tabs,
} from "antd";
import {
  CheckCircleFilled,
  PlusOutlined,
  SafetyCertificateFilled,
} from "@ant-design/icons";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  usePublisherPreview,
  type PublisherProduct,
} from "../publisher-preview";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { formatMinorUnits, parseYuan } from "../lib/money";
import { useWorkspace } from "../context";
import { parameterExamples } from "../lib/schema-parameters";
import { captureProductRelease } from "../lib/publisher-product-preview";
import { serviceDuration } from "../lib/service-display";

const statusLabels: Record<PublisherProduct["status"], string> = {
  ACTIVE: "在售",
  DRAFT: "草稿",
  PAUSED: "停销",
  RETIRED: "已下架",
};

export function ProductsPage() {
  const { products, scripts, setProductStatus } = usePublisherPreview();
  const { bootstrap } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const [params, setParams] = useSearchParams();
  const tab = params.get("status") || "ALL";
  const [preview, setPreview] = useState<PublisherProduct>();
  const { modal, message } = App.useApp();
  const rows = prototype
    ? products.filter((item) => tab === "ALL" || item.status === tab)
    : [];
  const previewSchema =
    preview?.releaseSnapshot?.inputSchema ??
    scripts.find((script) => script.id === preview?.scriptId)?.inputSchema;
  function pause(product: PublisherProduct) {
    modal.confirm({
      title: "停销影响预览",
      content: `${product.title}将停止新购买，已有订单继续履约或按成交规则退款。当前操作用于本地原型预览。`,
      okText: "确认停销预览",
      cancelText: "返回",
      onOk: () => {
        setProductStatus(product.id, "PAUSED");
        void message.success("停销预览已保存");
      },
    });
  }
  return (
    <div className="publisher-products-page">
      <PageHeading title="服务商品" extra={<Status tone="gray">{prototype ? "本地示例" : "商品服务待接入"}</Status>} />
      {!prototype && <Notice>本人商品及发布状态服务待接入，当前记录暂不可用。</Notice>}
      <Notice>
        <b>停销说明</b>
        　停销仅停止新购买，已有订单继续履约或退款，已部署服务保留使用入口。
      </Notice>
      <Tabs
        className="product-tabs"
        activeKey={tab}
        onChange={(value) => {
          const next = new URLSearchParams(params);
          if (value === "ALL") next.delete("status");
          else next.set("status", value);
          setParams(next);
        }}
        tabBarExtraContent={
          prototype ? <Link to="/publisher/services/new/edit">
            <Button
              type="primary"
              icon={<PlusOutlined aria-hidden />}
              aria-label="创建服务"
            >
              创建服务
            </Button>
          </Link> : <Button type="primary" disabled>创建服务</Button>
        }
        items={["ALL", "ACTIVE", "DRAFT", "PAUSED", "RETIRED"].map((key) => {
          const title = key === "ALL"
            ? "全部"
            : statusLabels[key as PublisherProduct["status"]];
          const count = key === "ALL"
            ? products.length
            : products.filter((item) => item.status === key).length;
          return { key, label: `${title}（${prototype ? count : "—"}）` };
        })}
      />
      <Panel className="product-list">
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={false}
          scroll={{ x: 1400 }}
          columns={[
            {
              title: "服务商品",
              width: "38%",
              render: (_, row) => (
                <div className="entity-cell">
                  <TileIcon
                    name={row.icon}
                    color={
                      row.icon === "travel"
                        ? "purple"
                        : row.id === "files"
                          ? "orange"
                          : "gradient"
                    }
                  />
                  <div>
                    <h2>{row.title}</h2>
                    <p>{row.description}</p>
                  </div>
                </div>
              ),
            },
            {
              title: "价格（每次）",
              dataIndex: "amountMinor",
              render: (value) =>
                value ? (
                  <>
                    <strong>
                      {formatMinorUnits(value).replace(/\.00$/, "")}
                    </strong>{" "}
                    元/次
                  </>
                ) : (
                  <b>未定价</b>
                ),
            },
            {
              title: "状态",
              dataIndex: "status",
              render: (value) => (
                <Status tone={value === "ACTIVE" ? "green" : "gray"}>
                  {statusLabels[value as PublisherProduct["status"]]}
                </Status>
              ),
            },
            {
              title: "部署状态",
              dataIndex: "deploymentReady",
              render: (value) => (
                <Status tone={value ? "green" : "gray"}>
                  {value ? "✓ 部署就绪" : "未部署"}
                </Status>
              ),
            },
            {
              title: "操作",
              render: (_, row) => (
                <div className="row-actions">
                  <Link to={`/publisher/services/${row.id}/edit`}>
                    <Button>编辑</Button>
                  </Link>
                  {row.status === "ACTIVE" && (
                    <Button onClick={() => pause(row)}>停销</Button>
                  )}
                  {row.status === "ACTIVE" ? (
                    <Button
                      onClick={() => setPreview(row)}
                    >
                      查看消费者页面
                    </Button>
                  ) : row.status === "DRAFT" ? (
                    <Button onClick={() => setPreview(row)}>预览草稿</Button>
                  ) : (
                    <Button onClick={() => setPreview(row)}>
                      查看停销信息
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <Modal
        title={preview?.status === "ACTIVE" ? "消费者页面预览" : "服务商品预览"}
        open={prototype && !!preview}
        onCancel={() => setPreview(undefined)}
        footer={<Button onClick={() => setPreview(undefined)}>关闭预览</Button>}
      >
        <h2>{preview?.title}</h2>
        <p>{preview?.description}</p>
        <p>状态　{preview && statusLabels[preview.status]}</p>
        <p>
          服务费　
          {preview?.amountMinor
            ? `${formatMinorUnits(preview.amountMinor)} 元/次`
            : "未定价"}
        </p>
        <pre>{preview?.delivery}</pre>
        {preview?.releaseSnapshot ? (
          <dl className="product-release-preview">
            <dt>固定脚本版本</dt><dd>{preview.releaseSnapshot.scriptVersion}</dd>
            <dt>固定价格版本</dt><dd>v{preview.releaseSnapshot.pricePlanVersion}</dd>
            <dt>最长服务时间</dt><dd>{serviceDuration(String(preview.releaseSnapshot.maxServiceSeconds))}</dd>
            <dt>可启动有效期</dt><dd>{preview.releaseSnapshot.validityDays}天</dd>
            <dt>目标判定</dt><dd>{preview.releaseSnapshot.goal}</dd>
            <dt>目标核验期限</dt><dd>执行结束后{preview.releaseSnapshot.verificationHours}小时</dd>
          </dl>
        ) : <Notice>固定发布快照待载入。</Notice>}
        <pre className="product-release-schema">{JSON.stringify(previewSchema, null, 2)}</pre>
      </Modal>
    </div>
  );
}

export function ProductEditorPage() {
  const { id = "demo" } = useParams();
  const [params] = useSearchParams();
  const script = id === "new" ? params.get("script") || undefined : undefined;
  return (
    <ProductEditor
      key={JSON.stringify([id, script])}
      id={id}
      initialScriptId={script}
    />
  );
}

function ProductEditor({
  id,
  initialScriptId,
}: {
  id: string;
  initialScriptId?: string;
}) {
  const { bootstrap } = useWorkspace();
  const {
    products,
    scripts,
    pricePlans,
    profile,
    saveProduct,
    productDrafts,
    loading,
  } = usePublisherPreview();
  const currentProduct = products.find(
    (item) => item.id === (id === "demo" ? "table" : id),
  );
  const product = productDrafts[currentProduct?.id || id] || currentProduct;
  const [scriptId, setScriptId] = useState(
    product?.scriptId ||
      initialScriptId ||
      (id === "new" ? scripts[0]?.id : id),
  );
  const script = scripts.find((item) => item.id === scriptId);
  const productId = useRef(
    product?.id ||
      (id === "new" ? `preview-service-${crypto.randomUUID()}` : id),
  );
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const navigate = useNavigate();
  if (bootstrap.data_mode !== "prototype")
    return <Empty description="商品发布服务待接入，编辑资料暂不可用" />;
  if (!script && loading) return <Skeleton active />;
  if (!script) return <Empty description="服务或关联脚本不存在或已失效" />;
  const plans = pricePlans
    .filter((item) => item.serviceId === product?.id)
    .sort((a, b) => b.version - a.version);
  const plan = plans[0];
  const deploymentReady = product?.deploymentReady ?? script.deployed;
  const checks = [
    {
      title: "版本固定",
      valid: script.contentStatus === "READY",
      description: `已绑定${script.version}，${script.contentStatus === "READY" ? "版本已锁定。" : "版本仍待完成构建与封存。"}`,
    },
    {
      title: "部署可用",
      valid: deploymentReady,
      description: deploymentReady
        ? "部署状态为READY，可正常提供服务。"
        : "关联部署待就绪。",
    },
    {
      title: "价格规则完整",
      valid: !!plan,
      description: plan
        ? `已配置价格方案，${formatMinorUnits(plan.amountMinor).replace(/\.00$/, "")} 元/次。`
        : "请先保存服务，再配置按次价格方案。",
    },
    {
      title: "收款资料有效",
      valid: profile.payoutVerified,
      description: profile.payoutVerified
        ? "收款资料已配置且有效，可按次收款。"
        : "收款资料待验证。",
    },
  ];
  function save(
    values: {
      title: string;
      description: string;
      category: string;
      delivery: string;
      refundRule: PublisherProduct["refundRule"];
    },
    publish: boolean,
  ) {
    if (publish && checks.some((item) => !item.valid)) {
      void message.error("请先完成发布检查清单");
      return;
    }
    if (publish && plan?.refundRule !== values.refundRule) {
      void message.error("退款选项须与固定价格方案一致");
      return;
    }
    const updated: PublisherProduct = {
      id: productId.current,
      scriptId: script!.id,
      title: values.title,
      description: values.description,
      category: values.category,
      delivery: values.delivery,
      refundRule: values.refundRule,
      amountMinor: plan?.amountMinor || product?.amountMinor || null,
      icon: product?.icon || "code",
      deploymentReady,
      status: publish ? "ACTIVE" : currentProduct?.status || "DRAFT",
      releaseSnapshot:
        publish && plan ? captureProductRelease(script!, plan) : undefined,
    };
    if (publish)
      modal.confirm({
        title: "发布上架预览",
        content:
          "将按当前版本、部署、价格和退款规则生成上架预览。真实服务发布需要接入后端接口。",
        okText: "确认发布预览",
        cancelText: "返回修改",
        onOk: () => {
          saveProduct(updated, true);
          void message.success("上架预览已保存");
          navigate("/publisher/services");
        },
      });
    else {
      saveProduct(updated);
      void message.success("服务草稿预览已保存");
      navigate("/publisher/services");
    }
  }
  const fields = parameterExamples(script.inputSchema);
  return (
    <div className="product-editor-page">
      <PageHeading title="编辑与上架服务" extra={<Status tone="gray">本地示例</Status>} />
      <div className="product-editor-columns">
        <Panel>
          <Form
            form={form}
            layout="horizontal"
            labelCol={{ flex: "190px" }}
            wrapperCol={{ flex: 1 }}
            labelAlign="start"
            colon={false}
            initialValues={{
              title: product?.title || script.title,
              category: product?.category || "数据处理",
              description:
                product?.id === "table" &&
                product.description.startsWith("清理与标准化")
                  ? "上传 CSV 进行去重与清洗，生成清洗文件和统计摘要。"
                  : product?.description || script.purpose,
              delivery: product?.delivery || "生成符合约定的可领取结果。",
              refundRule:
                plan?.refundRule || product?.refundRule || "FULL_IF_UNMET",
            }}
          >
            {id === "new" && (
              <Form.Item label="绑定脚本" required>
                <Select
                  aria-label="绑定脚本"
                  value={scriptId}
                  onChange={setScriptId}
                  options={scripts.map((item) => ({
                    value: item.id,
                    label: `${item.title} ${item.version}`,
                  }))}
                />
              </Form.Item>
            )}
            <Form.Item
              name="title"
              label="服务名称"
              rules={[{ required: true, whitespace: true }, { max: 200 }]}
            >
              <Input maxLength={200} showCount />
            </Form.Item>
            <Form.Item
              name="category"
              label="分类"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  "数据处理",
                  "文件工具",
                  "信息整理",
                  "旅行预约",
                  "其他",
                ].map((value) => ({ value }))}
              />
            </Form.Item>
            <Form.Item
              name="description"
              label="服务说明"
              rules={[{ required: true, whitespace: true }, { max: 10000 }]}
            >
              <Input.TextArea rows={3} maxLength={10000} showCount />
            </Form.Item>
            <Form.Item label="输入参数预览" required>
              <div className="product-input-preview" role="region" aria-label="发布参数预览" tabIndex={0}>
                {fields.map((field) => (
                  <div key={field.name}>
                    <b>{field.title}</b>
                    <span>
                      {field.example}
                      <small>{field.required ? "必填" : "可选"}</small>
                    </span>
                  </div>
                ))}
                {!fields.length && (
                  <pre>{JSON.stringify(script.inputSchema, null, 2)}</pre>
                )}
              </div>
            </Form.Item>
            <Form.Item
              name="delivery"
              label="交付标准"
              rules={[{ required: true, whitespace: true }, { max: 10000 }]}
            >
              <Input.TextArea rows={3} maxLength={10000} showCount />
            </Form.Item>
            <div className="product-binding-summary">
              <div>
                <TileIcon name="box" />
                <span>
                  绑定版本<b>{script.version}</b>
                </span>
              </div>
              <div>
                <TileIcon name="server" />
                <span>
                  部署状态
                  <b>
                    <Status tone={deploymentReady ? "green" : "gray"}>
                      {deploymentReady ? "READY" : "待部署"}
                    </Status>
                  </b>
                </span>
              </div>
              <Link
                to={`/publisher/pricing?service=${product?.id || productId.current}`}
              >
                <TileIcon name="payment" />
                <span>
                  价格方案
                  <b>
                    {plan
                      ? `${formatMinorUnits(plan.amountMinor).replace(/\.00$/, "")} 元/次`
                      : "待配置"}
                  </b>
                </span>
              </Link>
            </div>
            <Form.Item
              name="refundRule"
              label="退款选项"
              rules={[{ required: true }]}
            >
              <Radio.Group>
                <Radio value="FULL_IF_UNMET">目标未达全退</Radio>
                <Radio value="NO_REFUND_IF_UNMET">按约交付但目标未达不退</Radio>
              </Radio.Group>
            </Form.Item>
          </Form>
        </Panel>
        <Panel title="发布检查清单" className="publish-checks">
          <div>
            {checks.map((item) => (
              <div key={item.title}>
                <CheckCircleFilled
                  className={item.valid ? "check-valid" : "check-pending"}
                />
                <section>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </section>
                <Status tone={item.valid ? "green" : "orange"}>
                  {item.valid ? "通过" : "待完成"}
                </Status>
              </div>
            ))}
          </div>
          <div className="publish-editor-actions">
            <Button
              onClick={() =>
                void form
                  .validateFields()
                  .then((values) => save(values, false))
                  .catch((error) => {
                    if (error instanceof Error)
                      void message.error(error.message);
                  })
              }
            >
              保存草稿
            </Button>
            <Button
              type="primary"
              onClick={() =>
                void form
                  .validateFields()
                  .then((values) => save(values, true))
                  .catch((error) => {
                    if (error instanceof Error)
                      void message.error(error.message);
                  })
              }
            >
              发布上架
            </Button>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function PricingPage() {
  const [params] = useSearchParams();
  const serviceId = params.get("service") || "table";
  return <PricingEditor key={serviceId} serviceId={serviceId} />;
}

function PricingEditor({ serviceId }: { serviceId: string }) {
  const { bootstrap } = useWorkspace();
  const { products, pricePlans, addPricePlan } = usePublisherPreview();
  const product = products.find((item) => item.id === serviceId);
  const plans = pricePlans
    .filter((item) => item.serviceId === serviceId)
    .sort((a, b) => b.version - a.version);
  const initial = plans[0];
  const [amount, setAmount] = useState(
    initial ? formatMinorUnits(initial.amountMinor) : "",
  );
  const requestKey = useRef(crypto.randomUUID());
  const [refund, setRefund] = useState<PublisherProduct["refundRule"]>(
    initial?.refundRule || "FULL_IF_UNMET",
  );
  const { message } = App.useApp();
  if (bootstrap.data_mode !== "prototype")
    return <Empty description="价格服务待接入，方案资料暂不可用" />;
  if (!product) return <Empty description="请先保存服务商品草稿，再配置价格" />;
  let price = "—";
  try {
    price = formatMinorUnits(parseYuan(amount)).replace(/\.00$/, "");
  } catch {
    /* The form shows validation feedback when saved. */
  }
  function save() {
    try {
      addPricePlan(
        {
          serviceId,
          amountMinor: parseYuan(amount),
          refundRule: refund,
          maxServiceSeconds: initial?.maxServiceSeconds || 300,
          validityDays: initial?.validityDays || 7,
          goal: initial?.goal || "生成符合约定的结果",
          verificationHours: initial?.verificationHours || 1,
        },
        requestKey.current,
      );
      void message.success("价格新版本预览已保存，旧方案继续保留");
    } catch (error) {
      void message.error((error as Error).message);
    }
  }
  return (
    <div className="publisher-pricing-page">
      <PageHeading title="价格方案" extra={<Status tone="gray">本地示例</Status>} />
      <div className="pricing-columns">
        <Panel title="历史方案" className="pricing-history">
          {plans.map((plan) => (
            <article key={plan.id}>
              <h2>
                <Status>v{plan.version}</Status>{" "}
                {formatMinorUnits(plan.amountMinor).replace(/\.00$/, "")}元/次
              </h2>
              <p>旧订单保持原方案</p>
            </article>
          ))}
          {!plans.length && <Empty description="暂无历史价格方案" />}
        </Panel>
        <Panel title="新版本设置" className="pricing-editor">
          <div className="pricing-field">
            <b>计费方式</b>
            <Input value="按次固定" disabled />
          </div>
          <div className="pricing-field">
            <b>服务费</b>
            <Input
              aria-label="服务费"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                requestKey.current = crypto.randomUUID();
              }}
              suffix="元"
              inputMode="decimal"
              maxLength={24}
            />
          </div>
          <div className="pricing-field">
            <b>一次完整执行 ⓘ</b>
            <span>
              含同次接续，最长 {(initial?.maxServiceSeconds || 300) / 60} 分钟
            </span>
          </div>
          <div className="pricing-field">
            <b>可启动有效期 ⓘ</b>
            <span>{initial?.validityDays || 7} 天</span>
          </div>
          <hr />
          <div className="pricing-field refund-options">
            <b>退款规则</b>
            <Radio.Group
              value={refund}
              onChange={(event) => {
                setRefund(event.target.value);
                requestKey.current = crypto.randomUUID();
              }}
            >
              <Radio value="NO_REFUND_IF_UNMET">
                按约交付但目标未达不退服务费
              </Radio>
              <Radio value="FULL_IF_UNMET">目标未达全退服务费</Radio>
            </Radio.Group>
          </div>
          <div className="pricing-field">
            <b>目标判定</b>
            <span>{initial?.goal || "生成符合约定的结果"}</span>
          </div>
          <div className="pricing-field">
            <b>目标核验截止 ⓘ</b>
            <span>执行结束后 {initial?.verificationHours || 1} 小时</span>
          </div>
          <div className="pricing-field">
            <b>用户启动前取消</b>
            <span>全退服务费</span>
          </div>
          <Notice>
            <SafetyCertificateFilled />
            <b>平台保障</b>　未执行或技术故障未交付全退。
          </Notice>
          <div className="pricing-public-preview">
            <h3>消费者购买前公示预览</h3>
            <div>
              <strong>
                {price}
                <small> 元/次</small>
              </strong>
              {[
                ["计费方式", "按次固定"],
                [
                  "执行说明",
                  `含同次接续，最长${(initial?.maxServiceSeconds || 300) / 60}分钟`,
                ],
                ["可启动有效期", `${initial?.validityDays || 7}天`],
                [
                  "退款规则",
                  refund === "FULL_IF_UNMET"
                    ? "目标未达全退服务费"
                    : "按约交付但目标未达不退",
                ],
                ["目标判定", initial?.goal || "生成符合约定的结果"],
                [
                  "目标核验截止",
                  `执行结束后${initial?.verificationHours || 1}小时`,
                ],
                ["启动前取消", "全退服务费"],
              ].map(([label, value]) => (
                <span key={label}>
                  <small>{label}</small>
                  <b>{value}</b>
                </span>
              ))}
            </div>
          </div>
          <Button type="primary" className="pricing-save" onClick={save}>
            保存新版本
          </Button>
        </Panel>
      </div>
    </div>
  );
}
