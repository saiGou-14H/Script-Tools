import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RJSFSchema } from "@rjsf/utils";
import {
  captureProductRelease,
  type ProductReleasePreview,
} from "./lib/publisher-product-preview";
import { useWorkspace } from "./context";
import { api } from "./api";

export interface PublisherScript {
  id: string;
  versionId?: string;
  revision?: string;
  sourceDigest?: string;
  title: string;
  purpose: string;
  version: string;
  draftVersion?: string;
  contentStatus: "READY" | "SEALED" | "DRAFT";
  buildStatus: "SUCCEEDED" | "FAILED" | "NOT_BUILT";
  deployed: boolean;
  inputSchema: RJSFSchema | boolean;
}

export interface PublisherProduct {
  id: string;
  scriptId: string;
  title: string;
  description: string;
  category: string;
  delivery: string;
  icon: string;
  amountMinor: string | null;
  refundRule: "FULL_IF_UNMET" | "NO_REFUND_IF_UNMET";
  status: "ACTIVE" | "DRAFT" | "PAUSED" | "RETIRED";
  deploymentReady: boolean;
  releaseSnapshot?: ProductReleasePreview;
}

export interface PublisherPricePlan {
  id: string;
  serviceId: string;
  version: number;
  amountMinor: string;
  refundRule: PublisherProduct["refundRule"];
  maxServiceSeconds: number;
  validityDays: number;
  goal: string;
  verificationHours: number;
}

export interface PublisherProfile {
  publicName: string;
  description: string;
  contactEmail: string;
  payoutMask: string;
  payoutVerified: boolean;
}

const products: PublisherProduct[] = [
  {
    id: "table",
    scriptId: "table",
    title: "表格清洗",
    description: "清理与标准化卡片、表格类数据，支持格式统一与去重。",
    category: "数据处理",
    delivery:
      "生成可下载的 cleaned.csv；\n生成含输入行数与去重数量的统计摘要；\n文件通过格式与完整性校验。",
    icon: "table",
    amountMinor: "600",
    refundRule: "FULL_IF_UNMET",
    status: "ACTIVE",
    deploymentReady: true,
  },
  {
    id: "booking",
    scriptId: "booking",
    title: "景点预约",
    description: "提供景点预约的自动化脚本服务，按需完成预约操作。",
    category: "旅行预约",
    delivery: "取得经核验的预约结果及预约凭证。",
    icon: "travel",
    amountMinor: "800",
    refundRule: "FULL_IF_UNMET",
    status: "ACTIVE",
    deploymentReady: true,
  },
  {
    id: "files",
    scriptId: "files",
    title: "文件工具",
    description: "常用文件处理能力集合，如批量重命名、格式转换等。",
    category: "文件工具",
    delivery: "生成符合约定格式的文件。",
    icon: "file",
    amountMinor: null,
    refundRule: "FULL_IF_UNMET",
    status: "DRAFT",
    deploymentReady: false,
  },
];
const initialPlans: PublisherPricePlan[] = [
  {
    id: "table-v3",
    serviceId: "table",
    version: 3,
    amountMinor: "600",
    refundRule: "FULL_IF_UNMET",
    maxServiceSeconds: 300,
    validityDays: 7,
    goal: "生成符合约定 CSV",
    verificationHours: 1,
  },
  {
    id: "booking-v1",
    serviceId: "booking",
    version: 1,
    amountMinor: "800",
    refundRule: "FULL_IF_UNMET",
    maxServiceSeconds: 300,
    validityDays: 7,
    goal: "获得经核验的预约结果",
    verificationHours: 1,
  },
];

const tableSchema: RJSFSchema = {
  type: "object",
  properties: {
    source_file: { type: "string", title: "输入文件", minLength: 1 },
    deduplicate_by: {
      type: "string",
      title: "去重字段",
      enum: ["邮箱", "手机号", "全部字段"],
    },
  },
  required: ["source_file", "deduplicate_by"],
  additionalProperties: false,
};

