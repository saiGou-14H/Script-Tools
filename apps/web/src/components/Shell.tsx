import { Avatar, Badge, Button, Dropdown, Input, Tooltip } from "antd";
import {
  BellOutlined,
  DownOutlined,
  SearchOutlined,
  UserOutlined,
} from "@ant-design/icons";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { menuForRole, pagePath, pages, PageId, roles } from "../catalog";
import { useWorkspace } from "../context";
import { Icon, pageIcons } from "./Icon";
import type { Role } from "../types";

const pageMenuIcons: Partial<Record<PageId, Partial<Record<PageId, string>>>> =
  {
    C12: { C12: "folder", C13: "info" },
    C13: { C13: "calendar" },
  };

export function Shell({ pageId }: { pageId: PageId }) {
  const { role, setRole, bootstrap } = useWorkspace();
  const navigate = useNavigate();
  const location = useLocation();
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
  if (pageId === "C02")
    consumerMenu.splice(1, 5, "C04", "C06", "C22", "P02", "P04");
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
            pageId.startsWith("O") &&
            pageId !== "O01" &&
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
    role === "ADMIN" && pageId.startsWith("O") && pageId !== "O01";
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
          <span className="brand-code">&lt;/&gt;</span>
          <strong>Script Tools</strong>
          <span>通用脚本服务平台</span>
        </Link>
        <Input
          className="global-search"
          prefix={<SearchOutlined />}
          placeholder={
            role === "ADMIN"
              ? "搜索订单、用户、服务或预约编号"
              : "搜索脚本、服务或订单"
          }
          onPressEnter={(event) =>
            navigate(
              `${role === "ADMIN" ? "/admin/orders" : "/market"}?q=${encodeURIComponent(event.currentTarget.value)}`,
            )
          }
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
              {role === "GUEST" && ["P01", "P07"].includes(pageId)
                ? "当前工作区　"
                : role === "GUEST"
                  ? "当前身份　"
                  : compactAdmin &&
                      !["O06", "O07", "O14", "O16", "O19"].includes(pageId)
                    ? ""
                    : "当前工作区　"}
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
                  <Badge dot>
                    <BellOutlined />
                  </Badge>
                </Button>
              </Tooltip>
              <Avatar
                className="account-avatar"
                icon={<UserOutlined />}
                onClick={() => navigate("/me/settings/account")}
              />
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
                  to={pagePath(page.id)}
                >
                  <Icon
                    name={
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
            <Link to="/help">
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
          !(pageId === "P02" && role !== "GUEST") && (
            <div className="breadcrumb">
              {pageId === "P01" ? (
                <Icon name="home" />
              ) : ["C01", "C12", "C13"].includes(pageId) ? (
                <>
                  <Link className="consumer-home-breadcrumb" to="/me/home">
                    <Icon name="home" />
                    我的首页
                  </Link>
                  <span>›</span>
                </>
              ) : ancestors.length > 0 ? (
                ancestors.map((id) => (
                  <span className="breadcrumb-link" key={id}>
                    <Link to={pagePath(id)}>{pages[id].title}</Link>
                    <span>›</span>
                  </span>
                ))
              ) : (
                <>
                  <Link
                    to={pagePath(
                      roles.find((item) => item.id === role)!.home as PageId,
                    )}
                  >
                    {breadcrumbRoot ||
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
