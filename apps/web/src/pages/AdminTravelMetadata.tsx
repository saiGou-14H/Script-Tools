import { useEffect, useState, type Key } from "react";
import {
  Alert,
  App,
  Button,
  Empty,
  Form,
  Input,
  Modal,
  Select,
  Table,
  Tabs,
} from "antd";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Notice, PageHeading, Panel, Status, TileIcon } from "../components/ui";
import {
  useAdminMetadata,
  type AdminCatalogMetadata,
} from "../lib/admin-metadata";
import {
  type CityMetadata,
  type AttractionMetadata,
  type ChannelMetadata,
  type ChannelRuleMetadata,
  channelCapabilityLabels,
  metadataTime,
  sourceHref,
} from "../lib/admin-travel-metadata";

function SourceLink({ value }: { value: string | null }) {
  const href = sourceHref(value);
  return href ? (
    <a href={href} target="_blank" rel="noreferrer">
      查看规则来源
    </a>
  ) : (
    <span>来源网址暂不可用</span>
  );
}
function ChannelRules({
  channel,
  onClose,
}: {
  channel: ChannelMetadata;
  onClose: () => void;
}) {
  const query = useAdminMetadata<ChannelRuleMetadata>(
    `channels/${encodeURIComponent(channel.id)}/rules`,
    "",
    true,
  );
  return (
    <Modal
      title="渠道验证记录"
      open
      onCancel={onClose}
      width={900}
      footer={<Button onClick={onClose}>关闭验证记录</Button>}
    >
      <h3>{channel.name}</h3>
      <dl className="admin-travel-summary">
        <dt>渠道编号</dt>
        <dd>{channel.id}</dd>
        <dt>记录修订</dt>
        <dd>{channel.revision}</dd>
        <dt>预约能力</dt>
        <dd>
          {channelCapabilityLabels[channel.adapter_status] ||
            channel.adapter_status}
        </dd>
        <dt>规则绑定</dt>
        <dd>
          {channel.rule_binding_state === "BOUND"
            ? `规则v${channel.rule_version}`
            : channel.rule_binding_state === "INVALID"
              ? "规则绑定异常"
              : "未绑定规则"}
        </dd>
      </dl>
      <Notice>
        以下展示规则版本与验证时间元数据，验证文件及规则正文查询继续接入。
      </Notice>
      {query.isError && (
        <Alert
          type="error"
          title="规则版本查询失败"
          action={
            <Button onClick={() => void query.refetch()}>重试规则查询</Button>
          }
        />
      )}
      <Table<ChannelRuleMetadata>
        className="admin-channel-rule-versions"
        rowKey="id"
        pagination={false}
        loading={query.isFetching}
        dataSource={query.data?.pages.flatMap((page) => page.items) || []}
        scroll={{ x: 780 }}
        columns={[
          {
            title: "规则版本",
            render: (_, row) => (
              <span>
                规则v{row.version}
                {row.is_current ? "（当前绑定）" : ""}
              </span>
            ),
          },
          {
            title: "验证时间",
            render: (_, row) => metadataTime(row.verified_at),
          },
          {
            title: "证据元数据",
            render: (_, row) => (row.has_evidence ? "有记录" : "暂无记录"),
          },
          {
            title: "规则来源",
            render: (_, row) => <SourceLink value={row.source_url} />,
          },
        ]}
      />
      {query.hasNextPage && (
        <Button
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          加载更多规则版本
        </Button>
      )}
    </Modal>
  );
}
function AttractionDetails({
  attraction,
  onClose,
}: {
  attraction: AttractionMetadata;
  onClose: () => void;
}) {
  const [tab, setTab] = useState("channels");
  const [channel, setChannel] = useState<ChannelMetadata>();
  const filter = new URLSearchParams({
    attraction_id: attraction.id,
  }).toString();
  const channels = useAdminMetadata<ChannelMetadata>(
    "channels",
    filter,
    tab === "channels",
  );
  const services = useAdminMetadata<AdminCatalogMetadata>(
    "services",
    filter,
    tab === "services",
  );
  return (
    <>
      <Modal
        title={`景点资料 · ${attraction.name}`}
        open
        width={960}
        onCancel={onClose}
        footer={<Button onClick={onClose}>关闭景点资料</Button>}
      >
        <dl className="admin-travel-summary">
          <dt>景点编号</dt>
          <dd>{attraction.id}</dd>
          <dt>时区</dt>
          <dd>{attraction.timezone}</dd>
          <dt>记录修订</dt>
          <dd>{attraction.revision}</dd>
          <dt>票款</dt>
          <dd>0元</dd>
        </dl>
        <Notice>
          目录启用与渠道能力分别展示，实际售卖继续校验商品、发布者、部署及价格。
        </Notice>
        <Tabs
          activeKey={tab}
          onChange={setTab}
          items={[
            {
              key: "channels",
              label: "渠道与规则",
              children: (
                <>
                  {channels.isError && (
                    <Alert
                      type="error"
                      title="景点渠道查询失败"
                      action={
                        <Button onClick={() => void channels.refetch()}>
                          重试景点渠道
                        </Button>
                      }
                    />
                  )}
                  <Table<ChannelMetadata>
                    rowKey="id"
                    pagination={false}
                    loading={channels.isFetching}
                    scroll={{ x: 760 }}
                    dataSource={
                      channels.data?.pages.flatMap((page) => page.items) || []
                    }
                    columns={[
                      { title: "渠道", dataIndex: "name" },
                      {
                        title: "预约能力",
                        render: (_, row) =>
                          channelCapabilityLabels[row.adapter_status] ||
                          row.adapter_status,
                      },
                      {
                        title: "当前规则",
                        render: (_, row) =>
                          row.rule_binding_state === "BOUND"
                            ? `规则v${row.rule_version}`
                            : "规则待核验",
                      },
                      {
                        title: "规则来源",
                        render: (_, row) => (
                          <SourceLink value={row.source_url} />
                        ),
                      },
                      {
                        title: "验证记录",
                        render: (_, row) => (
                          <Button type="link" onClick={() => setChannel(row)}>
                            查看版本记录
                          </Button>
                        ),
                      },
                    ]}
                  />
                  {channels.hasNextPage && (
                    <Button
                      loading={channels.isFetchingNextPage}
                      onClick={() => void channels.fetchNextPage()}
                    >
                      加载更多景点渠道
                    </Button>
                  )}
                </>
              ),
            },
            {
              key: "services",
              label: "关联服务",
              children: (
                <>
                  {services.isError && (
                    <Alert
                      type="error"
                      title="关联服务查询失败"
                      action={
                        <Button onClick={() => void services.refetch()}>
                          重试关联服务
                        </Button>
                      }
                    />
                  )}
                  <Table<AdminCatalogMetadata>
                    rowKey="id"
                    pagination={false}
                    loading={services.isFetching}
                    scroll={{ x: 700 }}
                    dataSource={
                      services.data?.pages.flatMap((page) => page.items) || []
                    }
                    columns={[
                      { title: "服务", dataIndex: "title" },
                      { title: "发布者", dataIndex: "publisher" },
                      { title: "商品状态", dataIndex: "status" },
                      {
                        title: "脚本版本",
                        render: (_, row) => row.version || "未绑定版本",
                      },
                      {
                        title: "部署",
                        render: (_, row) =>
                          row.deployment_status || "未绑定部署",
                      },
                    ]}
                  />
                  {services.hasNextPage && (
                    <Button
                      loading={services.isFetchingNextPage}
                      onClick={() => void services.fetchNextPage()}
                    >
                      加载更多关联服务
                    </Button>
                  )}
                </>
              ),
            },
          ]}
        />
      </Modal>
      {channel && (
        <ChannelRules channel={channel} onClose={() => setChannel(undefined)} />
      )}
    </>
  );
}

