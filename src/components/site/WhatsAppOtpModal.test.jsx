import { act } from "react";
import { createRoot } from "react-dom/client";
import { apiRequest } from "../../api/client";
import { WhatsAppOtpModal } from "./WhatsAppOtpModal";

jest.mock("../../api/client", () => ({ apiRequest: jest.fn() }));

test("the OTP modal distinguishes Meta acceptance from actual delivery", async () => {
  const previous = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  const container = document.createElement("div");
  const root = createRoot(container);
  apiRequest.mockResolvedValueOnce({ data: { challengeId: "challenge", maskedWhatsApp: "90******01" } })
    .mockResolvedValueOnce({ data: { status: "delivered" } });
  try {
    await act(async () => root.render(<WhatsAppOtpModal open purpose="order-history" whatsappNumber="9000000001" />));
    expect(container.textContent).toContain("code request accept ki hai");
    expect(container.textContent).not.toContain("code deliver ho gaya");
    await act(async () => { jest.advanceTimersByTime(2000); });
    expect(apiRequest.mock.calls[1][0]).toBe("/public/whatsapp-otp/status");
    expect(container.textContent).toContain("code deliver ho gaya");
  } finally {
    act(() => root.unmount());
    jest.useRealTimers();
    globalThis.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