const scripts: PublisherScript[] = [
  {
    id: "table",
    title: "表格清洗",
    purpose: "清洗与规范表格数据",
    version: "v1.2",
    draftVersion: "v1.3",
    contentStatus: "READY",
    buildStatus: "SUCCEEDED",
    deployed: true,
    inputSchema: tableSchema,
  },
  {
    id: "files",
    title: "文件处理",
    purpose: "文件格式转换与批量处理",
    version: "v0.4",
    draftVersion: "v0.5",
    contentStatus: "SEALED",
    buildStatus: "FAILED",
    deployed: false,
    inputSchema: {
      type: "object",
      properties: {
        source_file: { type: "string", title: "输入文件", minLength: 1 },
        output_format: {
          type: "string",
          title: "输出格式",
          enum: ["CSV", "JSON", "TXT"],
        },
      },
      required: ["source_file", "output_format"],
      additionalProperties: false,
    },
  },
  {
    id: "booking",
    title: "景点预约",
    purpose: "自动完成景点预约操作",
    version: "v1.0",
    draftVersion: "v1.1",
    contentStatus: "READY",
    buildStatus: "SUCCEEDED",
    deployed: false,
    inputSchema: {
      type: "object",
      properties: {
        visit_date: { type: "string", format: "date", title: "预约日期" },
        time_slot: {
          type: "string",
          title: "预约场次",
          enum: ["上午场", "下午场"],
        },
      },
      required: ["visit_date", "time_slot"],
      additionalProperties: false,
    },
  },
];

export function initialScriptFiles(
  script: PublisherScript,
): Record<string, string> {
  return {
    "main.py": 'def run(input):\n    return {"rows": 1200}\n',
    "requirements.txt": "# 固定依赖版本\npandas==2.3.3\n",
    "manifest.json": JSON.stringify(
      {
        schema_version: "2.0",
        script_id: script.id,
        version: (script.draftVersion || script.version).replace(/^v/, ""),
        language: "python",
        entrypoint: "main.py",
        integration_mode: "hooks",
        hook_protocol_version: "2.0",
        default_action: "clean",
        dependencies_lock: "requirements.txt",
        credential_requirements: [],
        network_requirements: { mode: "HTTP", domains: [], methods: ["GET"] },
        supported_execution_modes: ["docker", "qemu_kvm", "qemu_tcg"],
        input_schema: script.inputSchema,
        actions: {
          clean: {
            handler: "run",
            side_effects: "read_only",
            input_schema: script.inputSchema,
            output_schema: {
              type: "object",
              properties: { rows: { type: "integer" } },
              required: ["rows"],
            },
          },
        },
      },
      null,
      2,
    ),
  };
}

interface SavedScript {
  id: string;
  name: string;
  description: string;
  version_id: string;
  version: string;
  revision: string;
  content_status: PublisherScript["contentStatus"];
  source_digest: string;
  input_schema: RJSFSchema | boolean;
}

function fromSavedScript(saved: SavedScript): PublisherScript {
  return {
    id: saved.id,
    versionId: saved.version_id,
    revision: saved.revision,
    sourceDigest: saved.source_digest,
    title: saved.name,
    purpose: saved.description || "自定义脚本",
    version: saved.version,
    contentStatus: saved.content_status,
    buildStatus: "NOT_BUILT",
    deployed: false,
    inputSchema: saved.input_schema,
  };
}

interface PublisherPreviewValue {
  scripts: PublisherScript[];
  drafts: Record<string, Record<string, string>>;
  createScript: (
    title: string,
    files?: Record<string, string>,
  ) => Promise<PublisherScript>;
  saveDraft: (id: string, files: Record<string, string>) => Promise<void>;
  loadDraft: (id: string) => Promise<Record<string, string>>;
  loading: boolean;
  loadError: string;
  products: PublisherProduct[];
  saveProduct: (product: PublisherProduct, publishPreview?: boolean) => void;
  productDrafts: Record<string, PublisherProduct>;
  setProductStatus: (id: string, status: PublisherProduct["status"]) => void;
  pricePlans: PublisherPricePlan[];
  addPricePlan: (
    plan: Omit<PublisherPricePlan, "id" | "version">,
    requestKey: string,
  ) => void;
  profile: PublisherProfile;
  saveProfile: (profile: Partial<PublisherProfile>) => void;
}
const PublisherPreview = createContext<PublisherPreviewValue | null>(null);

