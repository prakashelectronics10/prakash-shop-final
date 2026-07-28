const mongoose = require("mongoose");

const adminReceiptSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    at: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const reactionSchema = new mongoose.Schema(
  {
    emoji: {
      type: String,
      required: true,
      trim: true,
      maxlength: 16,
    },
    admins: {
      type: [adminReceiptSchema],
      default: [],
    },
  },
  { _id: false },
);

const pinSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    scope: {
      type: String,
      enum: ["private", "global"],
      default: "private",
    },
    pinnedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const attachmentSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["image", "file", "document", "pdf"],
      default: "image",
    },
    fileAsset: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FileAsset",
      default: null,
    },
    fileName: {
      type: String,
      default: "",
      trim: true,
    },
    originalName: {
      type: String,
      default: "",
      trim: true,
    },
    fileType: {
      type: String,
      default: "",
      trim: true,
    },
    fileUrl: {
      type: String,
      default: "",
      trim: true,
    },
    downloadUrl: {
      type: String,
      default: "",
      trim: true,
    },
    secureUrl: {
      type: String,
      default: "",
      trim: true,
    },
    storageProvider: {
      type: String,
      default: "",
      trim: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    originalUrl: {
      type: String,
      default: "",
      trim: true,
    },
    publicId: {
      type: String,
      default: "",
      trim: true,
    },
    name: {
      type: String,
      default: "",
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
      trim: true,
    },
    size: {
      type: Number,
      default: 0,
      min: 0,
    },
    fileSize: {
      type: Number,
      default: 0,
      min: 0,
    },
    width: {
      type: Number,
      default: null,
    },
    height: {
      type: Number,
      default: null,
    },
  },
  { _id: false },
);

const pollOptionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 180,
    },
    voters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
      },
    ],
  },
  { _id: true },
);

const pollSchema = new mongoose.Schema(
  {
    question: {
      type: String,
      trim: true,
      maxlength: 400,
      default: "",
    },
    options: {
      type: [pollOptionSchema],
      default: [],
    },
    voters: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
      },
    ],
    allowMultiple: {
      type: Boolean,
      default: false,
    },
    anonymous: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const discussionMessageSchema = new mongoose.Schema(
  {
    room: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionRoom",
      required: true,
      index: true,
    },
    senderAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
      index: true,
    },
    message: {
      type: String,
      default: "",
      trim: true,
      maxlength: 4000,
    },
    clientId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
      index: true,
    },
    attachments: {
      type: [attachmentSchema],
      default: [],
    },
    type: {
      type: String,
      enum: ["text", "image", "file", "document", "pdf", "poll", "invoice", "system"],
      default: "text",
      index: true,
    },
    poll: {
      type: pollSchema,
      default: null,
    },
    mentions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
      },
    ],
    readBy: {
      type: [adminReceiptSchema],
      default: [],
    },
    deliveredTo: {
      type: [adminReceiptSchema],
      default: [],
    },
    reactions: {
      type: [reactionSchema],
      default: [],
    },
    pins: {
      type: [pinSchema],
      default: [],
    },
    replyTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionMessage",
      default: null,
    },
    relatedBooking: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      default: null,
      index: true,
    },
    relatedProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ShopProduct",
      default: null,
      index: true,
    },
    relatedInvoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Invoice",
      default: null,
      index: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
      index: true,
    },
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    hiddenFor: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        index: true,
      },
    ],
  },
  { timestamps: true },
);

discussionMessageSchema.pre("validate", function validateContent(next) {
  if (this.isDeleted || this.type === "system") return next();
  if (this.type === "poll" && this.poll?.question && this.poll?.options?.length >= 2) return next();
  if (this.type === "invoice" && this.relatedInvoice) return next();
  if (String(this.message || "").trim() || (this.attachments || []).length) return next();
  return next(new Error("Message text or attachment is required"));
});

discussionMessageSchema.index({ room: 1, createdAt: -1 });
discussionMessageSchema.index({ room: 1, isDeleted: 1, createdAt: -1 });
discussionMessageSchema.index({ room: 1, message: "text" });
discussionMessageSchema.index({ senderAdmin: 1, createdAt: -1 });
discussionMessageSchema.index(
  { room: 1, senderAdmin: 1, clientId: 1 },
  { unique: true, partialFilterExpression: { clientId: { $type: "string", $gt: "" } } },
);

module.exports = mongoose.model("DiscussionMessage", discussionMessageSchema);
