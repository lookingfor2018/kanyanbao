const { appendJsonl } = require("./fs-utils");
const { formatIsoCst } = require("./time");

class RunLogger {
  constructor(logFile, runId) {
    this.logFile = logFile;
    this.runId = runId;
  }

  log({ stage, status, message, jobId = "", ticker = "", errorCode = "" }) {
    appendJsonl(this.logFile, {
      timestamp: formatIsoCst(),
      run_id: this.runId,
      stage,
      job_id: jobId,
      ticker,
      status,
      message,
      error_code: errorCode,
    });
  }

  info(stage, message, meta = {}) {
    this.log({ stage, status: "info", message, ...meta });
  }

  warn(stage, message, meta = {}) {
    this.log({ stage, status: "warn", message, ...meta });
  }

  error(stage, message, meta = {}) {
    this.log({ stage, status: "error", message, ...meta });
  }
}

module.exports = {
  RunLogger,
};

