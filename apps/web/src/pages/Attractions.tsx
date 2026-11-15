import { Alert, Button, DatePicker, Empty, Input, Modal, Skeleton } from "antd";
import {
  CalendarOutlined,
  DownOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import dayjs from "dayjs";
import { ApiError, apiPage } from "../api";
import { useWorkspace } from "../context";
import { Icon } from "../components/Icon";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import { currency, useServices } from "./Market";
import {
  attractionFixtures,
  fixtureAttractionService,
  usePublicAttraction,
  validVisitDate,
  type PublicAttraction,
} from "../lib/public-travel";

type SceneService = PublicAttraction["services"][number];
interface SceneRow {
  id: string;
  city: string;
  name: string;
  description: string;
  ticketMinor: string;
  image?: string;
  open: boolean;
  services: SceneService[];
}

function feeLabel(services: SceneService[]) {
  if (!services.length) return "待配置";
  const currencies = new Set(services.map((service) => service.currency));
  if (currencies.size > 1) return "查看服务报价";
  const minimum = services.reduce(
    (lowest, service) =>
      BigInt(service.amount_minor) < BigInt(lowest)
        ? service.amount_minor
        : lowest,
    services[0].amount_minor,
  );
  return `${services[0].currency === "CNY" ? "¥" : services[0].currency + " "}${currency(minimum)}${services.length > 1 ? "起" : ""}/次`;
}

export function AttractionsPage() {
  const { bootstrap, role } = useWorkspace();
  const prototype = bootstrap.data_mode === "prototype";
  const guest = role === "GUEST";
  const [params, setParams] = useSearchParams();
  const city = params.get("city") || "";
  const query = params.get("q") || "";
  const date = params.get("date") ?? (prototype ? "2026-11-13" : "");
  const validDate = !date || validVisitDate(date);
  const {
    data: services = [],
    isPending: servicesPending,
    isError: servicesError,
    refetch: refetchServices,
  } = useServices();
  const filters = new URLSearchParams();
  if (city) filters.set("city_id", city);
  if (query) filters.set("q", query);
  if (date && validDate) filters.set("date", date);
  const cities = useInfiniteQuery({
    queryKey: ["public", "cities"],
    enabled: !prototype,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiPage<{ id: string; name: string }>(
        "/cities?limit=20" +
          (pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""),
        { signal },
      ),
    getNextPageParam: (result) => result.next_cursor || undefined,
  });
  const attractions = useInfiniteQuery({
    queryKey: ["public", "attractions", filters.toString()],
    enabled: !prototype && validDate,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      apiPage<PublicAttraction>(
        `/attractions?${filters}&limit=20${pageParam ? "&cursor=" + encodeURIComponent(pageParam) : ""}`,
        { signal },
      ),
    getNextPageParam: (result) => result.next_cursor || undefined,
  });
  const selectedId = params.get("services") || undefined;
  const selected = usePublicAttraction(
    selectedId,
    date,
    !prototype && validDate,
  );
  const rows: SceneRow[] = prototype
    ? attractionFixtures
        .filter(
          (item) =>
            (!city || item.city === city) &&
            `${item.city}${item.title}`.includes(query.trim()),
        )
        .map((item) => {
          const service = fixtureAttractionService(item, services);
          return {
            id: item.id,
            city: item.city,
            name: item.title,
            description: guest ? item.description : item.galleryDescription,
            image: item.image,
            ticketMinor: item.ticketMinor,
            open: item.open,
            services: service ? [service] : [],
          };
        })
    : (attractions.data?.pages.flatMap((page) => page.items) || []).map(
        (item) => ({
          id: item.id,
          city: item.city_name,
          name: item.name,
          description: item.description,
          ticketMinor: item.ticket_price_minor,
          open: item.channels.some(
            (channel) =>
              channel.adapter_status === "BOOKING_SUPPORTED" &&
              channel.rule_verified,
          ),
          services: item.services,
        }),
      );
  const selectedFixture = prototype
    ? attractionFixtures.find((item) => item.id === selectedId)
    : undefined;
  const selectedServices = prototype
    ? selectedFixture
      ? [fixtureAttractionService(selectedFixture, services)].filter(
          (item): item is NonNullable<typeof item> => Boolean(item),
        )
      : []
    : selected.data?.services || [];
  const choices = prototype
    ? ["北京", "杭州", "苏州"].map((name) => ({ id: name, name }))
    : cities.data?.pages.flatMap((page) => page.items) || [];
  function update(values: Record<string, string | undefined>, replace = false) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setParams(next, { replace });
  }
  function servicePath(attractionId: string, serviceId: string) {
    const context = new URLSearchParams({
      attraction: attractionId,
      workspace: role,
    });
    if (date) context.set("date", date);
    const back = new URLSearchParams(params);
    back.delete("services");
    context.set("returnTo", `/travel?${back}`);
    return `/travel/attractions/${serviceId}?${context}`;
  }
  const pending = prototype
    ? servicesPending
    : attractions.isPending && validDate;
  const failed = prototype ? servicesError : attractions.isError;
  const notice = (
    <Notice>
      {guest && "提示："}
      {prototype
        ? "仅展示示例接入状态，开放以真实渠道验证为准。"
        : "目录按已开放记录展示，日期用于传递预约条件，库存与预约结果待渠道核验。"}
    </Notice>
  );
  return (
    <div
      className={`attractions-page ${guest ? "guest-attractions" : "member-attractions"}`}
    >
      <PageHeading
        title="城市与景点"
        description={
          guest
            ? "提供数据/文件处理工具与景点预约脚本的按次使用服务。每单只有一次完整服务，同次接续不额外收费。门票0元不等于脚本服务免费。未达目标的退款规则由发布者选择，购买前展示，成交后固定。"
            : undefined
        }
      />
      <div className="public-resource-banner attractions-banner">
        <h2>
          {guest ? (
            "脚本服务 · 数据/文件工具 · 景点预约"
          ) : (
            <>
              一站式使用脚本，便捷处理<span>数据、文件与景点预约</span>
            </>
          )}
        </h2>
        <p>
          {guest
            ? "按次付费使用，流程清晰，规则透明"
            : "支持个人按次使用各类脚本，涵盖数据处理、文件工具与景点预约等场景。每单仅包含一次完整服务，同次接续不额外收费。"}
        </p>
      </div>
      <div className="attraction-filters">
        <b>{guest ? "选择城市：" : "城市："}</b>
        <div className="attraction-city-options">
          <Button
            aria-label="全部"
            type={!city ? "primary" : "default"}
            onClick={() => update({ city: undefined })}
          >
            全部
          </Button>
          {choices.map((item) => (
            <Button
              key={item.id}
              aria-label={item.name}
              type={city === item.id ? "primary" : "default"}
              onClick={() => update({ city: item.id })}
            >
              {item.name}
            </Button>
          ))}
          {!prototype && cities.hasNextPage && (
            <Button
              loading={cities.isFetchingNextPage}
              onClick={() => void cities.fetchNextPage()}
            >
              更多城市
            </Button>
          )}
        </div>
        <span className="filter-divider" />
        <b>{guest ? "选择日期：" : "日期："}</b>
        <DatePicker
          value={validDate && date ? dayjs(date) : null}
          onChange={(value) => update({ date: value?.format("YYYY-MM-DD") })}
          allowClear={false}
          aria-label="预约日期"
          prefix={<CalendarOutlined />}
          suffix={guest ? null : <DownOutlined />}
        />
        <span className="filter-divider" />
        {!guest && <b>搜索景点：</b>}
        <Input
          prefix={<SearchOutlined />}
          aria-label="搜索景点名称"
          placeholder={guest ? "搜索景点名称" : "请输入景点名称"}
          value={query}
          onChange={(event) => update({ q: event.target.value }, true)}
          allowClear
          maxLength={200}
        />
      </div>
      {!validDate && <Alert type="error" title="预约日期无效，请重新选择" />}
      {!prototype && cities.isError && (
        <Alert
          type="error"
          title="城市目录加载失败"
          action={
            <Button onClick={() => void cities.refetch()}>重试城市查询</Button>
          }
        />
      )}
      {guest && notice}
      {failed ? (
        <Alert
          type="error"
          title="景点目录加载失败"
          action={
            <Button
              onClick={() =>
                void (prototype ? refetchServices() : attractions.refetch())
              }
            >
              重试景点查询
            </Button>
          }
        />
      ) : pending ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : (
        validDate && (
          <div
            className={`attraction-grid ${guest ? "attraction-cards" : "attraction-list"}`}
          >
            {rows.map((item) => {
              const closed = prototype && !item.open;
              const fee = feeLabel(item.services);
              const action = closed ? (
                !guest && (
                  <Button block disabled>
                    暂未开放
                  </Button>
                )
              ) : item.services.length === 1 ? (
                <Link to={servicePath(item.id, item.services[0].id)}>
                  <Button type="primary" block>
                    查看服务
                  </Button>
                </Link>
              ) : (
                <Button
                  type="primary"
                  block
                  disabled={!item.services.length}
                  onClick={() => update({ services: item.id })}
                >
                  {item.services.length ? "查看服务" : "服务待接入"}
                </Button>
              );
              const fees = (
                <div className="attraction-fees">
                  <div>
                    <span>门票</span>
                    <strong>
                      ¥{currency(item.ticketMinor).replace(/\.00$/, "")}
                    </strong>
                  </div>
                  <div>
                    <span>脚本服务费</span>
                    <strong>
                      {fee.replace(/\/次$/, "")}
                      {fee.endsWith("/次") && <small>/次</small>}
                    </strong>
                  </div>
                </div>
              );
              const heading = (
                <div className="attraction-card-heading">
                  <h2>
                    {item.city} · {item.name}
                    {!guest && prototype && "（示例）"}
                  </h2>
                  <Status tone={item.open ? "green" : "gray"}>
                    {item.open ? "已接入" : prototype ? "暂未开放" : "待验证"}
                  </Status>
                </div>
              );
              return (
                <Panel key={item.id} className="attraction-card">
                  {!guest &&
                    (item.image ? (
                      <img
                        className="attraction-image"
                        src={item.image}
                        alt={`${item.city} · ${item.name}示例场馆配图`}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="attraction-image attraction-image-empty">
                        <TileIcon name="travel" />
                      </div>
                    ))}
                  <div className="attraction-summary">
                    {heading}
                    <p>{item.description}</p>
                    {!guest && prototype && (
                      <div className="attraction-tags">
                        <Status>景点预约</Status>
                        <Status>数据处理</Status>
                        <Status>文件工具</Status>
                      </div>
                    )}
                  </div>
                  {fees}
                  {guest && (
                    <div className="attraction-rules">
                      <p>
                        <Icon name="payment" />
                        <b>支付：</b>
                        <span>
                          {!closed && item.services.length
                            ? `按次付费，${feeLabel(item.services)}`
                            : "暂不支持购买"}
                        </span>
                      </p>
                      <p>
                        <Icon name="play-outline" />
                        <b>执行：</b>
                        <span>
                          {item.open
                            ? "由脚本自动完成预约流程"
                            : closed
                              ? "暂未开放，无法执行"
                              : "渠道能力与执行待验证"}
                        </span>
                      </p>
                      <p>
                        <Icon name="flag" />
                        <b>目标结果：</b>
                        <span>
                          {item.open ? "获取预约成功信息" : "暂未开放服务"}
                        </span>
                      </p>
                    </div>
                  )}
                  <div className="attraction-action">{action}</div>
                </Panel>
              );
            })}
          </div>
        )
      )}
      {!pending && !failed && validDate && !rows.length && (
        <Empty description="暂无匹配的景点">
          <Button onClick={() => update({ city: undefined, q: undefined })}>
            清除筛选
          </Button>
        </Empty>
      )}
      {!prototype && attractions.hasNextPage && (
        <Button
          loading={attractions.isFetchingNextPage}
          onClick={() => void attractions.fetchNextPage()}
        >
          加载更多景点
        </Button>
      )}
      {!guest && notice}
      <Modal
        title="选择景点服务"
        open={Boolean(selectedId)}
        onCancel={() => update({ services: undefined })}
        footer={
          <Button onClick={() => update({ services: undefined })}>
            关闭服务列表
          </Button>
        }
      >
        {!prototype && selected.isPending ? (
          <Skeleton active />
        ) : !prototype &&
          selected.isError &&
          !(
            selected.error instanceof ApiError && selected.error.status === 404
          ) ? (
          <Alert
            type="error"
            title="景点服务加载失败"
            action={
              <Button onClick={() => void selected.refetch()}>
                重试服务列表
              </Button>
            }
          />
        ) : selectedServices.length ? (
          selectedServices.map((service) => (
            <div className="attraction-service-choice" key={service.id}>
              <b>{service.title}</b>
              <span>{feeLabel([service])}</span>
              <Link to={servicePath(selectedId!, service.id)}>
                <Button type="primary">查看此服务</Button>
              </Link>
            </div>
          ))
        ) : (
          <Empty description={`景点 ${selectedId || ""} 暂无可查看服务`} />
        )}
      </Modal>
    </div>
  );
}
