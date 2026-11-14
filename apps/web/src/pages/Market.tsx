import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button, Empty, Input, Select, Skeleton } from "antd";
import { CheckOutlined, SearchOutlined } from "@ant-design/icons";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import type { Service } from "../types";
import { PageHeading, Status, TileIcon } from "../components/ui";
import { Icon } from "../components/Icon";
import {
  serviceAvailable,
  serviceDate,
  servicePath,
} from "../lib/service-display";
import { useWorkspace } from "../context";
import { formatMinorUnits } from "../lib/money";

export function useServices() {
  return useQuery({
    queryKey: ["public", "services"],
    queryFn: () => api<Service[]>("/services"),
  });
}
export function currency(amount: string) {
  return formatMinorUnits(amount);
}

export function ServiceCard({
  service,
  compact = false,
}: {
  service: Service;
  compact?: boolean;
}) {
  const available = serviceAvailable(service);
  if (compact)
    return (
      <article className="service-card consumer-market-card">
        <div className="consumer-market-card-title">
          <TileIcon name={service.delivery_policy.icon} />
          <div>
            <h2>{service.title}</h2>
            <p>{service.description}</p>
          </div>
          <Status>{service.category}</Status>
        </div>
        <div className="consumer-market-price">
          {currency(service.amount_minor).replace(/\.00$/, "")}
          <small>元/次</small>
          {!available && <Status tone="gray">当前不可用</Status>}
        </div>
        <div className="consumer-market-card-meta">
          <span>
            <Icon name="user" />
            发布者　{service.delivery_policy.publisher_name}
          </span>
          <span>
            <Icon name="clock" />
            最近更新　{serviceDate(service.updated_at)}
          </span>
        </div>
        <p className="consumer-market-delivery">
          <Status tone="green">交付标准</Status>
          {service.delivery_policy.summary}
        </p>
        <p className="consumer-market-refund">
          <Status tone="purple">退款规则</Status>
          {service.refund_policy.summary}
        </p>
        <Link to={servicePath(service)}>
          <Button block>查看详情</Button>
        </Link>
      </article>
    );
  return (
    <article className="service-card">
      <div className="service-card-top">
        <TileIcon name={service.delivery_policy.icon} color="gradient" />
        <div>
          <h2>
            {service.title} <Status>{service.category}</Status>
          </h2>
          <p>{service.description}</p>
        </div>
        <Status tone={available ? "green" : "gray"}>
          {available && <CheckOutlined />} {available ? "可用" : "暂不可用"}
        </Status>
      </div>
      <div className="service-card-metrics">
        <div>
          <small>按次价格</small>
          <p>
            <strong>{currency(service.amount_minor)}</strong> 元/次
          </p>
        </div>
        <div>
          <small>发布者</small>
          <b>{service.delivery_policy.publisher_name}</b>
        </div>
        <div>
          <small>部署状态</small>
          <b>
            <i className={`dot ${available ? "green" : "gray"}`} />
            {available ? "已部署" : "暂不可用"}
          </b>
        </div>
      </div>
      <div className="service-card-delivery">
        <p>
          <Status>服务交付</Status>
          {service.delivery_policy.summary}
        </p>
        <p>
          <Status tone="purple">退款规则</Status>
          {service.refund_policy.summary}
        </p>
        <Link to={servicePath(service)}>
          <Button type="primary">查看详情</Button>
        </Link>
      </div>
    </article>
  );
}

export function MarketPage() {
  const { data = [], isPending, error } = useServices();
  const { role } = useWorkspace();
  const consumer = role !== "GUEST";
  const [params] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") || "");
  const [category, setCategory] = useState(params.get("category") || "全部");
  const [sort, setSort] = useState("recent");
  const categories = [
    ...new Set([
      "全部",
      "数据处理",
      "文件工具",
      "信息整理",
      "旅行预约",
      ...data.map((service) => service.category),
    ]),
  ];
  useEffect(() => {
    setQuery(params.get("q") || "");
    setCategory(params.get("category") || "全部");
  }, [params]);
  const services = useMemo(
    () =>
      data
        .filter(
          (service) =>
            (category === "全部" || service.category === category) &&
            `${service.title}${service.description}`
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
        )
        .sort((a, b) => {
          if (sort === "price") {
            const left = BigInt(a.amount_minor);
            const right = BigInt(b.amount_minor);
            return left === right ? 0 : left < right ? -1 : 1;
          }
          const newestFirst =
            Date.parse(b.updated_at || "1970-01-01") -
            Date.parse(a.updated_at || "1970-01-01");
          if (Number.isFinite(newestFirst) && newestFirst !== 0)
            return newestFirst;
          const ranks: Record<string, number> = {
            table: 0,
            file: 1,
            database: 2,
            calendar: 3,
          };
          return (
            (ranks[a.delivery_policy.icon] ?? 4) -
            (ranks[b.delivery_policy.icon] ?? 4)
          );
        }),
    [data, query, category, sort],
  );
  return (
    <div
      className={`market-page ${consumer ? "consumer-market" : "guest-market"}`}
    >
      <PageHeading
        title="脚本市场"
        description={
          consumer
            ? "上传并使用各类实用脚本，覆盖数据处理、文件工具、信息整理与景点预约等场景。按次付费，完成一次完整服务。"
            : "按用途查找并使用已上架的脚本服务，覆盖数据处理、文件工具、信息整理与旅行预约等场景。"
        }
      />
      {consumer && (
        <section className="consumer-market-banner">
          <div>
            <h2>用脚本高效处理数据、文件与出行事务</h2>
            <p>
              按次购买、一次交付，执行与结果清晰可见，满足学习、工作与出行等多种需求。
            </p>
          </div>
          <ul>
            {[
              "每单仅一次完整服务，同次接续不额外收费",
              "门票与脚本服务费分别展示",
              "未达目标的退款规则在购买前展示，成交后固定",
            ].map((text) => (
              <li key={text}>
                <CheckOutlined />
                {text}
              </li>
            ))}
          </ul>
          <div className="market-script-art" aria-hidden="true">
            &lt;/&gt;
          </div>
        </section>
      )}
      <div className="market-toolbar">
        <Input
          size="large"
          prefix={<SearchOutlined />}
          placeholder="搜索用途或服务，如：表格清洗、文件批量处理"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
        <span>分类</span>
        <div className="category-buttons">
          {categories.map((item) => (
            <Button
              key={item}
              type={category === item ? "primary" : "default"}
              onClick={() => setCategory(item)}
            >
              {item}
            </Button>
          ))}
        </div>
        <div className="sort-control">
          <span>排序</span>
          <Select
            aria-label="服务排序"
            value={sort}
            onChange={setSort}
            options={[
              { value: "recent", label: "最近更新" },
              { value: "price", label: "价格从低到高" },
            ]}
          />
        </div>
      </div>
      {!consumer && <p className="result-count">共 {services.length} 个服务</p>}
      {error ? (
        <Alert
          type="error"
          title="服务暂时无法加载"
          description={error.message}
          showIcon
        />
      ) : isPending ? (
        <Skeleton active />
      ) : services.length ? (
        <div className="service-grid">
          {services.map((service) => (
            <ServiceCard
              key={service.id}
              service={service}
              compact={consumer}
            />
          ))}
        </div>
      ) : (
        <Empty description="没有匹配的服务" />
      )}
    </div>
  );
}
