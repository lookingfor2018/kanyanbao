const SECTION_ORDER = ["科技", "消费", "医药", "制造", "加密", "其他"];
const SHORT_LINK_PLACEHOLDER = "SHORT_LINK_PLACEHOLDER";

const STATUS_ENUMS = {
  acquisition_status: ["pending", "completed", "failed", "needs_review", "skipped"],
  sanitization_status: ["pending", "completed", "failed", "needs_review"],
  summary_status: ["pending", "completed", "failed", "needs_review"],
  link_status: ["not_created", "signed", "shortened", "failed", "expired"],
  delivery_status: ["draft", "ready", "blocked", "sent", "failed"],
  matched_by: ["ticker_exact", "alias_match", "manual_required"],
};

function createStandardError({
  code,
  stage,
  message,
  fatal = false,
  retryable = false,
  detail = {},
}) {
  return { code, stage, message, fatal, retryable, detail };
}

module.exports = {
  SECTION_ORDER,
  SHORT_LINK_PLACEHOLDER,
  STATUS_ENUMS,
  createStandardError,
};

