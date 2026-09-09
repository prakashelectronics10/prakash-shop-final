const test = require("node:test");
const assert = require("node:assert/strict");
const Booking = require("../models/Booking");

test("booking location is optional and no longer blocks submission validation", () => {
  const booking = new Booking({
    fullName: "Rahul Kumar",
    customerEmail: "rahul@example.com",
    phoneNumber: "9876543210",
    whatsappNumber: "9876543210",
    address: "",
    pincode: "825101",
    repairType: "Fan repair",
  });
  const error = booking.validateSync();
  assert.equal(error?.errors?.address, undefined);
});
