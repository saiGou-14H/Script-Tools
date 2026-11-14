import { Button, Dropdown, Empty } from "antd";
import {
  CalendarOutlined,
  EllipsisOutlined,
  SettingOutlined,
  UnorderedListOutlined,
  ShoppingCartOutlined,
} from "@ant-design/icons";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Status, TileIcon } from "../components/ui";
import { useServices } from "./Market";

import { purchaseFixtures } from "../lib/consumer-preview";

export function PurchasedServicesPage() {
  const { bootstrap } = useWorkspace();
  const { data: services = [] } = useServices();
  const [params, setParams] = useSearchParams();
  const filters: Record<string, string> = {
    unused: "待使用",
    in_use: "使用中",
    used: "已使用",
    expired: "已到期",
  };
  const tab = filters[params.get("status") || ""] || "全部";
  function setTab(value: string) {
    const status = Object.keys(filters).find((key) => filters[key] === value);
    setParams(status ? { status } : {});
  }
  const navigate = useNavigate();
  const allPurchases =
    bootstrap.data_mode === "prototype" ? purchaseFixtures : [];
  const data = allPurchases.filter(
    (item) => tab === "全部" || item.category === tab,
  );
  function perform(item: (typeof purchaseFixtures)[number]) {
    if (item.id === "clean") navigate(`/me/services/${item.id}/use`);
    else if (item.taskId) navigate(`/me/tasks/${item.taskId}`);
    else {
      const service = services.find(
        (item) => item.input_schema_digest === "schema-file",
      );
      navigate(service ? `/checkout?service=${service.id}` : "/market");
    }
  }
  return (
    <div className="purchased-page">
      <PageHeading
        title="已购服务"
        description="您已购买的脚本服务与相关执行权益，可在此查看使用状态、有效期限并进行配置或继续使用。"
        extra={
          <Status tone="gray">
            {bootstrap.data_mode === "prototype"
              ? "本地示例"
              : "权益服务待接入"}
          </Status>
        }
      />
      {bootstrap.data_mode !== "prototype" && (
        <Notice>权益服务待接入，使用次数、有效期和服务状态暂不可用。</Notice>
      )}
      <div className="purchased-banner">
        <TileIcon name="layers" color="gradient" />
        <h2>通用脚本服务使用说明</h2>
        <span>✓ 每单只有一次完整服务，同次接续不额外收费。</span>
        <span>✓ 门票0元不等于脚本服务免费。</span>
        <span>✓ 未达目标的退款规则由发布者选择，购买前展示，成交后固定。</span>
      </div>
      <div className="purchased-tabs">
        <div className="pill-tabs">
          {["全部", "待使用", "使用中", "已使用", "已到期"].map((item) => (
            <Button
              key={item}
              type={tab === item ? "primary" : "default"}
              onClick={() => setTab(item)}
            >
              {item}（
              {item === "全部"
                ? allPurchases.length
                : allPurchases.filter((purchase) => purchase.category === item)
                    .length}
              ）
            </Button>
          ))}
        </div>
        <span>
          <CalendarOutlined /> 示例日期 2026-11-13
        </span>
      </div>
      {data.length ? (
        <div className="purchased-grid">
          {data.map((item) => (
            <article
              className={`purchased-card purchase-${item.id}`}
              key={item.id}
            >
              <div className="purchased-card-top">
                <TileIcon
                  name={item.icon}
                  color={
                    item.icon === "travel"
                      ? "purple"
                      : item.id === "files"
                        ? "green"
                        : item.id === "data"
                          ? "gray"
                          : "blue"
                  }
                />
                <div>
                  <h2>
                    {item.title} <Status tone={item.tone}>{item.status}</Status>
                  </h2>
                  <p>{item.description}</p>
                </div>
                <Dropdown
                  trigger={["click"]}
                  menu={{
                    items: [
                      {
                        key: "order",
                        label: item.orderId ? "查看订单" : "订单资料待载入",
                        disabled: !item.orderId,
                      },
                      {
                        key: "refund",
                        label: "取消并申请退款",
                        disabled: item.category === "已使用" || !item.orderId,
                      },
                    ],
                    onClick: ({ key }) =>
                      navigate(
                        key === "order"
                          ? `/me/orders/${item.orderId}`
                          : `/me/refunds?order_id=${item.orderId}`,
                      ),
                  }}
                >
                  <Button
                    type="text"
                    aria-label={`${item.title}更多操作`}
                    icon={<EllipsisOutlined />}
                  />
                </Dropdown>
              </div>
              <div className="purchased-card-bottom">
                <div className="purchase-facts">
                  {item.columns.map(([label, value]) => (
                    <div key={label}>
                      <small>{label}</small>
                      <b>{value}</b>
                    </div>
                  ))}
                </div>
                {item.action && (
                  <Button
                    type={item.id === "files" ? "default" : "primary"}
                    icon={
                      item.id === "files" ? (
                        <ShoppingCartOutlined aria-hidden />
                      ) : item.id === "booking" ? (
                        <UnorderedListOutlined aria-hidden />
                      ) : (
                        <SettingOutlined aria-hidden />
                      )
                    }
                    onClick={() => perform(item)}
                  >
                    {item.action}
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty description="暂无符合条件的已购服务" />
      )}
    </div>
  );
}
