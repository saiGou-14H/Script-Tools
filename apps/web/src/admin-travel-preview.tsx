import {
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAdminPreview } from "./admin-preview";
import { useWorkspace } from "./context";

export interface TravelCityPreview {
  id: string;
  name: string;
  timezone: string;
  enabled: boolean;
}
export interface AttractionPreview {
  id: string;
  cityId: string;
  name: string;
  officialUrl: string;
  ruleSource: string;
  channelId?: string;
  service?: string;
  enabled: boolean;
  requestKey?: string;
}
export interface TravelChannelPreview {
  id: string;
  name: string;
  version: string;
  adapter: string;
  verifiedAt: string;
  evidence: string;
  status: "VERIFIED" | "UNVERIFIED" | "DEGRADED";
  enabled: boolean;
  ruleSource: string;
  ruleSnapshot: string;
  requestKey?: string;
  historicalEvidence?: {
    version: string;
    evidence: string;
    verifiedAt: string;
    ruleSource: string;
    ruleSnapshot: string;
    status: string;
  }[];
}
const TravelPreviewContext = createContext<{
  enabled: boolean;
  cities: TravelCityPreview[];
  attractions: AttractionPreview[];
  channels: TravelChannelPreview[];
  saveCity: (city: TravelCityPreview, requestKey: string) => void;
  saveAttraction: (attraction: AttractionPreview, requestKey: string) => void;
  disableChannel: (id: string, reason: string, requestKey: string) => void;
  saveChannelRule: (
    id: string,
    source: string,
    snapshot: string,
    reason: string,
    requestKey: string,
  ) => void;
  isSaleable: (attraction: AttractionPreview) => boolean;
} | null>(null);

