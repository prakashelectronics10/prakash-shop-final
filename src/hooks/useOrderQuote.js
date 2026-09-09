import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest } from "../api/client";
import { COUPON_CHANGED_EVENT, couponOrderItems, getAppliedCouponCode } from "../utils/coupons";

export function useOrderQuote(items) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ key: "", quote: null, error: "", loading: false });
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    window.addEventListener(COUPON_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(COUPON_CHANGED_EVENT, refresh);
  }, [refresh]);
  const payload = useMemo(() => ({ items: couponOrderItems(items), couponCode: getAppliedCouponCode() }), [items, revision]); // eslint-disable-line react-hooks/exhaustive-deps
  const key = JSON.stringify(payload);

  useEffect(() => {
    if (!payload.items.length) return undefined;
    let active = true;
    setState({ key, quote: null, error: "", loading: true });
    apiRequest("/orders/quote", { method: "POST", cache: "no-store", body: key })
      .then((response) => {
        if (active) setState({ key, quote: response.data, error: "", loading: false });
      })
      .catch((error) => {
        if (active) setState({ key, quote: null, error: error.message || "Prices could not be updated. Please retry.", loading: false });
      });
    return () => { active = false; };
  }, [key, payload.items.length, revision]);

  return {
    quote: state.key === key ? state.quote : null,
    loading: items.length > 0 && (state.key !== key || state.loading),
    error: state.key === key ? state.error : "",
    payload,
    refresh,
  };
}