export function PublisherPreviewProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { bootstrap } = useWorkspace();
  const [records, setRecords] = useState(
    bootstrap.data_mode === "prototype" ? scripts : [],
  );
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>(
    {},
  );
  const [productRecords, setProducts] = useState(() => {
    if (bootstrap.data_mode !== "prototype") return [];
    return products.map((product) => {
      const script = scripts.find((item) => item.id === product.scriptId);
      const plan = initialPlans.find((item) => item.serviceId === product.id);
      return product.status === "ACTIVE" && script && plan
        ? { ...product, releaseSnapshot: captureProductRelease(script, plan) }
        : product;
    });
  });
  const [productDrafts, setProductDrafts] = useState<
    Record<string, PublisherProduct>
  >({});
  const [pricePlans, setPricePlans] = useState(
    bootstrap.data_mode === "prototype" ? initialPlans : [],
  );
  const [profile, setProfile] = useState<PublisherProfile>({
    publicName: bootstrap.data_mode === "prototype" ? "林间工具" : "",
    description:
      bootstrap.data_mode === "prototype"
        ? "提供景点预约、票务查询等实用脚本服务，帮助你更高效地安排行程。"
        : "",
    contactEmail:
      bootstrap.data_mode === "prototype" ? "contact@linjian.tools" : "",
    payoutMask: bootstrap.data_mode === "prototype" ? "********1234" : "",
    payoutVerified: bootstrap.data_mode === "prototype",
  });
  const pendingKeys = useRef(new Map<string, string>());
  function commandKey(scope: string, body: unknown) {
    const identity = scope + JSON.stringify(body);
    if (!pendingKeys.current.has(identity))
      pendingKeys.current.set(identity, crypto.randomUUID());
    return { identity, key: pendingKeys.current.get(identity)! };
  }
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const ownerId = bootstrap.user?.id;
  const isPublisher = bootstrap.user?.roles.includes("PUBLISHER");
  useEffect(() => {
    let active = true;
    pendingKeys.current.clear();
    setDrafts({});
    setRecords(bootstrap.data_mode === "prototype" ? scripts : []);
    setLoadError("");
    if (!ownerId || !isPublisher) return;
    setLoading(true);
    api<SavedScript[]>("/me/scripts")
      .then((saved) => {
        if (active)
          setRecords((previous) => {
            const ids = new Set(saved.map((item) => item.id));
            const loaded = saved.map((item) => {
              const existing = previous.find((record) => record.id === item.id);
              return existing?.revision &&
                BigInt(existing.revision) > BigInt(item.revision)
                ? existing
                : fromSavedScript(item);
            });
            return [...loaded, ...previous.filter((item) => !ids.has(item.id))];
          });
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [ownerId, isPublisher, bootstrap.data_mode]);

  async function loadDraft(id: string) {
    if (drafts[id]) return drafts[id];
    const script = records.find((item) => item.id === id);
    if (!script) throw new Error("脚本不存在");
    if (!script.versionId) return initialScriptFiles(script);
    const source = await api<{
      files: Record<string, string>;
      revision: string;
    }>(`/script-versions/${script.versionId}/source`);
    setDrafts((previous) => ({ ...previous, [id]: source.files }));
    setRecords((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, revision: source.revision } : item,
      ),
    );
    return source.files;
  }

  async function saveDraft(id: string, files: Record<string, string>) {
    const script = records.find((item) => item.id === id);
    if (!script) throw new Error("脚本不存在");
    if (script.versionId) {
      const body = { files };
      const pending = commandKey(
        `save.${script.versionId}.${script.revision}.`,
        body,
      );
      const saved = await api<SavedScript>(
        `/script-versions/${script.versionId}`,
        {
          method: "PATCH",
          headers: {
            "Idempotency-Key": pending.key,
            "If-Match": `"${script.revision}"`,
          },
          body: JSON.stringify(body),
        },
      );
      pendingKeys.current.delete(pending.identity);
      setRecords((previous) =>
        previous.map((item) =>
          item.id === id ? fromSavedScript(saved) : item,
        ),
      );
    } else requirePreview();
    setDrafts((previous) => ({ ...previous, [id]: { ...files } }));
  }

  function requirePreview() {
    if (bootstrap.data_mode !== "prototype")
      throw new Error("对应业务接口尚未接入");
  }
  function saveProduct(product: PublisherProduct, publishPreview = false) {
    requirePreview();
    const script = records.find((item) => item.id === product.scriptId);
    if (!script) throw new Error("关联的脚本不存在");
    let updated = product;
    if (publishPreview) {
      const candidates = pricePlans
        .filter((item) => item.serviceId === product.id)
        .sort((left, right) => right.version - left.version);
      const selected = product.releaseSnapshot;
      const plan = selected
        ? candidates.find((item) => item.id === selected.pricePlanId)
        : candidates[0];
      if (!plan) throw new Error("绑定的价格方案不存在");
      if (
        script.contentStatus !== "READY" ||
        !product.deploymentReady ||
        !profile.payoutVerified
      )
        throw new Error("请先完成发布检查清单");
      if (
        selected &&
        (selected.scriptId !== script.id ||
          selected.scriptVersion !== script.version)
      )
        throw new Error("绑定版本已变化，请重新核对");
      if (product.refundRule !== plan.refundRule)
        throw new Error("退款选项须与固定价格方案一致");
      updated = {
        ...product,
        amountMinor: plan.amountMinor,
        releaseSnapshot: captureProductRelease(script, plan),
      };
    }
    setProductDrafts((previous) => ({
      ...previous,
      [updated.id]: structuredClone(updated),
    }));
    setProducts((previous) => {
      const existing = previous.find((item) => item.id === updated.id);
      if (!existing)
        return [
          ...previous,
          {
            ...structuredClone(updated),
            status: publishPreview ? "ACTIVE" : "DRAFT",
          },
        ];
      return publishPreview || existing.status === "DRAFT"
        ? previous.map((item) =>
            item.id === updated.id ? structuredClone(updated) : item,
          )
        : previous;
    });
  }
  function addPricePlan(
    plan: Omit<PublisherPricePlan, "id" | "version">,
    requestKey: string,
  ) {
    requirePreview();
    if (!productRecords.some((item) => item.id === plan.serviceId))
      throw new Error("服务商品不存在");
    setPricePlans((previous) =>
      previous.some((item) => item.id === requestKey)
        ? previous
        : [
            {
              ...plan,
              id: requestKey,
              version:
                Math.max(
                  0,
                  ...previous
                    .filter((item) => item.serviceId === plan.serviceId)
                    .map((item) => item.version),
                ) + 1,
            },
            ...previous,
          ],
    );
  }
  async function createScript(title: string, files?: Record<string, string>) {
    const draft: PublisherScript = {
      id: `script-${crypto.randomUUID()}`,
      title,
      purpose: "自定义脚本",
      version: "0.1.0",
      contentStatus: "DRAFT",
      buildStatus: "NOT_BUILT",
      deployed: false,
      inputSchema: { type: "object" },
    };
    let source = files;
    if (!source || !Object.hasOwn(source, "manifest.json")) {
      const initial = initialScriptFiles(draft);
      if (source) {
        const entrypoint = Object.keys(source)[0];
        const manifest = JSON.parse(initial["manifest.json"]);
        delete initial["main.py"];
        manifest.entrypoint = entrypoint;
        if (/\.[cm]?js$/i.test(entrypoint)) {
          manifest.language = "nodejs";
          manifest.dependencies_lock = "package-lock.json";
          delete initial["requirements.txt"];
          const nodePackage = {
            name: draft.id,
            version: "0.1.0",
            private: true,
            type: /\.mjs$/i.test(entrypoint) ? "module" : "commonjs",
          };
          initial["package.json"] = JSON.stringify(nodePackage, null, 2);
          initial["package-lock.json"] = JSON.stringify(
            {
              name: draft.id,
              version: "0.1.0",
              lockfileVersion: 3,
              requires: true,
              packages: { "": { name: draft.id, version: "0.1.0" } },
            },
            null,
            2,
          );
        }
        initial["manifest.json"] = JSON.stringify(manifest, null, 2);
      }
      source = { ...initial, ...source };
    }
    const body = { name: title, description: draft.purpose, files: source };
    const pending = commandKey("create.", body);
    const saved = await api<SavedScript>("/scripts", {
      method: "POST",
      headers: { "Idempotency-Key": pending.key },
      body: JSON.stringify(body),
    });
    pendingKeys.current.delete(pending.identity);
    const script = fromSavedScript(saved);
    setRecords((previous) => [
      script,
      ...previous.filter((item) => item.id !== script.id),
    ]);
    setDrafts((previous) => ({ ...previous, [script.id]: source }));
    return script;
  }
  return (
    <PublisherPreview.Provider
      value={{
        scripts: records,
        drafts,
        createScript,
        saveDraft,
        loadDraft,
        loading,
        loadError,
        products: productRecords,
        saveProduct,
        productDrafts,
        setProductStatus: (id, status) => {
          requirePreview();
          setProducts((previous) =>
            previous.map((item) =>
              item.id === id ? { ...item, status } : item,
            ),
          );
        },
        pricePlans,
        addPricePlan,
        profile,
        saveProfile: (value) => {
          requirePreview();
          setProfile((current) => ({ ...current, ...value }));
        },
      }}
    >
      {children}
    </PublisherPreview.Provider>
  );
}

export function usePublisherPreview() {
  const value = useContext(PublisherPreview);
  if (!value) throw new Error("PublisherPreviewProvider is missing");
  return value;
}
