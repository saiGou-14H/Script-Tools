import { lazy, Suspense, useEffect, useState, type ReactElement } from "react";
import { Alert, Button, Result, Skeleton, Spin } from "antd";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, setCsrfToken } from "./api";
import { pages, PageId, roleForPath } from "./catalog";
import { Workspace } from "./context";
import type { Bootstrap, Role } from "./types";
import { Shell } from "./components/Shell";
import { PrototypeProvider } from "./prototype";
import { PublisherPreviewProvider } from "./publisher-preview";
import { AdminPreviewProvider } from "./admin-preview";
import { AdminOperationsProvider } from "./admin-operations";
import { AdminTravelPreviewProvider } from "./admin-travel-preview";

const PublicHomePage = lazy(() =>
  import("./pages/PublicHome").then((module) => ({
    default: module.PublicHomePage,
  })),
);
const MarketPage = lazy(() =>
  import("./pages/Market").then((module) => ({ default: module.MarketPage })),
);
const ServiceDetailPage = lazy(() =>
  import("./pages/ServiceDetail").then((module) => ({
    default: module.ServiceDetailPage,
  })),
);
const TravelServicePage = lazy(() =>
  import("./pages/TravelService").then((module) => ({
    default: module.TravelServicePage,
  })),
);
const ConsumerHomePage = lazy(() =>
  import("./pages/ConsumerHome").then((module) => ({
    default: module.ConsumerHomePage,
  })),
);
const TasksPage = lazy(() =>
  import("./pages/Tasks").then((module) => ({ default: module.TasksPage })),
);
const TaskDetailPage = lazy(() =>
  import("./pages/Tasks").then((module) => ({
    default: module.TaskDetailPage,
  })),
);
const AuthPage = lazy(() =>
  import("./pages/Auth").then((module) => ({ default: module.AuthPage })),
);
const OutputsPage = lazy(() =>
  import("./pages/Outputs").then((module) => ({ default: module.OutputsPage })),
);
const RunsPage = lazy(() =>
  import("./pages/Runs").then((module) => ({ default: module.RunsPage })),
);
const AdminHomePage = lazy(() =>
  import("./pages/AdminHome").then((module) => ({
    default: module.AdminHomePage,
  })),
);
const PublisherHomePage = lazy(() =>
  import("./pages/PublisherHome").then((module) => ({
    default: module.PublisherHomePage,
  })),
);
const PublisherAccessPage = lazy(() =>
  import("./pages/PublisherAccess").then((module) => ({
    default: module.PublisherAccessPage,
  })),
);
const OrdersPage = lazy(() =>
  import("./pages/Orders").then((module) => ({ default: module.OrdersPage })),
);
const OrderDetailPage = lazy(() =>
  import("./pages/Orders").then((module) => ({
    default: module.OrderDetailPage,
  })),
);
const CheckoutPage = lazy(() =>
  import("./pages/Checkout").then((module) => ({
    default: module.CheckoutPage,
  })),
);
const CashierPage = lazy(() =>
  import("./pages/Checkout").then((module) => ({
    default: module.CashierPage,
  })),
);
const PurchasedServicesPage = lazy(() =>
  import("./pages/PurchasedServices").then((module) => ({
    default: module.PurchasedServicesPage,
  })),
);
const RunDetailPage = lazy(() =>
  import("./pages/RunDetail").then((module) => ({
    default: module.RunDetailPage,
  })),
);
const CredentialsPage = lazy(() =>
  import("./pages/Personal").then((module) => ({
    default: module.CredentialsPage,
  })),
);
const PendingActionsPage = lazy(() =>
  import("./pages/Personal").then((module) => ({
    default: module.PendingActionsPage,
  })),
);
const TravelersPage = lazy(() =>
  import("./pages/Personal").then((module) => ({
    default: module.TravelersPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./pages/Notifications").then((module) => ({
    default: module.NotificationsPage,
  })),
);
const NotificationSettingsPage = lazy(() =>
  import("./pages/Notifications").then((module) => ({
    default: module.NotificationSettingsPage,
  })),
);
const BillsPage = lazy(() =>
  import("./pages/ConsumerFinance").then((module) => ({
    default: module.BillsPage,
  })),
);
const RefundsPage = lazy(() =>
  import("./pages/ConsumerFinance").then((module) => ({
    default: module.RefundsPage,
  })),
);
const RefundDetailPage = lazy(() =>
  import("./pages/ConsumerFinance").then((module) => ({
    default: module.RefundDetailPage,
  })),
);
const AccountPage = lazy(() =>
  import("./pages/Account").then((module) => ({ default: module.AccountPage })),
);
const BookingsPage = lazy(() =>
  import("./pages/Bookings").then((module) => ({
    default: module.BookingsPage,
  })),
);
const AttractionsPage = lazy(() =>
  import("./pages/PublicResources").then((module) => ({
    default: module.AttractionsPage,
  })),
);
const HelpPage = lazy(() =>
  import("./pages/PublicResources").then((module) => ({
    default: module.HelpPage,
  })),
);