export function AdminAttractionMetadataPage() {
  const [params, setParams] = useSearchParams();
  const requestedCity = params.get("city")?.toLowerCase();
  const [detail, setDetail] = useState<AttractionMetadata>();
  const cities = useAdminMetadata<CityMetadata>("cities", "", true);
  const cityRows = cities.data?.pages.flatMap((page) => page.items) || [];
  const cityLookup = useAdminMetadata<CityMetadata>(
    "cities",
    new URLSearchParams({ q: requestedCity || "" }).toString(),
    Boolean(
      requestedCity && !cityRows.some((city) => city.id === requestedCity),
    ),
  );
  const city = requestedCity
    ? cityRows.find((item) => item.id === requestedCity) ||
      cityLookup.data?.pages
        .flatMap((page) => page.items)
        .find((item) => item.id === requestedCity)
    : cityRows[0];
  const visibleCities =
    city && !cityRows.some((item) => item.id === city.id)
      ? [...cityRows, city]
      : cityRows;
  const attractions = useAdminMetadata<AttractionMetadata>(
    "attractions",
    new URLSearchParams({ city_id: city?.id || "" }).toString(),
    Boolean(city),
  );
  const missing =
    requestedCity && !city && !cityLookup.isPending && !cityLookup.isError;
  return (
    <div className="admin-page admin-attractions-page">
      <PageHeading
        title="城市与景点"
        description="管理各城市的景点及其票种信息，维护票款、规则来源与关联服务，控制景点的售卖状态。"
      />
      <div className="admin-travel-banner">
        <TileIcon name="travel" />
        <span>
          <h3>城市与景点管理</h3>
          <p>当前支持目录及关联资料查询，目录维护与售卖核验继续接入。</p>
        </span>
      </div>
      {(cities.isError || cityLookup.isError) && (
        <Alert
          type="error"
          title="城市目录查询失败"
          action={
            <Button
              onClick={() => {
                void cities.refetch();
                if (requestedCity) void cityLookup.refetch();
              }}
            >
              重试城市查询
            </Button>
          }
        />
      )}
      {missing && <Notice>所选城市不存在或已失效。</Notice>}
      <div className="admin-attraction-columns">
        <Panel title="城市" className="admin-city-list">
          {cities.isPending && <p>正在查询城市目录…</p>}
          {!cities.isPending &&
            !cities.isError &&
            visibleCities.length === 0 && <Empty description="暂无城市目录" />}
          {visibleCities.map((item) => (
            <button
              key={item.id}
              type="button"
              className={city?.id === item.id ? "selected" : ""}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("city", item.id);
                setParams(next);
                setDetail(undefined);
              }}
            >
              <span>{city?.id === item.id ? "⌄" : "›"}</span>
              {item.name}
              <small>（{item.attraction_count}）</small>
              {!item.enabled && <Status tone="gray">停用</Status>}
            </button>
          ))}
          {cities.hasNextPage && (
            <Button
              loading={cities.isFetchingNextPage}
              onClick={() => void cities.fetchNextPage()}
            >
              加载更多城市
            </Button>
          )}
        </Panel>
        <Panel
          title={`景点列表（${city?.name || "—"}）`}
          extra={
            <div className="row-actions">
              <Button type="primary" disabled>
                新增景点
              </Button>
              <Button disabled>编辑</Button>
            </div>
          }
        >
          {attractions.isError && (
            <Alert
              type="error"
              title="景点目录查询失败"
              action={
                <Button onClick={() => void attractions.refetch()}>
                  重试景点查询
                </Button>
              }
            />
          )}
          <Table<AttractionMetadata>
            rowKey="id"
            pagination={false}
            loading={Boolean(city) && attractions.isFetching}
            scroll={{ x: 1000 }}
            dataSource={
              city
                ? attractions.data?.pages.flatMap((page) => page.items) || []
                : []
            }
            columns={[
              {
                title: "景点",
                render: (_, row) => (
                  <Button type="text" onClick={() => setDetail(row)}>
                    {row.name}
                  </Button>
                ),
              },
              { title: "票种", render: () => <Status>免费参观预约</Status> },
              { title: "票款", render: () => "0元" },
              {
                title: "规则来源",
                render: (_, row) => (
                  <Button type="link" onClick={() => setDetail(row)}>
                    {row.rule_source_count} 个来源
                  </Button>
                ),
              },
              {
                title: "关联服务",
                render: (_, row) => (
                  <Button type="link" onClick={() => setDetail(row)}>
                    {row.linked_service_count} 个服务
                  </Button>
                ),
              },
              {
                title: "支持状态",
                render: (_, row) => (
                  <Status
                    tone={row.enabled && row.city_enabled ? "blue" : "gray"}
                  >
                    {row.enabled && row.city_enabled
                      ? "目录已启用"
                      : "目录未开放"}
                  </Status>
                ),
              },
            ]}
          />
          {city && attractions.hasNextPage && (
            <Button
              loading={attractions.isFetchingNextPage}
              onClick={() => void attractions.fetchNextPage()}
            >
              加载更多景点
            </Button>
          )}
        </Panel>
      </div>
      {detail && (
        <AttractionDetails
          key={detail.id}
          attraction={detail}
          onClose={() => setDetail(undefined)}
        />
      )}
    </div>
  );
}

