function toMoneyNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(Math.max(0, parsed) * 100) / 100;
}

function calculateInvoiceTotals(items = []) {
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const quantity = toMoneyNumber(item.quantity || 0);
      const unitPrice = toMoneyNumber(item.unitPrice || 0);
      const gross = toMoneyNumber(quantity * unitPrice);
      const discount = Math.min(toMoneyNumber(item.discount || 0), gross);
      const taxRate = Math.min(100, toMoneyNumber(item.taxRate || item.tax || 0));
      const taxable = Math.max(0, gross - discount);
      const taxAmount = toMoneyNumber((taxable * taxRate) / 100);
      const totalPrice = toMoneyNumber(taxable + taxAmount);

      return {
        name: String(item.name || item.productName || item.serviceName || "").trim(),
        quantity,
        unitPrice,
        discount,
        taxRate,
        totalPrice,
      };
    })
    .filter((item) => item.name);

  const totals = normalizedItems.reduce(
    (acc, item) => {
      const gross = toMoneyNumber(item.quantity * item.unitPrice);
      acc.subtotal = toMoneyNumber(acc.subtotal + gross);
      acc.discountTotal = toMoneyNumber(acc.discountTotal + item.discount);
      acc.taxTotal = toMoneyNumber(acc.taxTotal + Math.max(0, item.totalPrice - Math.max(0, gross - item.discount)));
      acc.grandTotal = toMoneyNumber(acc.grandTotal + item.totalPrice);
      return acc;
    },
    { subtotal: 0, discountTotal: 0, taxTotal: 0, grandTotal: 0 },
  );

  return { items: normalizedItems, totals };
}

module.exports = { calculateInvoiceTotals, toMoneyNumber };
