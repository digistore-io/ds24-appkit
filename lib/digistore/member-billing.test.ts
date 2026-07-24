import { describe, it, expect } from "vitest";

import { invoiceRowFromIpn } from "./member-billing";

// A realistic subset of a Digistore24 on_payment payload (field names taken
// from a real IPN — see the IPN log's stored payload).
const PAYMENT = {
  event: "on_payment",
  order_id: "LJMMPCQD",
  transaction_id: "123006065",
  invoice_url: "https://www.digistore24.com/invoice/LJMMPCQD/123006065/CZ9CAXD9.pdf",
  transaction_amount: "19.00",
  transaction_currency: "EUR",
  amount: "19.00",
  currency: "EUR",
  pay_sequence_no: "1",
};

describe("invoiceRowFromIpn", () => {
  it("extracts the invoice from a payment payload", () => {
    expect(invoiceRowFromIpn(PAYMENT)).toEqual({
      ds24OrderId: "LJMMPCQD",
      ds24TransactionId: "123006065",
      invoiceUrl:
        "https://www.digistore24.com/invoice/LJMMPCQD/123006065/CZ9CAXD9.pdf",
      amount: "19.00",
      currency: "EUR",
      paySequenceNo: 1,
    });
  });

  it("prefers the transaction amount/currency over the order-level ones", () => {
    const row = invoiceRowFromIpn({
      ...PAYMENT,
      transaction_amount: "5.00",
      transaction_currency: "USD",
      amount: "19.00",
      currency: "EUR",
    });
    expect(row?.amount).toBe("5.00");
    expect(row?.currency).toBe("USD");
  });

  it("returns null without an invoice_url (e.g. a refund event)", () => {
    const { invoice_url: _omit, ...noInvoice } = PAYMENT;
    void _omit;
    expect(invoiceRowFromIpn(noInvoice)).toBeNull();
  });

  it("returns null without a transaction_id (no idempotency key)", () => {
    const { transaction_id: _omit, ...noTx } = PAYMENT;
    void _omit;
    expect(invoiceRowFromIpn(noTx)).toBeNull();
  });

  it("parses a rebill sequence number and tolerates a missing one", () => {
    expect(invoiceRowFromIpn({ ...PAYMENT, pay_sequence_no: "3" })?.paySequenceNo).toBe(3);
    const { pay_sequence_no: _omit, ...noSeq } = PAYMENT;
    void _omit;
    expect(invoiceRowFromIpn(noSeq)?.paySequenceNo).toBeNull();
  });
});
