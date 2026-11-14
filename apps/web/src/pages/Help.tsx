import { useEffect, useState, type FormEvent } from "react";
import { Alert, Button, Collapse, Empty, Input, Modal, Skeleton } from "antd";
import { DownOutlined, SearchOutlined } from "@ant-design/icons";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import { Icon } from "../components/Icon";
import { PageHeading, Panel, TileIcon } from "../components/ui";
import { useWorkspace } from "../context";

interface HelpContent {
  content_version: string;
  groups: { id: string; title: string; icon: string }[];
  questions: {
    id: string;
    title: string;
    group: string;
    answer: string;
    keywords: string;
    featured: boolean;
  }[];
  support: { status: "UNCONFIGURED"; message: string };
}

const descriptions = {
  GUEST: "了解平台的购买、使用、退款与发布流程，快速上手通用脚本服务。",
  USER: "了解平台使用方法、常见问题与注意事项，快速上手并高效使用。",
  PUBLISHER: "了解平台使用方法、购买规则、发布与部署、退款售后等常见问题。",
  ADMIN: "了解平台的购买、使用、退款、发布与账号安全等常见问题，快速上手。",
};
const quickStarts = {
  GUEST: [
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
  ],
  USER: [
    ["选择服务", "在脚本市场或场景中找到所需脚本服务。"],
    ["按次购买", "确认价格与规则，完成付费下单。"],
    ["运行与查看结果", "按指引运行任务，查看运行结果与产物。"],
  ],
  PUBLISHER: [
    ["选择服务", "浏览服务商品，了解规则与价格。"],
    ["按次购买", "按需下单并完成支付。"],
    ["运行使用", "按页面指引运行脚本并查看结果。"],
  ],
  ADMIN: [
    ["选择场景与服务", "在景点预约等场景中选择合适的脚本服务。"],
    ["按次购买并运行", "确认服务说明与规则后，按次下单并运行。"],
    ["查看结果与处理", "在服务结果中查看状态，按规则处理后续事项。"],
  ],
};