export function AdminTravelPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { enabled, recordNote } = useAdminPreview();
  const { bootstrap } = useWorkspace();
  const [cities, setCities] = useState<TravelCityPreview[]>(
    enabled
      ? [
          {
            id: "hangzhou",
            name: "杭州",
            timezone: "Asia/Shanghai",
            enabled: true,
          },
          {
            id: "beijing",
            name: "北京",
            timezone: "Asia/Shanghai",
            enabled: true,
          },
          {
            id: "suzhou",
            name: "苏州",
            timezone: "Asia/Shanghai",
            enabled: true,
          },
        ]
      : [],
  );
  const [attractions, setAttractions] = useState<AttractionPreview[]>(
    enabled
      ? [
          {
            id: "history",
            cityId: "hangzhou",
            name: "城市历史馆（示例）",
            officialUrl: "https://example.invalid/history",
            ruleSource: "规则样例2026-11-13",
            channelId: "A",
            service: "预约服务示例A",
            enabled: true,
          },
          {
            id: "canal",
            cityId: "hangzhou",
            name: "运河展览馆（示例）",
            officialUrl: "https://example.invalid/canal",
            ruleSource: "规则待核验",
            enabled: false,
          },
          {
            id: "nature",
            cityId: "hangzhou",
            name: "自然展馆（示例）",
            officialUrl: "https://example.invalid/nature",
            ruleSource: "规则待核验",
            enabled: false,
          },
          {
            id: "beijing-history",
            cityId: "beijing",
            name: "城市博物馆（示例）",
            officialUrl: "https://example.invalid/beijing",
            ruleSource: "规则待核验",
            enabled: false,
          },
          {
            id: "beijing-art",
            cityId: "beijing",
            name: "艺术展馆（示例）",
            officialUrl: "https://example.invalid/art",
            ruleSource: "规则待核验",
            enabled: false,
          },
          {
            id: "suzhou-museum",
            cityId: "suzhou",
            name: "城市展览馆（示例）",
            officialUrl: "https://example.invalid/suzhou",
            ruleSource: "规则待核验",
            enabled: false,
          },
        ]
      : [],
  );
  const [channels, setChannels] = useState<TravelChannelPreview[]>(
    enabled
      ? [
          {
            id: "A",
            name: "渠道A",
            version: "v1.4.2",
            adapter: "通用适配器v2",
            verifiedAt: "刚刚",
            evidence: "验证截图（3张）",
            status: "VERIFIED",
            enabled: true,
            ruleSource: "规则样例2026-11-13",
            ruleSnapshot: "免费参观预约，按原渠道结果核验。",
          },
          {
            id: "B",
            name: "渠道B",
            version: "v1.2.0",
            adapter: "景点适配器v1",
            verifiedAt: "10分钟前",
            evidence: "验证日志（1份）",
            status: "UNVERIFIED",
            enabled: false,
            ruleSource: "规则待核验",
            ruleSnapshot: "接入草稿，等待验证。",
          },
          {
            id: "C",
            name: "渠道C",
            version: "v1.3.1",
            adapter: "通用适配器v2",
            verifiedAt: "30分钟前",
            evidence: "异常证据（2张）",
            status: "DEGRADED",
            enabled: false,
            ruleSource: "规则待复核",
            ruleSnapshot: "渠道降级，已有预约继续核验。",
          },
        ]
      : [],
  );
  const handledRequests = useRef(new Set<string>());
  function requireManagement() {
    if (!enabled) throw new Error("景点渠道管理接口尚未接入");
    if (!bootstrap.user?.capabilities.includes("catalog.manage"))
      throw new Error("当前账号缺少catalog.manage能力");
  }
  function isSaleable(attraction: AttractionPreview) {
    const channel = channels.find((item) => item.id === attraction.channelId);
    return (
      attraction.enabled &&
      Boolean(
        attraction.service &&
          channel?.enabled &&
          channel.status === "VERIFIED" &&
          cities.find((item) => item.id === attraction.cityId)?.enabled,
      )
    );
  }
  function saveCity(city: TravelCityPreview, requestKey: string) {
    requireManagement();
    if (handledRequests.current.has(requestKey)) return;
    if (!city.name.trim()) throw new Error("请填写城市名称");
    try {
      new Intl.DateTimeFormat("zh-CN", { timeZone: city.timezone });
    } catch {
      throw new Error("请填写有效IANA时区");
    }
    if (
      cities.some(
        (item) => item.id !== city.id && item.name === city.name.trim(),
      )
    )
      throw new Error("城市名称已存在");
    handledRequests.current.add(requestKey);
    setCities((previous) =>
      previous.some((item) => item.id === city.id)
        ? previous.map((item) =>
            item.id === city.id ? { ...city, name: city.name.trim() } : item,
          )
        : [...previous, { ...city, name: city.name.trim() }],
    );
    recordNote(city.id, "维护城市配置预览", requestKey);
  }
  function saveAttraction(attraction: AttractionPreview, requestKey: string) {
    requireManagement();
    if (handledRequests.current.has(requestKey)) return;
    if (
      !attraction.name.trim() ||
      !cities.some((item) => item.id === attraction.cityId)
    )
      throw new Error("请填写景点名称并选择有效城市");
    let url: URL;
    try {
      url = new URL(attraction.officialUrl);
    } catch {
      throw new Error("请填写有效规则来源网址");
    }
    if (!["https:", "http:"].includes(url.protocol))
      throw new Error("请填写有效规则来源网址");
    const channel = channels.find((item) => item.id === attraction.channelId);
    if (
      attraction.enabled &&
      (!cities.find((city) => city.id === attraction.cityId)?.enabled ||
        !channel?.enabled ||
        channel.status !== "VERIFIED" ||
        !attraction.service ||
        !attraction.ruleSource.trim())
    )
      throw new Error("开放需要有效城市、已验证渠道、规则来源及关联服务");
    handledRequests.current.add(requestKey);
    setAttractions((previous) =>
      previous.some((item) => item.requestKey === requestKey)
        ? previous
        : previous.some((item) => item.id === attraction.id)
          ? previous.map((item) =>
              item.id === attraction.id ? { ...attraction, requestKey } : item,
            )
          : [...previous, { ...attraction, requestKey }],
    );
    recordNote(attraction.id, "维护免费景点配置预览", requestKey);
  }
  function disableChannel(id: string, reason: string, requestKey: string) {
    requireManagement();
    if (handledRequests.current.has(requestKey)) return;
    if (!channels.some((channel) => channel.id === id))
      throw new Error("渠道不存在或已失效");
    if (!reason.trim()) throw new Error("请填写停用理由");
    handledRequests.current.add(requestKey);
    setChannels((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, enabled: false } : item,
      ),
    );
    recordNote(id, `禁用新提交 · ${reason}`, requestKey);
  }
  function saveChannelRule(
    id: string,
    source: string,
    snapshot: string,
    reason: string,
    requestKey: string,
  ) {
    requireManagement();
    if (handledRequests.current.has(requestKey)) return;
    if (!channels.some((channel) => channel.id === id))
      throw new Error("渠道不存在或已失效");
    if (!source.trim() || !snapshot.trim() || !reason.trim())
      throw new Error("请补全规则来源、快照与处理理由");
    handledRequests.current.add(requestKey);
    setChannels((previous) =>
      previous.map((item) => {
        if (item.id !== id || item.requestKey === requestKey) return item;
        const parts = item.version.split(".");
        return {
          ...item,
          version: `${parts[0]}.${parts[1]}.${Number(parts[2]) + 1}`,
          ruleSource: source,
          ruleSnapshot: snapshot,
          historicalEvidence: [
            ...(item.historicalEvidence || []),
            {
              version: item.version,
              evidence: item.evidence,
              verifiedAt: item.verifiedAt,
              ruleSource: item.ruleSource,
              ruleSnapshot: item.ruleSnapshot,
              status: item.status,
            },
          ],
          evidence: "待新版本验证",
          verifiedAt: "待验证",
          status: "UNVERIFIED",
          enabled: false,
          requestKey,
        };
      }),
    );
    recordNote(id, `更新渠道规则草稿 · ${reason}`, requestKey);
  }
  return (
    <TravelPreviewContext.Provider
      value={{
        enabled,
        cities,
        attractions,
        channels,
        saveCity,
        saveAttraction,
        disableChannel,
        saveChannelRule,
        isSaleable,
      }}
    >
      {children}
    </TravelPreviewContext.Provider>
  );
}
export function useAdminTravel() {
  const value = useContext(TravelPreviewContext);
  if (!value) throw new Error("AdminTravelPreviewProvider is required");
  return value;
}
