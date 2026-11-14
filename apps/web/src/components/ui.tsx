import type { ReactNode } from "react";
import { Button, Tag } from "antd";
import { RightOutlined, InfoCircleOutlined } from "@ant-design/icons";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

export function Panel({
  title,
  children,
  extra,
  className = "",
}: {
  title?: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
          {extra}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  );
}
export function PageHeading({
  title,
  description,
  extra,
}: {
  title: string;
  description?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {extra}
    </div>
  );
}
export function Status({
  children,
  tone = "blue",
}: {
  children: ReactNode;
  tone?: "green" | "blue" | "orange" | "red" | "purple" | "gray";
}) {
  return <Tag className={`status status-${tone}`}>{children}</Tag>;
}
export function TileIcon({
  name,
  color = "blue",
}: {
  name: string;
  color?: string;
}) {
  return (
    <span className={`tile-icon tile-${color}`}>
      <Icon name={name} />
    </span>
  );
}
export function More({
  to,
  children = "查看全部",
}: {
  to: string;
  children?: ReactNode;
}) {
  return (
    <Link className="more" to={to}>
      {children} <RightOutlined />
    </Link>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <InfoCircleOutlined />
      {children}
    </div>
  );
}
export function UsageBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`usage-banner ${compact ? "compact" : ""}`}>
      {compact && <TileIcon name="database" color="gradient" />}
      <div>
        <h2>{compact ? "通用脚本按次使用" : "按次使用 · 一次完整服务"}</h2>
        <p>
          每单仅提供一次完整服务，同次接续不额外收费。
          {compact ? (
            "门票0元不等于脚本服务免费。未达目标的退款规则由发布者选择，购买前展示并在成交后固定生效。"
          ) : (
            <>
              <br />
              如需再次使用相同服务，请重新购买新的订单。
            </>
          )}
        </p>
      </div>
      {!compact && (
        <div className="banner-options">
          <span>
            <TileIcon name="rocket" />{" "}
            <span>
              <b>数据 / 文件工具</b>
              <small>数据清洗、格式转换、公开数据整理等</small>
            </span>
          </span>
          <span>
            <TileIcon name="calendar" color="purple" />
            <span>
              <b>景点预约</b>
              <small>按指定时段完成预约并返回结果</small>
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
export function OutlineButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <Button className="outline-button" onClick={onClick}>
      {children}
    </Button>
  );
}