export function HelpPage() {
  const { role } = useWorkspace();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") || "";
  const group = params.get("group") || "";
  const [draft, setDraft] = useState(query);
  useEffect(() => setDraft(query), [query]);
  const content = useQuery({
    queryKey: ["public", "help"],
    queryFn: ({ signal }) => api<HelpContent>("/public/help", { signal }),
  });
  const guest = role === "GUEST";
  const questions = content.data?.questions || [];
  const selected = params.has("question")
    ? (params.get("question") || "").split(",").filter(Boolean)
    : ["refund"];
  const unavailable = selected.filter(
    (id) => content.data && !questions.some((question) => question.id === id),
  );
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const rows = questions.filter((item) => {
    const matchesGroup = !group || item.group === group;
    const searchable =
      `${item.title} ${item.answer} ${item.keywords}`.toLocaleLowerCase();
    const matchesQuery = terms.every((term) => searchable.includes(term));
    const included =
      Boolean(group || terms.length) ||
      item.featured ||
      selected.includes(item.id);
    return matchesGroup && matchesQuery && included;
  });
  function update(values: Record<string, string | undefined>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace });
  }
  function search(event: FormEvent) {
    event.preventDefault();
    update({ q: draft.trim() || undefined });
  }
  const searchForm = (
    <form
      className="help-search"
      onSubmit={search}
      role="search"
      aria-label="帮助搜索"
    >
      <Input
        prefix={<SearchOutlined />}
        aria-label="搜索帮助内容"
        placeholder={
          guest
            ? "搜索帮助内容，如“退款规则”、“服务费”"
            : role === "PUBLISHER"
              ? "搜索帮助，如“如何按次购买”"
              : role === "ADMIN"
                ? "搜索帮助，如“购买”“退款”“发布”等"
                : "请输入问题关键词"
        }
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
          if (guest)
            update({ q: event.target.value.trim() || undefined }, true);
        }}
        allowClear
        onClear={() => update({ q: undefined })}
      />
      {!guest && (
        <Button type="primary" htmlType="submit">
          {role === "PUBLISHER" ? "搜索帮助" : "搜索"}
        </Button>
      )}
    </form>
  );
  return (
    <div className="help-page">
      <PageHeading title="使用帮助" description={descriptions[role]} />
      {guest ? (
        <div className="public-resource-banner help-banner">
          <span className="help-script-icon" aria-hidden>
            {"</>"}
          </span>
          <div>
            <h2>按次使用通用脚本，解决数据处理与景点预约等需求</h2>
            <p>
              支持数据/文件工具与景点预约等多种场景。每单仅提供一次完整服务，同次接续不额外收费。
            </p>
          </div>
        </div>
      ) : role === "PUBLISHER" ? (
        searchForm
      ) : (
        <div className="public-resource-banner help-banner">
          {role === "USER" ? (
            <>
              <TileIcon name="book" color="gradient" />
              <div className="help-banner-copy">
                <h2>搜索帮助</h2>
                <p>
                  输入关键词，查找相关问题与使用说明，例如购买、退款、发布等。
                </p>
              </div>
              {searchForm}
            </>
          ) : (
            <>
              <div className="help-banner-copy">
                <h2>使用帮助</h2>
                <p>查找常见问题的解答与操作指引，快速解决使用中的疑问。</p>
                {searchForm}
              </div>
              <div className="help-search-art" aria-hidden>
                <i />
                <i />
                <span />
                <span />
                <span />
                <b />
              </div>
            </>
          )}
        </div>
      )}
      <div className="help-columns">
        <Panel
          title={role === "USER" || role === "ADMIN" ? "内容目录" : "帮助目录"}
          className="help-directory"
        >
          {content.isPending ? (
            <Skeleton active paragraph={{ rows: 5 }} />
          ) : (
            content.data?.groups.map((item) => (
              <Button
                type="text"
                className={group === item.id ? "selected" : ""}
                aria-pressed={group === item.id}
                key={item.id}
                onClick={() =>
                  update({ group: group === item.id ? undefined : item.id })
                }
              >
                {role !== "PUBLISHER" && <TileIcon name={item.icon} />}
                {item.title}
              </Button>
            ))
          )}
        </Panel>
        <Panel className="help-questions">
          {guest && searchForm}
          <h2>{guest ? "常见问题解答" : "常见问题（FAQ）"}</h2>
          {content.isError ? (
            <Alert
              type="error"
              title="帮助内容加载失败"
              action={
                <Button onClick={() => void content.refetch()}>
                  重试加载帮助
                </Button>
              }
            />
          ) : content.isPending ? (
            <Skeleton active paragraph={{ rows: 8 }} />
          ) : (
            <>
              {unavailable.length > 0 && (
                <Alert
                  type="info"
                  title={`帮助条目 ${unavailable.join("、")} 不可用`}
                />
              )}
              {rows.length ? (
                <Collapse
                  activeKey={selected}
                  onChange={(keys) =>
                    update({
                      question: (typeof keys === "string" ? [keys] : keys).join(
                        ",",
                      ),
                    })
                  }
                  expandIconPlacement="end"
                  expandIcon={({ isActive }) => (
                    <DownOutlined rotate={isActive ? 180 : 0} aria-hidden />
                  )}
                  items={rows.map((item) => ({
                    key: item.id,
                    label: (
                      <>
                        {guest && (
                          <span className="qa-letter" aria-hidden>
                            Q
                          </span>
                        )}
                        {item.title}
                      </>
                    ),
                    children: (
                      <div className="help-answer">
                        {guest && (
                          <span className="qa-letter" aria-hidden>
                            A
                          </span>
                        )}
                        {item.answer}
                      </div>
                    ),
                  }))}
                />
              ) : (
                <Empty description="未找到相关帮助">
                  <Button
                    onClick={() =>
                      update({
                        q: undefined,
                        group: undefined,
                        question: undefined,
                      })
                    }
                  >
                    清除筛选
                  </Button>
                </Empty>
              )}
            </>
          )}
        </Panel>
        <aside>
          <Panel
            title={guest ? "快速入门 · 三步使用" : "入门三步"}
            className="help-quickstart"
          >
            {quickStarts[role].map(([title, description], index) => (
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
            title={<>{guest && <TileIcon name="support" />}联系支持</>}
            className="help-contact"
          >
            {!guest && role !== "PUBLISHER" && <TileIcon name="support" />}
            <p>
              {role === "USER"
                ? "如有问题或需要帮助，可通过在线客服联系我们。"
                : role === "ADMIN"
                  ? "使用过程中遇到问题？可联系在线支持获取帮助。"
                  : "使用中遇到问题？可联系平台支持获取帮助。"}
            </p>
            <Button
              type="primary"
              disabled={!content.data}
              onClick={() => update({ support: "1" })}
            >
              {guest ? (
                <Icon name="message" />
              ) : role === "PUBLISHER" ? (
                <Icon name="support" />
              ) : null}
              {guest
                ? "联系在线支持"
                : role === "USER"
                  ? "联系在线客服"
                  : "联系支持"}
            </Button>
          </Panel>
        </aside>
      </div>
      <Modal
        title="联系平台支持"
        open={params.get("support") === "1"}
        onCancel={() => update({ support: undefined })}
        footer={
          <Button
            onClick={() =>
              update({
                support: undefined,
                q: undefined,
                group: "refund",
                question: "refund",
              })
            }
          >
            查看退款说明
          </Button>
        }
      >
        {content.isError ? (
          <Alert
            type="error"
            title="支持状态加载失败"
            action={
              <Button onClick={() => void content.refetch()}>
                重试加载帮助
              </Button>
            }
          />
        ) : content.isPending ? (
          <Skeleton active />
        ) : (
          <p>{content.data?.support.message}</p>
        )}
      </Modal>
    </div>
  );
}