const ConfigureServicePage = lazy(() =>
  import("./pages/ConfigureService").then((module) => ({
    default: module.ConfigureServicePage,
  })),
);
const ScriptEditorPage = lazy(() =>
  import("./pages/ScriptEditor").then((module) => ({
    default: module.ScriptEditorPage,
  })),
);
const ScriptsPage = lazy(() =>
  import("./pages/PublisherScripts").then((module) => ({
    default: module.ScriptsPage,
  })),
);
const VersionTestsPage = lazy(() =>
  import("./pages/PublisherScripts").then((module) => ({
    default: module.VersionTestsPage,
  })),
);
const BuildsPage = lazy(() =>
  import("./pages/PublisherExecution").then((module) => ({
    default: module.BuildsPage,
  })),
);
const DeploymentsPage = lazy(() =>
  import("./pages/PublisherExecution").then((module) => ({
    default: module.DeploymentsPage,
  })),
);
const ProductsPage = lazy(() =>
  import("./pages/PublisherProducts").then((module) => ({
    default: module.ProductsPage,
  })),
);
const ProductEditorPage = lazy(() =>
  import("./pages/PublisherProducts").then((module) => ({
    default: module.ProductEditorPage,
  })),
);
const PricingPage = lazy(() =>
  import("./pages/PublisherProducts").then((module) => ({
    default: module.PricingPage,
  })),
);
const SalesPage = lazy(() =>
  import("./pages/PublisherSales").then((module) => ({
    default: module.SalesPage,
  })),
);
const ImportsPage = lazy(() =>
  import("./pages/PublisherSales").then((module) => ({
    default: module.ImportsPage,
  })),
);
const PublisherMetricsPage = lazy(() =>
  import("./pages/PublisherQuality").then((module) => ({
    default: module.PublisherMetricsPage,
  })),
);
const PublisherDiagnosticsPage = lazy(() =>
  import("./pages/PublisherQuality").then((module) => ({
    default: module.PublisherDiagnosticsPage,
  })),
);
const EarningsPage = lazy(() =>
  import("./pages/PublisherFinance").then((module) => ({
    default: module.EarningsPage,
  })),
);
const SettlementDetailPage = lazy(() =>
  import("./pages/PublisherFinance").then((module) => ({
    default: module.SettlementDetailPage,
  })),
);
const PublisherSettingsPage = lazy(() =>
  import("./pages/PublisherFinance").then((module) => ({
    default: module.PublisherSettingsPage,
  })),
);

const AdminUsersPage = lazy(() =>
  import("./pages/AdminCatalog").then((module) => ({
    default: module.AdminUsersPage,
  })),
);
const AdminServicesPage = lazy(() =>
  import("./pages/AdminCatalog").then((module) => ({
    default: module.AdminServicesPage,
  })),
);
const AdminOrdersPage = lazy(() =>
  import("./pages/AdminOrders").then((module) => ({
    default: module.AdminOrdersPage,
  })),
);
const AdminOrderDetailPage = lazy(() =>
  import("./pages/AdminOrders").then((module) => ({
    default: module.AdminOrderDetailPage,
  })),
);
const AdminPaymentsPage = lazy(() =>
  import("./pages/AdminFinance").then((module) => ({
    default: module.AdminPaymentsPage,
  })),
);
const AdminRefundExceptionPage = lazy(() =>
  import("./pages/AdminFinance").then((module) => ({
    default: module.AdminRefundExceptionPage,
  })),
);
const AdminReconciliationPage = lazy(() =>
  import("./pages/AdminFinance").then((module) => ({
    default: module.AdminReconciliationPage,
  })),
);
const AdminSettlementsPage = lazy(() =>
  import("./pages/AdminFinance").then((module) => ({
    default: module.AdminSettlementsPage,
  })),
);
const AdminCommercePolicyPage = lazy(() =>
  import("./pages/AdminPolicy").then((module) => ({
    default: module.AdminCommercePolicyPage,
  })),
);

