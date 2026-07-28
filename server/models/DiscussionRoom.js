const mongoose = require("mongoose");

const unreadCountSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    count: {
      type: Number,
      default: 0,
      min: 0,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const sendPermissionSchema = new mongoose.Schema(
  {
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },
    disabledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    disabledAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const discussionRoomSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      trim: true,
      lowercase: true,
      unique: true,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      trim: true,
      required: true,
    },
    type: {
      type: String,
      enum: ["global", "team", "private"],
      default: "global",
      index: true,
    },
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Admin",
        index: true,
      },
    ],
    lastMessage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "DiscussionMessage",
      default: null,
    },
    unreadCounts: {
      type: [unreadCountSchema],
      default: [],
    },
    clearedFor: {
      type: [unreadCountSchema],
      default: [],
    },
    sendDisabledFor: {
      type: [sendPermissionSchema],
      default: [],
    },
  },
  { timestamps: true },
);

discussionRoomSchema.index({ type: 1, updatedAt: -1 });
discussionRoomSchema.index({ participants: 1, updatedAt: -1 });

module.exports = mongoose.model("DiscussionRoom", discussionRoomSchema);
