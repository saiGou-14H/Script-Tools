import { useState } from "react";
import { App, Button, DatePicker, Empty, Input } from "antd";
import {
  CreditCardOutlined,
  FlagOutlined,
  PlayCircleOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import { useWorkspace } from "../context";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { currency, useServices } from "./Market";
import { attractionFixtures } from "../lib/public-travel";

export function AttractionsPage() {
  const { bootstrap } = useWorkspace();
  const { data: services = [] } = useServices();
  const [city, setCity] = useState("全部");
  const [query, setQuery] = useState("");
  const [date, setDate] = useState<dayjs.Dayjs | null>(dayjs("2026-11-13"));
  const rows =
    bootstrap.data_mode === "prototype"
      ? attractionFixtures.filter(
          (item) =>
            (city === "全部" || item.city === city) &&
            `${item.city}${item.title}`.includes(query),
        )
      : [];
  const travelService = services.find((item) => item.scene_key === "travel");
  return (
    <div className="attractions-page">
      <PageHeading
        title="城市与景点"
        description="提供数据/文件处理工具与景点预约脚本的按次使用服务。每单只有一次完整服务，同次接续不额外收费。门票0元不等于脚本服务免费。未达目标的退款规则由发布者选择，购买前展示，成交后固定。"
      />
      <div className="public-resource-banner">
        <h2>脚本服务 · 数据/文件工具 · 景点预约</h2>
        <p>按次付费使用，流程清晰，规则透明</p>
      </div>
      <div className="attraction-filters">
        <b>选择城市</b>
        <div>
          {["全部", "北京", "杭州", "苏州"].map((value) => (
            <Button
              key={value}
              aria-label={value}
              type={city === value ? "primary" : "default"}
              onClick={() => setCity(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        <span className="filter-divider" />
        <b>选择日期</b>
        <DatePicker
          value={date}
          onChange={setDate}
          allowClear={false}
          aria-label="预约日期"
        />
        <span className="filter-divider" />
        <Input
          prefix={<SearchOutlined />}
          placeholder="搜索景点名称"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
      </div>
      <Notice>提示　仅展示示例接入状态，开放以真实渠道验证为准。</Notice>
      <div className="attraction-grid">
        {rows.map((item) => (
          <Panel key={item.id}>
            <div className="attraction-card-heading">
              <h2>
                {item.city} · {item.title}
              </h2>
              <Status tone={item.open ? "green" : "gray"}>
                {item.open ? "已接入" : "暂未开放"}
              </Status>
            </div>
            <p>{item.description}</p>
            <div className="attraction-fees">
              <div>
                <span>门票</span>
                <strong>¥0</strong>
              </div>
              <div>
                <span>脚本服务费</span>
                <strong>
                  {travelService
                    ? `¥${currency(travelService.amount_minor)}/次`
                    : "待配置"}
                </strong>
              </div>
            </div>
            <div className="attraction-rules">
              <p>
                <CreditCardOutlined />
                <b>支付</b>　
                {item.open && travelService
                  ? `按次付费，¥${currency(travelService.amount_minor)}/次`
                  : "暂不支持购买"}
              </p>
              <p>
                <PlayCircleOutlined />
                <b>执行</b>　
                {item.open ? "由脚本自动完成预约流程" : "暂未开放，无法执行"}
              </p>
              <p>
                <FlagOutlined />
                <b>目标结果</b>　
                {item.open ? "获取预约成功信息" : "暂未开放服务"}
              </p>
            </div>
            {item.open && (
              <Link
                to={
                  travelService
                    ? `/travel/attractions/${travelService.id}?attraction=${item.id}&date=${date?.format("YYYY-MM-DD") || ""}`
                    : "/market"
                }
              >
                <Button type="primary" block>
                  查看服务
                </Button>
              </Link>
            )}
          </Panel>
        ))}
      </div>
      {!rows.length && <Empty description="暂无匹配的景点" />}
    </div>
  );
}

export { HelpPage } from "./Help";
