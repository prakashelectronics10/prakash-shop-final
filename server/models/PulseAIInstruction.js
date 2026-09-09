const mongoose = require("mongoose");
const { validateLinkAction } = require("../services/pulseAILinkActionService");

const pulseAILinkActionSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    title: { type: String, trim: true, maxlength: 120, default: "" },
    description: { type: String, trim: true, maxlength: 240, default: "" },
    url: { type: String, trim: true, maxlength: 2048, default: "" },
    type: {
      type: String,
      enum: ["auto", "internal", "external"],
      default: "auto",
    },
    trigger: { type: String, trim: true, maxlength: 500, default: "" },
    ctaLabel: { type: String, trim: true, maxlength: 40, default: "Open Link" },
    openInNewTab: { type: Boolean, default: true },
  },
  { _id: false },
);

const pulseAIInstructionSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    instruction: { type: String, required: true, trim: true, maxlength: 5000 },
    scope: {
      type: String,
      enum: ["general", "products", "services", "website", "page"],
      default: "general",
      index: true,
    },
    target: { type: String, trim: true, maxlength: 160, default: "" },
    priority: { type: Number, min: 0, max: 1000, default: 100, index: true },
    isActive: { type: Boolean, default: true, index: true },
    linkAction: {
      type: pulseAILinkActionSchema,
      default: () => ({ enabled: false }),
      validate: {
        validator(value) {
          return validateLinkAction(value).valid;
        },
        message(props) {
          return validateLinkAction(props.value).message || "Invalid Pulse AI link action.";
        },
      },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
  },
  { timestamps: true },
);

pulseAIInstructionSchema.index({ isActive: 1, priority: -1, updatedAt: -1 });

module.exports = mongoose.model("PulseAIInstruction", pulseAIInstructionSchema);