export function AdminChannelMetadataPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") || "",
    status = params.get("status") || undefined;
  const [form] = Form.useForm();
  const [selectedIds, setSelectedIds] = useState<Key[]>([]);
  const [channel, setChannel] = useState<ChannelMetadata>();
  const { message } = App.useApp();
  useEffect(() => {
    form.setFieldsValue({ name: q, status });
  }, [form, q, status]);
  const search = new URLSearchParams({ q });
  if (status) search.set("status", status);
  const query = useAdminMetadata<ChannelMetadata>(
    "channels",
    search.toString(),
    true,
  );
  const rows = query.data?.pages.flatMap((page) => page.items) || [];
  const selected = rows.filter((row) => selectedIds.includes(row.id));
  function filter(values: { name?: string; status?: string }) {
    const next = new URLSearchParams(params);
    if (values.name?.trim()) next.set("q", values.name.trim());
    else next.delete("q");
    if (values.status) next.set("status", values.status);
    else next.delete("status");
    setParams(next);
    setSelectedIds([]);
  }
  return (
    <div className="admin-page admin-channels-page">
      <PageHeading
        title="渠道与适配"
        description="管理各景点预约渠道的适配配置、验证结果与运行状态，支持规则更新与渠道管控。"
      />
      <Notice>
        当前支持渠道及规则版本元数据查询，更新规则和禁用新提交继续接入。
      </Notice>
      <Panel className="admin-channel-main">
        <Form
          name="admin-live-channel-search"
          form={form}
          layout="inline"
          colon={false}
          onFinish={filter}
        >
          <Form.Item label="渠道名称" name="name">
            <Input
              placeholder="请输入渠道名称"
              prefix={<Icon name="search" />}
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              placeholder="全部状态"
              allowClear
              options={Object.entries(channelCapabilityLabels).map(
                ([value, label]) => ({ value, label }),
              )}
            />
          </Form.Item>
          <div className="row-actions">
            <Button type="primary" htmlType="submit">
              查询
            </Button>
            <Button onClick={() => filter({})}>重置</Button>
          </div>
        </Form>
        <div className="channel-toolbar">
          <Button
            type="primary"
            onClick={() => {
              if (selected.length === 1) setChannel(selected[0]);
              else void message.info("请先选择一个渠道");
            }}
          >
            查看验证记录
          </Button>
          <Button disabled>禁用新提交</Button>
          <Button disabled>更新规则</Button>
        </div>
        {query.isError && (
          <Alert
            type="error"
            title="渠道目录查询失败"
            action={
              <Button onClick={() => void query.refetch()}>重试渠道查询</Button>
            }
          />
        )}
        <Table<ChannelMetadata>
          rowKey="id"
          pagination={false}
          loading={query.isFetching}
          scroll={{ x: 1200 }}
          dataSource={rows}
          rowSelection={{
            selectedRowKeys: selected.map((row) => row.id),
            onChange: setSelectedIds,
          }}
          columns={[
            { title: "渠道", render: (_, row) => <b>{row.name}</b> },
            {
              title: "版本",
              render: (_, row) =>
                row.rule_binding_state === "BOUND" ? (
                  <Status>规则v{row.rule_version}</Status>
                ) : row.rule_binding_state === "INVALID" ? (
                  "规则绑定异常"
                ) : (
                  "未绑定规则"
                ),
            },
            { title: "适配器", render: () => "绑定查询待接入" },
            {
              title: "验证时间",
              render: (_, row) => metadataTime(row.verified_at),
            },
            {
              title: "证据",
              render: (_, row) => (
                <Button type="link" onClick={() => setChannel(row)}>
                  {row.has_evidence ? "有证据记录" : "查看版本记录"}
                </Button>
              ),
            },
            {
              title: "状态",
              render: (_, row) => (
                <Status>
                  {channelCapabilityLabels[row.adapter_status] ||
                    row.adapter_status}
                </Status>
              ),
            },
          ]}
        />
        {query.hasNextPage && (
          <Button
            loading={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            加载更多渠道
          </Button>
        )}
      </Panel>
      <Panel title="未决预约查询" className="channel-unresolved">
        <Notice>未决预约查询继续接入。</Notice>
        <Empty description="未决预约元数据暂不可用" />
      </Panel>
      {channel && (
        <ChannelRules
          key={channel.id}
          channel={channel}
          onClose={() => setChannel(undefined)}
        />
      )}
    </div>
  );
}
