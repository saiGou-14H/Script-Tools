import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfigProvider, App as AntApp, Spin } from "antd";
import zhCN from "antd/locale/zh_CN";
import { BrowserRouter } from "react-router-dom";
import { Application } from "./router";
import "antd/dist/reset.css";
import "./styles.css";
import "./styles/consumer.css";
import "./styles/personal.css";
import "./styles/resources.css";
import "./styles/publisher.css";
import "./styles/admin.css";
import "./styles/admin-operations.css";
import "./styles/admin-travel.css";
import "./styles/public-home.css";
import "./styles/auth.css";
import "./styles/retail.css";
import "./styles/consumer-home.css";
import "./styles/outputs.css";
import "./styles/account.css";
import "./styles/execution.css";
import "./styles/publisher-execution.css";
import "./styles/publisher-quality.css";

const client = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        token: {
          colorPrimary: "#1555ff",
          borderRadius: 8,
          fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
          fontSize: 14,
          controlHeight: 34,
          colorBorder: "#dce3ef",
        },
      }}
    >
      <AntApp>
        <QueryClientProvider client={client}>
          <React.Suspense fallback={<Spin fullscreen />}>
            <BrowserRouter>
              <Application />
            </BrowserRouter>
          </React.Suspense>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
