import { Alert, Button, Dropdown, Empty, Skeleton } from "antd";
import {
  ArrowRightOutlined,
  CheckOutlined,
  MoreOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Status, TileIcon } from "../components/ui";
import { useWorkspace } from "../context";
import { currency, useServices } from "./Market";

const categories = [
  { label: "全部", icon: "market", value: "全部" },
  { label: "城市与景点", icon: "travel", value: "旅行预约" },
  { label: "数据处理", icon: "database", value: "数据处理" },
  { label: "文件工具", icon: "file", value: "文件工具" },
  { label: "信息整理", icon: "info", value: "信息整理" },
];
const serviceOrder: Record<string, number> = {
  table: 0,
  file: 1,
  database: 2,
  calendar: 3,
};
const workflow = [
  { title: "选择服务", text: "浏览并查看服务详情、价格与退款规则。" },
  { title: "确认规则并支付", text: "确认服务内容与退款政策，完成支付。" },
  {
    title: "配置信息与领取结果",
    text: "在订单中填写必要信息，执行后查看服务结果。",
  },
];

export function PublicHomePage() {
  const { data = [], isPending, error } = useServices();
  const { bootstrap } = useWorkspace();
  const services = [...data]
    .sort(
      (a, b) =>
        (serviceOrder[a.delivery_policy.icon] ?? 4) -
        (serviceOrder[b.delivery_policy.icon] ?? 4),
    )
    .slice(0, 4);
  return (
    <div className="public-home-layout">
      <div className="public-home-main">
        <section className="home-service-banner">
          <div className="home-service-intro">
            <h1>把重复工作交给脚本</h1>
            <p>发现服务，按次购买，获取结果。</p>
            <div>
              <Link to="/market">
                <Button type="primary">
                  浏览脚本 <ArrowRightOutlined />
                </Button>
              </Link>
              <Link to="/publisher">
                <Button>成为发布者</Button>
              </Link>
            </div>
          </div>
          <div className="home-service-benefits">
            {[
              ["database", "按次付费", "按完整服务计费"],
              ["rocket", "部署就绪", "开箱即用，直接使用"],
              ["shield", "规则透明", "使用规则与退款政策购买前可查看"],
            ].map(([icon, title, text]) => (
              <div key={title}>
                <Icon name={icon} />
                <section>
                  <h3>{title}</h3>
                  <p>{text}</p>
                </section>
              </div>
            ))}
          </div>
          <div className="hero-document" aria-hidden="true">
            <span>&lt;/&gt;</span>
          </div>
        </section>

        <section className="home-recommendations">
          <div className="home-section-heading">
            <h2>脚本服务推荐</h2>
            <Link to="/market">查看更多服务 ›</Link>
          </div>
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
            <div className="home-recommendation-grid">
              {services.map((service) => (
                <article key={service.id} className="home-recommendation">
                  <div className="home-recommendation-title">
                    <TileIcon
                      name={service.delivery_policy.icon}
                      color={
                        service.delivery_policy.icon === "table"
                          ? "green"
                          : service.delivery_policy.icon === "calendar"
                            ? "orange"
                            : service.delivery_policy.icon === "database"
                              ? "blue"
                              : "purple"
                      }
                    />
                    <div>
                      <h3>{service.title}</h3>
                      <Status>
                        {service.scene_key === "travel"
                          ? "城市与景点"
                          : service.category}
                      </Status>
                      {bootstrap.data_mode === "prototype" && (
                        <Status tone="purple">示例数据</Status>
                      )}
                    </div>
                  </div>
                  <p>{service.description}</p>
                  <footer>
                    <span className="home-recommendation-price">
                      <b>¥{currency(service.amount_minor)}</b> /次
                    </span>
                    <Status tone="green">
                      <CheckOutlined /> 可用
                    </Status>
                    <Link
                      to={
                        service.scene_key === "travel"
                          ? `/travel/attractions/${service.id}`
                          : `/services/${service.id}`
                      }
                    >
                      <Button size="small">查看详情</Button>
                    </Link>
                  </footer>
                </article>
              ))}
            </div>
          ) : (
            <Empty description="暂无可用服务" />
          )}
        </section>

        <div className="home-discovery-row">
          <section className="home-category-navigation">
            <h2>分类与业务场景</h2>
            <div>
              {categories.map((category) => (
                <Link
                  key={category.value}
                  className={category.value === "全部" ? "active" : ""}
                  to={`/market?category=${encodeURIComponent(category.value)}`}
                >
                  <Icon name={category.icon} />
                  <span>{category.label}</span>
                </Link>
              ))}
              <Dropdown
                trigger={["click"]}
                menu={{
                  items: [
                    {
                      key: "all",
                      label: <Link to="/market">浏览全部服务</Link>,
                    },
                    {
                      key: "travel",
                      label: <Link to="/travel">城市与景点</Link>,
                    },
                  ],
                }}
              >
                <Button aria-label="更多分类">
                  <MoreOutlined />
                  <span>更多分类⌄</span>
                </Button>
              </Dropdown>
            </div>
          </section>
          <section className="home-workflow">
            <h3>
              <Icon name="link" /> 使用流程 · 三步完成服务
            </h3>
            <ol>
              {workflow.map((step, index) => (
                <li key={step.title}>
                  <b>{index + 1}</b>
                  <div>
                    <h4>{step.title}</h4>
                    <p>{step.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <section className="home-category-details" aria-label="服务分类介绍">
          {[
            {
              icon: "database",
              title: "数据处理",
              description: "对表类数据进行清洗与整理，提升可用性。",
              tags: ["表格清洗", "格式整理"],
            },
            {
              icon: "file",
              title: "文件工具",
              description: "批量处理各类文件，提高效率。",
              tags: ["批量转换", "命名整理"],
            },
            {
              icon: "info",
              title: "信息整理",
              description: "收集、提取并整理信息，生成结构化结果。",
              tags: ["生成结构化结果"],
            },
          ].map((category) => (
            <Link
              key={category.title}
              to={`/market?category=${encodeURIComponent(category.title)}`}
            >
              <TileIcon
                name={category.icon}
                color={category.icon === "file" ? "purple" : "blue"}
              />
              <div>
                <h2>{category.title}</h2>
                <p>{category.description}</p>
                <div>
                  {category.tags.map((tag) => (
                    <Status key={tag} tone="purple">
                      {tag}
                    </Status>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </section>
      </div>

      <aside className="home-public-guidance" aria-label="服务使用说明">
        <section className="home-fee-note">
          <div>
            <h3>
              <Icon name="info" /> 门票通常免费，支付的是脚本服务费
            </h3>
            <p>
              例如景点预约，景区门票通常为免费或零价。您支付的是脚本的服务费，用于完成预约等操作。
            </p>
          </div>
        </section>
        <section className="home-payment-guide">
          <h2>
            <Icon name="file" /> 付费使用说明
          </h2>
          <ol>
            {[
              [
                "按次计费",
                "按完成一次完整服务计费，包含后续必要的跟进与结果交付。",
              ],
              [
                "退款规则",
                "由发布者设定并在购买前展示，若无结果是否退款一目了然，且在订单中锁定。",
              ],
              [
                "使用方式",
                "购买后在平台内配置必要信息并执行，直接在订单中查看结果，无需安装或部署。",
              ],
            ].map(([title, text], index) => (
              <li key={title}>
                <b>{index + 1}</b>
                <p>
                  <strong>{title}</strong> · {text}
                </p>
              </li>
            ))}
          </ol>
        </section>
        <section className="home-publish-guide">
          <h2>
            <Icon name="upload" /> 上传发布入口
          </h2>
          <p>将您开发的实用脚本发布为可售服务，让更多用户高效使用。</p>
          <Link to="/publisher">
            <Button type="primary" block>
              上传并发布脚本 <ArrowRightOutlined />
            </Button>
          </Link>
          <ul>
            {[
              "自定义服务说明、价格与无结果退款政策",
              "平台部署运行，用户按次购买使用",
              "查看销售数据与使用记录",
            ].map((text) => (
              <li key={text}>
                <CheckOutlined /> {text}
              </li>
            ))}
          </ul>
        </section>
      </aside>
    </div>
  );
}
