const CST_OFFSET_HOURS = 8;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function toCstDate(date = new Date()) {
  const utcMs = date.getTime() + date.getTimezoneOffset() * 60000;
  const cstMs = utcMs + CST_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(cstMs);
}

function formatIsoCst(date = new Date()) {
  const cst = toCstDate(date);
  const year = cst.getUTCFullYear();
  const month = pad2(cst.getUTCMonth() + 1);
  const day = pad2(cst.getUTCDate());
  const hour = pad2(cst.getUTCHours());
  const minute = pad2(cst.getUTCMinutes());
  const second = pad2(cst.getUTCSeconds());
  return `${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`;
}

function todayInCst() {
  return formatIsoCst().slice(0, 10);
}

function makeRunId(runDate) {
  const now = toCstDate();
  const hhmmss = `${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}`;
  return `kanyanbao-${runDate}-${hhmmss}`;
}

function parseRunDate(runDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(runDate || "");
  if (!match) {
    return null;
  }
  const [_, year, month, day] = match;
  const value = Date.UTC(Number(year), Number(month) - 1, Number(day));
  if (Number.isNaN(value)) {
    return null;
  }
  return new Date(value);
}

function fromCnDateTime(text) {
  const match = /(\d{4})年(\d{2})月(\d{2})日\s+(\d{2}):(\d{2})/.exec(text || "");
  if (!match) {
    return "";
  }
  const [, year, month, day, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00+08:00`;
}

function isWithinNaturalDays(uploadIso, runDate, daysBack) {
  if (!uploadIso) {
    return false;
  }
  const run = parseRunDate(runDate);
  if (!run) {
    return false;
  }
  const uploadDate = parseRunDate(uploadIso.slice(0, 10));
  if (!uploadDate) {
    return false;
  }
  const diffDays = Math.floor((run.getTime() - uploadDate.getTime()) / (24 * 60 * 60 * 1000));
  return diffDays >= 0 && diffDays <= daysBack;
}

module.exports = {
  formatIsoCst,
  todayInCst,
  makeRunId,
  parseRunDate,
  fromCnDateTime,
  isWithinNaturalDays,
};

