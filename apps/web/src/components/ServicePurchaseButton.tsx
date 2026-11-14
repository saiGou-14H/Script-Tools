import { Button } from "antd";
import { ShoppingCartOutlined } from "@ant-design/icons";
import { useNavigate, useSearchParams } from "react-router-dom";
import { checkoutPath, serviceAvailable } from "../lib/service-display";
import type { Service } from "../types";

export function ServicePurchaseButton({
  service,
  travel = false,
  disabled = false,
  context,
}: {
  service: Service;
  travel?: boolean;
  disabled?: boolean;
  context?: URLSearchParams;
}) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const available = serviceAvailable(service) && !disabled;
  return (
    <Button
      className="service-purchase-button"
      type="primary"
      block
      size="large"
      icon={travel ? <ShoppingCartOutlined aria-hidden="true" /> : undefined}
      disabled={!available}
      onClick={() => navigate(checkoutPath(service, context || params))}
    >
      {available ? (travel ? "确认预约服务" : "购买一次") : "当前不可购买"}
    </Button>
  );
}