const AdminSchedulingPage = lazy(() =>
  import("./pages/AdminInfrastructure").then((module) => ({
    default: module.AdminSchedulingPage,
  })),
);
const AdminInfrastructurePage = lazy(() =>
  import("./pages/AdminInfrastructure").then((module) => ({
    default: module.AdminInfrastructurePage,
  })),
);
const AdminRunsPage = lazy(() =>
  import("./pages/AdminRuns").then((module) => ({
    default: module.AdminRunsPage,
  })),
);
const AdminObservabilityPage = lazy(() =>
  import("./pages/AdminObservability").then((module) => ({
    default: module.AdminObservabilityPage,
  })),
);
const AdminDeliveriesPage = lazy(() =>
  import("./pages/AdminObservability").then((module) => ({
    default: module.AdminDeliveriesPage,
  })),
);
const AdminPlatformSettingsPage = lazy(() =>
  import("./pages/AdminPlatform").then((module) => ({
    default: module.AdminPlatformSettingsPage,
  })),
);
const AdminAccessPage = lazy(() =>
  import("./pages/AdminPlatform").then((module) => ({
    default: module.AdminAccessPage,
  })),
);
const AdminRecoveryPage = lazy(() =>
  import("./pages/AdminPlatform").then((module) => ({
    default: module.AdminRecoveryPage,
  })),
);
const AdminAttractionsPage = lazy(() =>
  import("./pages/AdminTravel").then((module) => ({
    default: module.AdminAttractionsPage,
  })),
);
const AdminChannelsPage = lazy(() =>
  import("./pages/AdminTravel").then((module) => ({
    default: module.AdminChannelsPage,
  })),
);
const AdminUnresolvedBookingsPage = lazy(() =>
  import("./pages/AdminTravel").then((module) => ({
    default: module.AdminUnresolvedBookingsPage,
  })),
);

const pageCapabilities: Partial<Record<PageId, string>> = {
  O02: "user.manage",
  O03: "catalog.manage",
  O04: "catalog.manage",
  O05: "catalog.manage",
  O06: "commerce.manage",
  O07: "commerce.manage",
  O08: "commerce.manage",
  O09: "commerce.manage",
  O10: "commerce.manage",
  O11: "commerce.manage",
  O12: "commerce.manage",
  O13: "runtime.manage",
  O14: "runtime.manage",
  O15: "runtime.manage",
  O16: "runtime.observe",
  O17: "observability.manage",
  O18: "runtime.manage",
  O19: "access.manage",
  O20: "runtime.manage",
  O21: "data.diagnose",
};

const implementedPages: Record<PageId, ReactElement> = {
  P01: <PublicHomePage />,
  P02: <MarketPage />,
  P03: <ServiceDetailPage />,
  P04: <AttractionsPage />,
  P05: <TravelServicePage />,
  P06: <HelpPage />,
  P07: <AuthPage />,
  C01: <ConsumerHomePage />,
  C02: <CheckoutPage />,
  C03: <CashierPage />,
  C04: <OrdersPage />,
  C05: <OrderDetailPage />,
  C06: <PurchasedServicesPage />,
  C07: <ConfigureServicePage />,
  C08: <TasksPage />,
  C09: <TaskDetailPage />,
  C10: <RunsPage />,
  C11: <RunDetailPage />,
  C12: <OutputsPage />,
  C13: <PendingActionsPage />,
  C14: <CredentialsPage />,
  C15: <TravelersPage />,
  C16: <NotificationsPage />,
  C17: <NotificationSettingsPage />,
  C18: <BillsPage />,
  C19: <RefundsPage />,
  C20: <RefundDetailPage />,
  C21: <AccountPage />,
  C22: <BookingsPage />,
  S01: <PublisherHomePage />,
  S02: <ScriptsPage />,
  S03: <ScriptEditorPage />,
  S04: <VersionTestsPage />,
  S05: <BuildsPage />,
  S06: <DeploymentsPage />,
  S07: <ProductsPage />,
  S08: <ProductEditorPage />,
  S09: <PricingPage />,
  S10: <SalesPage />,
  S11: <PublisherMetricsPage />,
  S12: <PublisherDiagnosticsPage />,
  S13: <EarningsPage />,
  S14: <SettlementDetailPage />,
  S15: <PublisherSettingsPage />,
  S16: <ImportsPage />,
  O01: <AdminHomePage />,
  O02: <AdminUsersPage />,
  O03: <AdminServicesPage />,
  O04: <AdminAttractionsPage />,
  O05: <AdminChannelsPage />,
  O06: <AdminOrdersPage />,
  O07: <AdminOrderDetailPage />,
  O08: <AdminPaymentsPage />,
  O09: <AdminRefundExceptionPage />,
  O10: <AdminReconciliationPage />,
  O11: <AdminSettlementsPage />,
  O12: <AdminCommercePolicyPage />,
  O13: <AdminSchedulingPage />,
  O14: <AdminInfrastructurePage />,
  O15: <AdminRunsPage />,
  O16: <AdminObservabilityPage />,
  O17: <AdminDeliveriesPage />,
  O18: <AdminPlatformSettingsPage />,
  O19: <AdminAccessPage />,
  O20: <AdminRecoveryPage />,
  O21: <AdminUnresolvedBookingsPage />,
};

