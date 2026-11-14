import { useState } from "react";
import { App, Button, Collapse, DatePicker, Empty, Input } from "antd";
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

const questions = [
  {
    key: "purchase",
    title: "如何按次购买？",
    group: "购买与付费",
    answer:
      "在脚本市场选择服务，核对价格、输入参数、交付目标和退款规则，支付后获得一次完整服务。",
    keywords: "购买 服务费 价格 支付",
  },
  {
    key: "ticket",
    title: "门票免费为何收取服务费？",
    group: "购买与付费",
    answer:
      "门票款由景区官方确定，脚本服务费由发布者设置。免费门票的预约服务仍可按次收费，购买前会分别展示。",
    keywords: "门票 免费 服务费 景点",
  },
  {
    key: "refund",
    title: "未达成目标怎么退款？",
    group: "退款售后",
    answer: "以购买前展示并固定的发布者规则为准。",
    keywords: "退款规则 未达 目标 费用",
  },
  {
    key: "resume",
    title: "一次服务接续会重复收费吗？",
    group: "运行与结果",
    answer:
      "同一次逻辑服务的技术重试和合法接续包含在本单内，不重复收费。再次使用已完成的服务需要购买新订单。",
    keywords: "接续 重复 收费 运行 结果",
  },
  {
    key: "publish",
    title: "如何发布脚本？",
    group: "发布与部署",
    answer:
      "进入脚本发布者工作区，上传脚本，定义动作和必填JSON Schema，完成构建与部署检查，再配置价格、交付目标和退款规则后上架。",
    keywords: "发布 脚本 部署 参数",
  },
  {
    key: "account",
    title: "如何保护我的账户和凭据？",
    group: "账号安全",
    answer:
      "凭据只向本人展示掩码，按固定版本绑定任务。可在账户设置管理会话和账号安全，在凭据管理更新或撤销凭据。",
    keywords: "账户 安全 密码 凭据",
  },
];

export function HelpPage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [expanded, setExpanded] = useState<string[]>(["refund"]);
  const { modal } = App.useApp();
  const rows = questions.filter(
    (item) =>
      (group ? item.group === group : item.key !== "account") &&
      `${item.title}${item.answer}${item.keywords}`.includes(query),
  );
  return (
    <div className="help-page">
      <PageHeading
        title="使用帮助"
        description="了解平台的购买、使用、退款与发布流程，快速上手通用脚本服务。"
      />
      <div className="public-resource-banner help-banner">
        <TileIcon name="code" color="gradient" />
        <div>
          <h2>按次使用通用脚本，解决数据处理与景点预约等需求</h2>
          <p>
            支持数据/文件工具与景点预约等多种场景。每单仅提供一次完整服务，同次接续不额外收费。
          </p>
        </div>
      </div>
      <div className="help-columns">
        <Panel title="帮助目录" className="help-directory">
          {[
            ["payment", "购买与付费"],
            ["play", "运行与结果"],
            ["refund", "退款售后"],
            ["box", "发布与部署"],
            ["shield", "账号安全"],
          ].map(([icon, title]) => (
            <Button
              type="text"
              className={group === title ? "selected" : ""}
              key={title}
              onClick={() =>
                setGroup((previous) => (previous === title ? "" : title))
              }
            >
              <TileIcon name={icon} />
              {title}
            </Button>
          ))}
        </Panel>
        <Panel className="help-questions">
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索帮助内容，如“退款规则”、“服务费”"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            allowClear
          />
          <h2>常见问题解答</h2>
          {rows.length ? (
            <Collapse
              activeKey={expanded}
              onChange={(keys) =>
                setExpanded(typeof keys === "string" ? [keys] : keys)
              }
              expandIconPlacement="end"
              items={rows.map((item) => ({
                key: item.key,
                label: (
                  <>
                    <span className="qa-letter">Q</span>
                    {item.title}
                  </>
                ),
                children: (
                  <div className="help-answer">
                    <span className="qa-letter">A</span>
                    {item.answer}
                  </div>
                ),
              }))}
            />
          ) : (
            <Empty description="未找到相关帮助" />
          )}
        </Panel>
        <aside>
          <Panel title="快速入门 · 三步使用" className="help-quickstart">
            {[
              [
                "选择脚本",
                "在脚本市场浏览并选择需要的脚本，如数据处理、文件工具或景点预约。",
              ],
              [
                "按次购买并执行",
                "确认服务说明、价格与退款规则，完成支付后按提示执行脚本。",
              ],
              [
                "获取目标结果",
                "等待脚本执行完成，在线查看或下载目标结果，本次服务即结束。",
              ],
            ].map(([title, description], index) => (
              <div key={title}>
                <span>{index + 1}</span>
                <section>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </section>
              </div>
            ))}
          </Panel>
          <Panel
            title={
              <>
                <TileIcon name="help" />
                联系支持
              </>
            }
            className="help-contact"
          >
            <p>使用中遇到问题？可联系平台支持团队获取帮助。</p>
            <Button
              type="primary"
              onClick={() =>
                modal.info({
                  title: "联系平台支持",
                  content:
                    "在线支持渠道尚未配置。可在退款与售后查看服务订单的处理进度。",
                  okText: "了解",
                })
              }
            >
              联系在线支持
            </Button>
          </Panel>
        </aside>
      </div>
    </div>
  );
}
