import { Alert, Button, Empty, Skeleton } from "antd";
import {
  BankFilled,
  BankOutlined,
  CheckOutlined,
  InfoCircleOutlined,
} from "@ant-design/icons";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useWorkspace } from "../context";
import { ApiError } from "../api";
import { Icon } from "../components/Icon";
import { Status } from "../components/ui";
import { ServicePurchaseButton } from "../components/ServicePurchaseButton";
import { readTravelContext, usePublicAttraction } from "../lib/public-travel";
import {
  marketReturnPath,
  serviceAvailable,
  serviceDuration,
} from "../lib/service-display";
import { currency, useServices } from "./Market";

export function TravelServicePage() {
  const { bootstrap, role } = useWorkspace();
  const { id } = useParams();
  const [params] = useSearchParams();
  const { data = [], isPending, error, refetch } = useServices();
  const prototype = bootstrap.data_mode === "prototype";
  const guest = role === "GUEST";
  const selection = readTravelContext(params, prototype);
  const publicAttraction = usePublicAttraction(
    params.get("attraction") || undefined,
    selection.date,
    !prototype && !selection.invalid,
  );
  const service =
    data.find((item) => item.id === id && item.scene_key === "travel") ||
    (id === "demo" && prototype
      ? data.find((item) => item.scene_key === "travel")
      : undefined);
  const { date, slot, partySize, context, invalid } = selection;
  const linkedService = publicAttraction.data?.services.find(
    (item) => item.id === service?.id,
  );
  const attraction = prototype
    ? selection.attraction
    : publicAttraction.data
      ? {
          id: publicAttraction.data.id,
          city: publicAttraction.data.city_name,
          title: publicAttraction.data.name,
          ticketMinor: publicAttraction.data.ticket_price_minor,
          open: linkedService?.availability?.can_purchase === true,
        }
      : undefined;
  if (isPending) return <Skeleton active />;
  if (error)
    return (
      <Alert
        type="error"
        title="服务暂时无法加载"
        description={error.message}
        showIcon
        action={<Button onClick={() => void refetch()}>重试</Button>}
      />
    );
  if (!service) return <Empty description="服务不存在或已失效" />;
  if (invalid)
    return <Empty description="景点或预约条件无效，请返回城市与景点重新选择" />;
  if (!prototype && params.get("attraction")) {
    if (publicAttraction.isPending) return <Skeleton active />;
    if (publicAttraction.isError) {
      if (
        publicAttraction.error instanceof ApiError &&
        publicAttraction.error.status === 404
      )
        return <Empty description="景点不存在或暂未开放" />;
      return (
        <Alert
          type="error"
          title="景点详情加载失败"
          action={
            <Button onClick={() => void publicAttraction.refetch()}>
              重试景点详情
            </Button>
          }
        />
      );
    }
    if (!linkedService) return <Empty description="该景点未关联此服务" />;
  }
  const back = params.get("returnTo");
  const marketBack = marketReturnPath(back);
  const backPath =
    marketBack ||
    (back === "/travel" || back?.startsWith("/travel?") ? back : "/travel");
  const available =
    serviceAvailable(service) && (!attraction || attraction.open);
  const name = attraction
    ? `${attraction.city} · ${attraction.title}预约${!guest && prototype ? "（示例）" : ""}`
    : service.title;
  const ticket = attraction
    ? currency(attraction.ticketMinor)
    : "以官方价格为准";
  const window = `单次执行最长${serviceDuration(service.max_service_seconds)}`;
  const verification = `执行结束后最多核验${serviceDuration(service.resolution_seconds)}`;
  const rules = [
    {
      title: "预约规则",
      icon: "reconciliation",
      items: [
        "每单提供一次完整预约服务。",
        "同次必要接续不额外收费。",
        "如需再次预约，请重新购买新的服务订单。",
      ],
    },
    {
      title: "服务范围",
      icon: guest ? "stack" : "cube",
      items: [
        service.delivery_policy.summary,
        "门票费用与脚本服务费分别展示。",
        "按发布者的参数要求提交预约信息。",
      ],
    },
    {
      title: "退款规则",
      icon: guest ? "shield" : "money",
      items: [
        "未执行可全额退服务费。",
        service.refund_policy.summary,
        "退款规则在购买前展示，并按成交合同执行。",
      ],
    },
    {
      title: "目标判定",
      icon: guest ? "flag" : "verified-target",
      items: [
        "以官方预约结果与核验信息为依据。",
        "核验中的订单会继续展示当前进度。",
        "超时仍无法确认的结果进入后续处理。",
      ],
    },
  ];
  const facts = [
    { label: "预约日期", value: date || "购买时配置", icon: "calendar" },
    {
      label: guest ? "场次" : "预约场次",
      value: slot || "购买时配置",
      icon: "clock",
    },
    {
      label: "出行人数",
      value: partySize ? `${partySize}人` : "购买时配置",
      icon: "user",
    },
  ];
  const notice = [
    { key: "refund", text: service.refund_policy.summary, icon: "shield" },
    { key: "verification", text: verification, icon: "clock" },
    { key: "window", text: window, icon: "hourglass" },
    { key: "scope", text: "包含一次完整服务及同次必要接续", icon: "check" },
    { key: "availability", text: "可售状态以下单时校验为准", icon: "info" },
  ];
  const ticketPrice = {
    key: "ticket",
    label: guest ? "票款" : "票款（景点官方收取）",
    value: attraction ? `¥${ticket}` : ticket,
  };
  const scriptPrice = {
    key: "service",
    label: "脚本服务费",
    value: (
      <>
        ¥{currency(service.amount_minor)}
        <small>/次</small>
      </>
    ),
  };
  const prices = guest
    ? [ticketPrice, scriptPrice]
    : [scriptPrice, ticketPrice];
  return (
    <div
      className={`travel-service-page ${guest ? "guest-travel-service" : "member-travel-service"}`}
    >
      <div className="travel-service-heading">
        <div className="retail-breadcrumb">
          <Link to={backPath}>
            {guest && !marketBack && <Icon name="home" />}
            {marketBack ? "脚本市场" : "城市与景点"}
          </Link>
          <span>/</span>
          <span>景点代抢服务详情</span>
        </div>
        <h1>景点代抢服务详情</h1>
      </div>
      <div className="travel-service-columns">
        <section className="travel-service-main">
          <header className="travel-service-banner">
            <span className="travel-museum-icon">
              {guest ? <BankFilled /> : <BankOutlined />}
            </span>
            <div>
              <h2>{name}</h2>
              {guest && <Status>景点预约</Status>}
              <p>
                {attraction
                  ? "通过脚本服务按预约条件提交并核验结果，具体交付范围以发布版本为准。"
                  : service.description}
              </p>
              {!guest && (
                <div className="travel-service-tags">
                  <Status>景点预约</Status>
                  <Status>自动化脚本</Status>
                  <Status tone="purple">个人可用</Status>
                </div>
              )}
            </div>
            {guest && (
              <div className="travel-context-facts">
                {facts.map((fact) => (
                  <span key={fact.label}>
                    <Icon name={fact.icon} />
                    <span className="travel-fact-label">{fact.label}：</span>
                    <b>{fact.value}</b>
                  </span>
                ))}
              </div>
            )}
          </header>
          {!guest && (
            <section className="travel-context-facts">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <span>
                    <Icon name={fact.icon} />
                    {fact.label}
                  </span>
                  <b>{fact.value}</b>
                </div>
              ))}
              <div>
                <span>
                  <Icon name="ticket-stub" />
                  票款
                </span>
                <b className="travel-ticket-price">
                  {attraction ? `¥${ticket}` : ticket}
                </b>
              </div>
              <div>
                <span>
                  <Icon name="coins" />
                  脚本服务费
                </span>
                <b className="travel-script-price">
                  ¥{currency(service.amount_minor)}
                  <small>/次</small>
                </b>
              </div>
            </section>
          )}
          <div className="travel-rule-grid">
            {rules.map((rule) => (
              <section className="travel-rule-card" key={rule.title}>
                <h2>
                  <Icon name={rule.icon} />
                  {rule.title}
                </h2>
                <ul>
                  {rule.items.map((item) => (
                    <li key={item}>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </section>
        <aside className="travel-purchase-card">
          <h2>{guest ? "购买服务" : "预约此服务"}</h2>
          <div className="travel-purchase-body">
            <div className="travel-purchase-prices">
              {prices.map((price) => (
                <div key={price.key} className={`travel-price-${price.key}`}>
                  <span>{price.label}</span>
                  <strong>
                    {price.value}
                    {guest && price.key === "service" && <Status>独立</Status>}
                  </strong>
                </div>
              ))}
            </div>
            <section className="travel-purchase-notice">
              <h3>
                <InfoCircleOutlined />
                购买须知
              </h3>
              <ul>
                {notice.map((item) => (
                  <li key={item.key}>
                    {guest ? <Icon name={item.icon} /> : <CheckOutlined />}
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
              {prototype && (
                <p className="travel-prototype-note">
                  示例接入，预约条件供展示。参数按发布者Schema填写。
                </p>
              )}
            </section>
            {!available && (
              <Alert
                type="warning"
                title={
                  attraction?.open === false
                    ? "景点当前暂未开放接入"
                    : service.availability?.reason || "服务当前不可购买"
                }
                showIcon
              />
            )}
            <ServicePurchaseButton
              service={service}
              travel
              disabled={!available}
              context={context}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}