export function Application() {
  const [bootstrap, setBootstrap] = useState<Bootstrap>();
  const [role, setRole] = useState<Role>("GUEST");
  const [error, setError] = useState("");
  const location = useLocation();
  const client = useQueryClient();
  async function refresh(signal?: AbortSignal) {
    const result = await api<Bootstrap>("/bootstrap", { signal });
    if (signal?.aborted) return;
    setCsrfToken(result.csrf_token);
    setError("");
    if (!result.user) setRole("GUEST");
    else if (!bootstrap && roleForPath(location.pathname) === "GUEST")
      setRole(location.pathname === "/auth" ? "GUEST" : "USER");
    setBootstrap(result);
    return result;
  }
  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (location.pathname === "/auth") {
      setRole("GUEST");
      return;
    }
    const target = roleForPath(location.pathname);
    const preferred = new URLSearchParams(location.search).get(
      "workspace",
    ) as Role | null;
    if (preferred && bootstrap?.user?.roles.includes(preferred)) {
      setRole(preferred);
      return;
    }
    if (location.pathname === "/me/settings/account" && role !== "GUEST")
      return;
    if (target !== "GUEST")
      setRole(bootstrap?.user?.roles.includes(target) ? target : "USER");
  }, [
    location.pathname,
    location.search,
    bootstrap?.user?.id,
    bootstrap?.user?.roles,
  ]);
  if (error)
    return (
      <div className="startup-error">
        <Alert
          type="error"
          title="无法连接平台服务"
          description={error}
          showIcon
          action={
            <Button onClick={() => window.location.reload()}>重试</Button>
          }
        />
      </div>
    );
  if (!bootstrap) return <Spin fullscreen description="正在加载平台" />;
  const required = roleForPath(location.pathname);
  const needsPublisherSetup =
    required === "PUBLISHER" &&
    !!bootstrap.user &&
    !bootstrap.user.roles.includes("PUBLISHER");
  if (
    required !== "GUEST" &&
    !bootstrap.user?.roles.includes(required) &&
    !needsPublisherSetup
  )
    return (
      <Navigate
        to={`/auth?workspace=${required}&returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    );
  return (
    <Workspace.Provider
      value={{
        bootstrap,
        role: needsPublisherSetup ? "USER" : role,
        setRole: (value) => {
          setRole(value);
          client.removeQueries({
            predicate: (query) => query.queryKey[0] !== "public",
          });
        },
        refresh,
      }}
    >
      <PrototypeProvider key={bootstrap.user?.id || "anonymous"}>
        <PublisherPreviewProvider>
          <AdminPreviewProvider>
            <AdminOperationsProvider>
              <AdminTravelPreviewProvider>
                <Routes>
                  {needsPublisherSetup ? (
                    <Route element={<Shell pageId="C01" />}>
                      <Route
                        path="*"
                        element={
                          <Suspense fallback={<Skeleton active />}>
                            <PublisherAccessPage />
                          </Suspense>
                        }
                      />
                    </Route>
                  ) : (
                    <>
                      {(Object.keys(pages) as PageId[]).map((id) => {
                        const capability = pageCapabilities[id];
                        return (
                          <Route key={id} element={<Shell pageId={id} />}>
                            <Route
                              path={pages[id].route}
                              element={
                                <Suspense
                                  fallback={
                                    <Skeleton active paragraph={{ rows: 8 }} />
                                  }
                                >
                                  {capability &&
                                  !bootstrap.user?.capabilities.includes(
                                    capability,
                                  ) ? (
                                    <Result
                                      status="403"
                                      title="无权访问此页面"
                                      subTitle={`当前账号缺少 ${capability} 能力`}
                                    />
                                  ) : (
                                    implementedPages[id]
                                  )}
                                </Suspense>
                              }
                            />
                          </Route>
                        );
                      })}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </>
                  )}
                </Routes>
              </AdminTravelPreviewProvider>
            </AdminOperationsProvider>
          </AdminPreviewProvider>
        </PublisherPreviewProvider>
      </PrototypeProvider>
    </Workspace.Provider>
  );
}
