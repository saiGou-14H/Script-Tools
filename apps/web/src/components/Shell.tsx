import {
  Avatar,
  Badge,
  Button,
  Dropdown,
  Input,
  Tooltip,
  type InputRef,
} from "antd";
import { useEffect, useRef, useState } from "react";
import {
  BellOutlined,
  DownOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { menuForRole, pagePath, pages, PageId, roles } from "../catalog";
import { useWorkspace } from "../context";
import { Icon, pageIcons, type IconName } from "./Icon";
import type { Role } from "../types";
import { usePrototype } from "../prototype";
import { executionReturnPath } from "../lib/execution-navigation";

const guestAttractionMenuIcons: Partial<Record<PageId, string>> = {
  P02: "stack",
  P06: "help",
};

const pageMenuIcons: Partial<Record<PageId, Partial<Record<PageId, string>>>> =
  {
    P02: {
      C04: "file", C06: "stack", C22: "ticket-stub", C10: "clock", C12: "stack",
      C13: "hourglass", C14: "link", C16: "message",
    },
    P03: {
      P02: "order", C04: "file", C06: "layers", C22: "ticket",
      C12: "folder", C13: "clock", C16: "message",
    },
    P05: {
      C04: "file", C06: "stack", C22: "ticket-stub", C10: "list",
      C12: "file", C13: "clock", C16: "message",
    },
    C02: {
      C04: "cart", C06: "layers", C22: "ticket", C12: "folder",
      C13: "clock", C16: "message", C17: "bell",
    },
    C03: {
      C04: "file", C06: "order", C22: "ticket", C12: "chart",
      C13: "clock", C16: "message", C17: "bell",
    },
    S03: {
      S07: "order", S09: "money", S10: "calendar", S05: "layers",
      S06: "cube", S11: "chart", S12: "history", S13: "database", C21: "user",
    },
    S01: {
      S01: "home", S02: "code", S05: "layers", S06: "cube",
      S07: "order", S09: "ticket", S10: "file", S11: "chart",
      S12: "audit", S13: "database", C21: "user",
    },
    O01: {
      O03: "stack", O05: "stack", O06: "file", O08: "payment",
      O10: "reconciliation", O11: "database", O12: "settings", O13: "list",
      O14: "cube", O15: "line-chart", O17: "send", O20: "database", C21: "user",
    },
    P04: {
      C04: "file",
      C06: "stack",
      C22: "ticket-stub",
      C10: "file",
      C12: "chart",
      C13: "clock",
      C16: "message",
      C19: "shield",
      P02: "store",
      P06: "book",
    },
    P06: {
      C06: "layers",
      C22: "ticket",
      C12: "chart",
      C13: "clock",
      C16: "message",
      C19: "history",
      C21: "user",
      S01: "home",
      S07: "cube",
      S09: "ticket",
      S05: "layers",
      S13: "money",
      O06: "file",
      O10: "layers",
      O12: "money",
      O13: "server",
      O14: "cube",
      O15: "chart",
      O20: "database",
    },
    O10: {
      O01: "home", O03: "container", O04: "ticket", O05: "layers",
      O06: "file", O08: "payment", O10: "chart", O11: "team", O12: "database",
      O13: "server", O14: "box", O15: "warning", O19: "shield", C21: "user",
    },
    O11: {
      O01: "home", O03: "container", O04: "chart", O05: "sync",
      O06: "file", O08: "money", O10: "upload", O11: "payment", O12: "file",
      O13: "box", O14: "box", O15: "tool", O19: "shield", C21: "user",
    },
    O12: {
      O01: "chart", O03: "box", O04: "chart", O05: "sync",
      O06: "file", O08: "money", O10: "upload", O11: "upload", O12: "database",
      O13: "box", O14: "box", O15: "shield", O19: "shield", C21: "user",
    },
    O06: {
      O01: "chart", O02: "user", O03: "layers", O05: "laptop",
      O06: "file", O08: "payment", O10: "database", O12: "sliders",
      O13: "layers", O14: "server", O15: "warning", O19: "shield",
      O20: "database", C21: "user",
    },
    O07: {
      O01: "home", O02: "team", O03: "layers", O05: "market",
      O06: "file", O08: "payment", O10: "database", O12: "settings",
      O13: "server", O14: "box", O15: "warning", O19: "shield",
      O20: "database", C21: "user",
    },
    O08: {
      O01: "chart", O02: "team", O03: "box", O05: "layers",
      O06: "file", O08: "payment", O10: "sync", O12: "file",
      O13: "team", O14: "server", O15: "warning", O19: "shield",
      O20: "database", C21: "user",
    },
    O09: {
      O01: "home", O02: "team", O03: "box", O04: "chart", O05: "sync",
      O06: "file", O08: "payment", O10: "money", O12: "file",
      O13: "box", O14: "box", O15: "sync", O19: "lock",
      O20: "box", C21: "user",
    },
    S07: {
      S01: "home", S07: "order", S09: "lock", S10: "file",
      S05: "layers", S06: "server", S11: "chart", S12: "warning",
      S13: "database", C21: "user",
    },
    S08: {
      S01: "home", S07: "order", S09: "ticket", S10: "file",
      S05: "layers", S06: "server", S11: "chart", S12: "shield",
      S13: "database", C21: "user",
    },
    S09: {
      S01: "order", S07: "box", S09: "ticket", S10: "file",
      S05: "play", S06: "server", S11: "chart", S12: "warning",
      S13: "database", C21: "user",
    },
    S10: {
      S01: "chart", S07: "box", S09: "layers", S10: "file",
      S05: "play", S06: "server", S11: "chart", S12: "warning",
      S13: "database", C21: "user",
    },
    S13: {
      S01: "home",
      S02: "code",
      S05: "layers",
      S06: "upload",
      S07: "order",
      S09: "ticket",
      S11: "chart",
      S12: "tool",
      S13: "wallet",
      C21: "user",
    },
    S14: {
      S01: "home",
      S05: "play",
      S06: "layers",
      S11: "chart",
      S12: "warning",
      S13: "wallet",
      C21: "user",
    },
    S15: {
      S01: "market",
      S02: "code-brackets",
      S05: "stack",
      S06: "database",
      S07: "order",
      S09: "ticket",
      S10: "reconciliation",
      S11: "chart",
      S12: "audit",
      S13: "wallet",
      C21: "user",
    },
    S11: {
      S01: "home",
      S05: "shield",
      S06: "layers",
      S11: "chart",
      S12: "warning",
      S13: "database",
      C21: "user",
    },
    S12: {
      S01: "home",
      S05: "layers",
      S11: "chart",
      S12: "shield",
      S13: "database",
      C21: "user",
    },
    S05: {
      S01: "home",
      S05: "layers",
      S11: "chart",
      S12: "tool",
      S13: "wallet",
      S15: "settings",
      C21: "user",
    },
    S06: {
      S01: "home",
      S05: "play",
      S06: "container",
      S11: "chart",
      S12: "shield",
      S13: "database",
      S15: "settings",
      C21: "user",
    },
    C08: {
      C04: "file",
      C10: "clock",
      C06: "stack",
      C13: "warning",
      C16: "message",
      C19: "shield",
      C22: "ticket",
    },
    C09: {
      C04: "file",
      C06: "stack",
      C12: "file",
      C13: "info",
      C16: "message",
      C22: "ticket",
    },
    C10: {
      C04: "file",
      C15: "user",
      C06: "stack",
      C10: "file",
      C12: "chart",
      C13: "calendar",
      C16: "mail",
      C19: "history",
      C22: "ticket",
    },
    C11: {
      C04: "file",
      C15: "user",
      C16: "message",
      C19: "history",
      C06: "stack",
      C10: "file",
      C12: "chart",
      C13: "clock",
      C22: "ticket",
    },
    C14: {
      C06: "stack",
      C12: "folder",
      C13: "clock",
      C16: "message",
      C19: "support",
      C22: "ticket-stub",
    },
    C15: {
      C06: "stack",
      C12: "chart",
      C13: "clock",
      C15: "user",
      C16: "message",
      C19: "refund",
      C22: "ticket-stub",
    },
    C12: { C04: "file", C06: "lock", C12: "folder", C13: "info", C16: "message", C19: "history", C22: "ticket-stub" },
    C13: { C04: "file", C06: "stack", C12: "file", C13: "calendar", C16: "message", C19: "plus-circle", C22: "ticket-stub" },
    C16: {
      C16: "mail",
      C17: "settings",
      C06: "stack",
      C12: "folder",
      C13: "clock",
      C19: "money",
      C22: "ticket-stub",
    },
    C17: {
      C16: "mail",
      C06: "stack",
      C13: "clock",
      C19: "refund",
      C22: "ticket-stub",
    },
    C18: {
      C06: "box",
      C13: "clock",
      C16: "message",
      C19: "money",
      C22: "ticket-stub",
    },
    C19: { C06: "stack", C12: "folder", C19: "shield", C22: "ticket-stub" },
    C20: { C06: "stack", C12: "box", C19: "refund", C22: "ticket-stub" },
    C22: {
      C06: "stack",
      C12: "chart",
      C13: "file",
      C15: "user",
      C19: "money",
      C22: "ticket-stub",
    },
    C04: {
      C04: "file",
      C06: "box",
      C12: "chart",
      C16: "message",
      C19: "money",
      C22: "ticket",
    },
    C05: {
      C04: "file",
      C06: "layers",
      C12: "folder",
      C13: "info",
      C19: "refund",
      C22: "ticket",
    },
    C06: {
      C06: "lock",
      C12: "box",
      C13: "clock",
      C19: "shield",
      C22: "ticket",
    },
    C07: { C06: "layers", C12: "folder", C13: "clock", C22: "ticket" },
  };

const accountMenuIcons: Partial<Record<Role, Partial<Record<PageId, IconName>>>> = {
  USER: {
    C04: "file",
    C06: "stack",
    C22: "ticket-stub",
    C10: "reconciliation",
    C12: "cube",
    C13: "clock",
    C16: "message",
    C19: "support",
  },
  PUBLISHER: {
    S01: "upload-tray",
    S07: "cube",
    S02: "code-brackets",
    S05: "play",
    S06: "database",
    S11: "chart",
    S12: "shield",
    S13: "wallet",
    C21: "user",
  },
  ADMIN: {
    O01: "chart",
    O03: "market",
    O05: "stack",
    O06: "file",
    O08: "money",
    O10: "reconciliation",
    O11: "team",
    O12: "file",
    O13: "database",
    O14: "cube",
    O15: "bolt",
    O17: "send",
    O20: "database",
    C21: "user",
  },
};

export function Shell({ pageId }: { pageId: PageId }) {
  const { role, setRole, bootstrap } = useWorkspace();
  const { unreadNotificationCount } = usePrototype();
  const navigate = useNavigate();
  const location = useLocation();
  const searchQuery = ["P02", "P06", "S02", "S05", "O06"].includes(pageId)
    ? new URLSearchParams(location.search).get("q") || ""
    : "";
  const [searchText, setSearchText] = useState(searchQuery);
  useEffect(() => {
    setSearchText(searchQuery);
  }, [location.pathname, searchQuery, role]);
  const searchRef = useRef<InputRef>(null);
  const quickSearch = (["P02", "P03", "P04", "C02"].includes(pageId) && role === "USER") || [
    "S01",
    "S15",
    "C05",
    "C06",
    "C08",
    "C10",
    "C11",
    "C14",
    "C15",
  ].includes(pageId);
  useEffect(() => {
    if (!quickSearch) return;
    function focusSearch(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey))
        return;
      event.preventDefault();
      searchRef.current?.focus({ cursor: "all" });
    }
    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, [quickSearch]);
  const consumerMenu: PageId[] = [
    "C01",
    "P02",
    "P04",
    "C04",
    "C06",
    "C22",
    "C08",
    "C10",
    "C12",
    "C13",
    "C14",
    "C15",
    "C16",
    "C17",
    "C18",
    "C19",
    "C21",
    "P06",
  ];
  const publisherMenu: PageId[] = [
    "S01",
    "S07",
    "S09",
    "S10",
    "S02",
    "S05",
    "S06",
    "S16",
    "S11",
    "S12",
    "S13",
    "S15",
    "C21",
    "P06",
  ];
  if (["C02", "C17", "C21", "P06"].includes(pageId))
    consumerMenu.splice(1, 5, "C04", "C06", "C22", "P02", "P04");
  if (["C07", "C14"].includes(pageId)) {
    consumerMenu.splice(5, 1);
    consumerMenu.splice(consumerMenu.length - 1, 0, "C22");
  }
  if (["S01", "S13", "S15"].includes(pageId))
    publisherMenu.splice(
      0,
      publisherMenu.length,
      "S01",
      "S02",
      "S05",
      "S06",
      "S07",
      "S09",
      "S10",
      "S11",
      "S12",
      "S13",
      "S15",
      "S16",
      "C21",
      "P06",
    );
  const order =
    role === "USER"
      ? consumerMenu
      : role === "PUBLISHER"
        ? publisherMenu
        : role === "ADMIN" &&
            (pageId.startsWith("O") || pageId === "C21" || pageId === "P06") &&
            pageId !== "O02" &&
            pageId !== "O14"
          ? [
              "O01",
              "O02",
              "O03",
              "O04",
              "O05",
              "O21",
              "O06",
              "O08",
              "O10",
              "O11",
              "O12",
              "O13",
              "O14",
              "O15",
              "O16",
              "O17",
              "O18",
              "O19",
              "O20",
              "C21",
              "P06",
            ]
          : [];
  const compactAdmin =
    role === "ADMIN" &&
    (pageId.startsWith("O") || pageId === "C21" || pageId === "P06") &&
    pageId !== "O01";
  const menu = menuForRole(role).sort(
    (a, b) => order.indexOf(a.id) - order.indexOf(b.id),
  );
  const groups: { key: string; name: string; pages: typeof menu }[] = [];
  for (const page of menu) {
    const previous = groups[groups.length - 1];
    if (previous?.name === page.group) previous.pages.push(page);
    else groups.push({ key: page.id, name: page.group, pages: [page] });
  }
  const roleName = roles.find((item) => item.id === role)!.name;
  const breadcrumbRoot = (
    {
      P07: "首页",
      C17: "我的首页",
      C14: "我的首页",
      C18: "我的首页",
      C19: "我的首页",
      C10: "我的首页",
      S01: "首页",
      S05: "发布者工作台",
      S06: "发布者工作台",
      S07: "发布经营",
      S09: "发布经营",
      S10: "发布经营",
      S11: "首页",
      S12: "首页",
      S15: "发布经营",
      O02: "首页",
      O03: "运营",
      O10: "首页",
      O11: "运营",
      O12: "首页",
      O04: "业务场景",
      O05: "首页",
      O13: "首页",
      O14: "运营 / 基础设施",
      O15: "运营 / 基础设施",
      O17: "首页",
      O18: "首页",
      O19: "平台",
      O20: "平台",
      O21: "业务场景",
    } as Partial<Record<PageId, string>>
  )[pageId];
  let active: PageId = pageId;
  while (
    pageId !== "C02" &&
    pages[active].kind === "detail" &&
    pages[active].parent
  )
    active = pages[active].parent as PageId;
  const ancestors: PageId[] = [];
  let ancestor = pages[pageId].parent as PageId | null;
  while (ancestor) {
    ancestors.unshift(ancestor);
    ancestor = pages[ancestor].parent as PageId | null;
  }
  function switchRole(next: Role) {
    if (
      next === "PUBLISHER" &&
      bootstrap.user &&
      !bootstrap.user.roles.includes(next)
    ) {
      navigate("/publisher");
      return;
    }
    if (next !== "GUEST" && !bootstrap.user?.roles.includes(next)) {
      navigate(
        `/auth?workspace=${next}&returnTo=${encodeURIComponent(pagePath(roles.find((item) => item.id === next)!.home as PageId))}`,
      );
      return;
    }
    setRole(next);
    navigate(pagePath(roles.find((item) => item.id === next)!.home as PageId));
  }
  return (
    <div
      className={`app-shell role-${role} page-${pageId} ${compactAdmin ? "admin-workspace" : ""}`}
    >
      <header className="topbar">
        <Link
          to={
            role === "GUEST"
              ? "/"
              : pagePath(roles.find((item) => item.id === role)!.home as PageId)
          }
          className="brand"
        >
          {pageId === "O01" ? (
            <Icon name="send-solid" />
          ) : (
            <span className="brand-code">&lt;/&gt;</span>
          )}
          <strong>Script Tools</strong>
          <span>通用脚本服务平台</span>
        </Link>
        <Input
          value={searchText}
          onChange={(event) => setSearchText(event.target.value)}
          ref={searchRef}
          className="global-search"
          prefix={<SearchOutlined />}
          suffix={quickSearch ? <kbd>Ctrl K</kbd> : undefined}
          placeholder={
            pageId === "P06"
              ? "搜索功能、文档或常见问题"
              : pageId === "P02" && role === "USER"
                ? "搜索用途或服务，如：表格清洗、文件处理、景点预约"
                : pageId === "P04"
                  ? role === "GUEST"
                    ? "搜索脚本、工具或景点"
                    : "搜索脚本、工具、景点或功能"
                  : pageId === "P05"
                    ? role === "GUEST"
                      ? "搜索脚本、工具或景点服务"
                      : "搜索脚本、工具或景点"
                    : pageId === "S02"
                      ? "搜索脚本名称、用途或版本号"
                      : pageId === "S05"
                        ? "搜索脚本、版本或构建编号"
                        : pageId === "S15"
                          ? "搜索脚本、服务商品、订单或帮助内容"
                          : pageId === "S01"
                            ? "搜索脚本、服务或订单"
                            : role === "ADMIN"
                              ? "搜索订单、用户、服务或预约编号"
                              : quickSearch
                                ? "搜索脚本、工具或景点"
                                : "搜索脚本、服务或订单"
          }
          onPressEnter={(event) => {
            if (pageId === "S02" || pageId === "S05") {
              const search = new URLSearchParams(location.search);
              const text = event.currentTarget.value.trim();
              if (text) search.set("q", text);
              else search.delete("q");
              if (pageId === "S05") search.delete("record");
              navigate(`${pageId === "S02" ? "/publisher/scripts" : "/publisher/builds"}?${search}`);
              return;
            }
            navigate(
              pageId === "P06"
                ? `/help?workspace=${role}&q=${encodeURIComponent(event.currentTarget.value)}`
                : `${role === "ADMIN" ? "/admin/orders" : "/market"}?q=${encodeURIComponent(event.currentTarget.value)}`,
            );
          }}
        />
        <div className="topbar-actions">
          <Dropdown
            trigger={["click"]}
            menu={{
              items: roles.map((item) => ({ key: item.id, label: item.name })),
              onClick: (item) => switchRole(item.key as Role),
            }}
          >
            <Button className="workspace-button">
              {["C21", "O01"].includes(pageId) && role === "ADMIN" && (
                <Icon name={pageId === "O01" ? "shield" : "stack"} />
              )}
              {pageId === "P05" && role === "USER" && <Icon name="user" />}
              {pageId === "P02" && role === "GUEST" && <Icon name="user" />}
              {
                pageId === "O01"
                  ? ""
                  : pageId === "P02"
                    ? role === "GUEST"
                      ? "当前身份："
                      : "当前工作区："
                    : pageId === "P04"
                      ? "当前工作区："
                      : role === "GUEST" &&
                          ["P01", "P05", "P07", "P06"].includes(pageId)
                        ? "当前工作区　"
                        : role === "GUEST"
                          ? "当前身份　"
                          : compactAdmin &&
                              !["O06", "O07", "O14", "O16", "O19", "C21"].includes(
                                pageId,
                              )
                            ? ""
                            : "当前工作区　"
              }
              <b>{roleName}</b>
              <DownOutlined />
            </Button>
          </Dropdown>
          {role === "GUEST" ? (
            <>
              <Button onClick={() => navigate("/auth")}>登录</Button>
              <Button
                type="primary"
                onClick={() => navigate("/auth?tab=register")}
              >
                注册
              </Button>
            </>
          ) : (
            <>
              {pageId === "C01" && (
                <Button onClick={() => switchRole("PUBLISHER")}>
                  切换为发布者
                </Button>
              )}
              <Tooltip title="消息中心">
                <Button
                  aria-label="消息中心"
                  type="text"
                  shape="circle"
                  onClick={() => navigate("/me/notifications")}
                >
                  <Badge
                    className="notification-header-badge"
                    dot={
                      unreadNotificationCount !== null &&
                      unreadNotificationCount > 0
                    }
                  >
                    <BellOutlined />
                  </Badge>
                </Button>
              </Tooltip>
              <Link
                className="account-avatar-link"
                aria-label="打开账户设置"
                to={
                  role === "USER"
                    ? "/me/settings/account"
                    : `/me/settings/account?workspace=${role}`
                }
              >
                <Avatar
                  className="account-avatar"
                  icon={
                    pageId === "C21" && role !== "ADMIN"
                      ? <Icon name="person-solid" />
                      : <UserOutlined />
                  }
                />
              </Link>
            </>
          )}
        </div>
      </header>
      <aside className="sidebar" aria-label={`${roleName}导航`}>
        <nav>
          {groups.map((group) => (
            <div className="nav-group" key={group.key}>
              <div className="nav-group-label">{group.name}</div>
              {group.pages.map((page) => (
                <Link
                  key={page.id}
                  className={`nav-item ${active === page.id ? "selected" : ""}`}
                  to={
                    page.id === "P06" && role !== "GUEST"
                      ? `/help?workspace=${role}`
                      : pagePath(page.id)
                  }
                >
                  <Icon
                    name={
                      (pageId === "C21"
                        ? accountMenuIcons[role]?.[page.id]
                        : undefined) ||
                      (pageId === "P04" && role === "GUEST"
                        ? guestAttractionMenuIcons[page.id]
                        : undefined) ||
                      pageMenuIcons[pageId]?.[page.id] ||
                      pageIcons[page.id] ||
                      "file"
                    }
                  />
                  <span>{page.title}</span>
                  {page.id === "S16" && <small>P1</small>}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        {pageId === "P01" && (
          <Link className="home-sidebar-help" to="/help">
            <Icon name="help" />
            帮助
          </Link>
        )}
        {["C01", "S01"].includes(pageId) && (
          <div className="consumer-sidebar-footer">
            <Link to={`/help?workspace=${role}`}>
              <Icon name="help" />
              帮助
            </Link>
            <Link to="/me/settings/account">
              <Icon name="settings" />
              账户设置
            </Link>
          </div>
        )}
      </aside>
      <main className="main-content" key={`${role}-${location.pathname}`}>
        {pageId !== "C08" &&
          pageId !== "C04" &&
          pageId !== "C16" &&
          pageId !== "S02" &&
          pageId !== "S13" &&
          pageId !== "P03" &&
          pageId !== "P05" &&
          !(pageId === "P04" && role === "USER") &&
          !(pageId === "P06" && role === "USER") &&
          !(pageId === "P02" && role !== "GUEST") && (
            <div className="breadcrumb">
              {pageId === "P01" ? (
                <Icon name="home" />
              ) : ["C01", "C06", "C12", "C13", "C15"].includes(pageId) ||
                (pageId === "C21" && role === "USER") ? (
                <>
                  <Link className="consumer-home-breadcrumb" to="/me/home">
                    <Icon name="home" />
                    {pageId === "C15" ? "首页" : "我的首页"}
                  </Link>
                  <span>›</span>
                </>
              ) : ancestors.length > 0 ? (
                <>
                  {["C07", "C11", "C20"].includes(pageId) && (
                    <>
                      <Link to="/me/home">
                        {["C07", "C11"].includes(pageId)
                          ? "我的服务"
                          : "我的首页"}
                      </Link>
                      <span>›</span>
                    </>
                  )}
                  {ancestors.map((id) => (
                    <span className="breadcrumb-link" key={id}>
                      <Link to={
                        id === "C08" && pageId === "C09"
                          ? executionReturnPath(new URLSearchParams(location.search).get("returnTo"), "tasks") || pagePath(id)
                          : id === "C10" && pageId === "C11"
                            ? executionReturnPath(new URLSearchParams(location.search).get("returnTo"), "runs") || pagePath(id)
                            : pagePath(id)
                      }>{pages[id].title}</Link>
                      <span>›</span>
                    </span>
                  ))}
                </>
              ) : (
                <>
                  <Link
                    to={pagePath(
                      roles.find((item) => item.id === role)!.home as PageId,
                    )}
                  >
                    {(pageId === "P06" ? "首页" : breadcrumbRoot) ||
                      (role === "GUEST"
                        ? "平台首页"
                        : role === "USER"
                          ? "我的服务"
                          : role === "PUBLISHER"
                            ? "我的脚本"
                            : "首页")}
                  </Link>
                  <span>›</span>
                </>
              )}
              <strong>{pages[pageId].title}</strong>
            </div>
          )}
        <Outlet />
      </main>
    </div>
  );
}
