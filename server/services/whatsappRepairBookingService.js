const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const { downloadInboundMedia } = require("./whatsappMediaService");
const { uploadBuffer } = require("./cloudinaryService");
const { validateEmailDeliverability } = require("../utils/validateEmail");
const { enqueueBookingNotification } = require("./bookingNotificationService");

const fields = [
  ["fullName", "Apna poora naam bhejein.", 120],
  ["customerEmail", "Apna email address bhejein.", 254],
  ["phoneNumber", "10 digit contact number bhejein. Isi WhatsApp number ke liye SAME likhein.", 20],
  ["repairType", "Kis cheez ki repair ya service chahiye?", 200],
  ["address", "Pickup ya service ke liye poora address bhejein.", 500],
  ["pincode", "6 digit PIN code bhejein.", 6],
  ["landmark", "Paas ka landmark bhejein, ya SKIP likhein.", 200],
  ["message", "Problem ya special instructions bhejein, ya SKIP likhein.", 1000],
];

function review(draft) {
  const data = draft.data;
  return ["*Repair booking review*", data.fullName, data.customerEmail,
    "Phone: " + data.phoneNumber, "WhatsApp: " + data.whatsappNumber, data.repairType,
    data.address + ", PIN " + data.pincode, data.landmark, data.message,
    "Photos: " + draft.images.length + "/8. Photo bhej sakte hain.",
    "Booking submit karne ke liye CONFIRM likhein. Dobara bharne ke liye RESTART ya band karne ke liye CANCEL likhein."].filter(Boolean).join("\n");
}

function isRepairRequest(text) {
  if (/\b(?:status|track|already booked)\b|स्टेटस/.test(text.toLowerCase())) return false;
  return /\b(?:repairs?|repairing|marammat|repar|repaire)\b|रिपेयर|मरम्मत|ठीक\s*कर/i.test(text)
    || /(?:\bservice\b|सर्विस).*(?:book|kar|कर|बुक)|(?:book|बुक).*(?:\bservice\b|सर्विस)/i.test(text);
}

async function handleRepairBooking({ account, conversation, customerMessage, media, buttonReplyId }) {
  let draft = conversation.repairDraft;
  const input = String(customerMessage || "").trim();
  if (!draft && !isRepairRequest(input) && !isRepairRequest(String(buttonReplyId || "").replace(/[_:-]/g, " "))) return null;
  const save = async (next) => {
    conversation.repairDraft = next;
    conversation.markModified("repairDraft");
    await conversation.save();
  };
  if (draft && /^cancel$/i.test(input)) {
    await save(null);
    return "Repair booking draft cancel ho gaya.";
  }
  if (!draft || /^restart$/i.test(input)) {
    draft = { id: new mongoose.Types.ObjectId().toString(), step: 0, images: [], data: { whatsappNumber: conversation.customerWaId.replace(/^91(?=\d{10}$)/, "") } };
    await save(draft);
    return "WhatsApp par repair booking shuru karte hain. Kabhi bhi CANCEL likh sakte hain. " + fields[0][1];
  }
  const field = fields[draft.step];
  if (media?.type === "image") {
    if (draft.images.length >= 8) return "8 photos mil gayi hain. " + (field?.[1] || review(draft));
    try {
      const part = await downloadInboundMedia({ account, mediaId: media.id, type: "image", mimeType: media.mimeType });
      const uploaded = await uploadBuffer(Buffer.from(part.inlineData.data, "base64"));
      draft.images.push({ url: uploaded.secure_url, publicId: uploaded.public_id, source: "whatsapp" });
    } catch {
      return "Photo save nahi hui. JPG ya PNG dobara bhejein.";
    }
    await save(draft);
    return "Photo mil gayi. " + (field?.[1] || review(draft));
  }
  if (field) {
    const [key, prompt, max] = field;
    let value = input;
    if (media || !value || value.length > max) return prompt;
    if (key === "customerEmail") {
      const email = await validateEmailDeliverability(value);
      if (!email.valid) return "Email check karein. " + prompt;
      value = email.email || value;
    }
    if (key === "phoneNumber") {
      value = /^same$/i.test(value) ? draft.data.whatsappNumber : value.replace(/[ ()-]/g, "");
      if (!/^\d{10}$/.test(value)) return prompt;
    }
    if (key === "pincode" && !/^\d{6}$/.test(value)) return prompt;
    if (["landmark", "message"].includes(key) && /^skip$/i.test(value)) value = "";
    draft.data[key] = value;
    draft.step++;
    await save(draft);
    return fields[draft.step]?.[1] || review(draft);
  }
  if (!/^(?:confirm(?: booking| repair)?|booking confirm|yes|haan|han|ha|हाँ|हां)[.!]?$/i.test(input)) return review(draft);
  const booking = await createRepairBooking({ id: draft.id, data: draft.data, images: draft.images }).catch((error) => {
    require("../utils/logger").logger.error("whatsapp.repair_booking_failed", { code: error.code, bookingId: draft.id });
    return null;
  });
  if (!booking) return "Booking save verify nahi ho payi. Thodi der baad CONFIRM dobara bhejein.";
  await save(null);
  return "Repair booking submit ho gayi. Booking ID: " + booking._id;
}

async function createRepairBooking({ id, data, images = [], source = "whatsapp" }) {
  try {
    const booking = await Booking.create({ _id: id, ...data, images,
      imageUrl: images[0]?.url, imagePublicId: images[0]?.publicId, bookingSource: source,
      ...(source === "whatsapp-voice" && { voiceNotificationNextAttemptAt: new Date(), emailNotification: { status: "queued" } }) });
    if (source !== "whatsapp-voice") enqueueBookingNotification(booking);
    return booking;
  } catch (error) {
    if (error.code !== 11000) throw error;
    return Booking.findById(id);
  }
}

module.exports = { handleRepairBooking, createRepairBooking };
