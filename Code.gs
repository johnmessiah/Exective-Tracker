// =================================================================
// Executive Tracker - Backend Logic v13 (Final Version)
// Developed for John Messiah by Google Studio
// =================================================================

const ss = SpreadsheetApp.openById("1pNZJtGAY78jDtwqhBhG33ZsTyh2LLTaFxFPhT9NMnrc");
const breakLogSheet = ss.getSheetByName("Log 2");
const validationSheet = ss.getSheetByName("Data validation");
const accessSheet = ss.getSheetByName("Access");
const PERSONAL_BREAK_REASONS = ["Snacks", "Lunch"];

function doGet(e) {
  const template = HtmlService.createTemplateFromFile("Index");
  template.page = (e && e.parameter) ? (e.parameter.page || 'home') : 'home';
  return template.evaluate()
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .setTitle("Executive Break Tracker");
}

function formatDateWithAmPm(dateObject) {
  try {
    const date = new Date(dateObject);
    if (isNaN(date.getTime())) return "";
    return Utilities.formatDate(date, Session.getScriptTimeZone(), "dd/MMM/yyyy hh:mm:ss a");
  } catch (e) {
    return "";
  }
}

function formatDuration(millis) {
  if (isNaN(millis) || millis < 0) return "00:00:00";
  const h = Math.floor(millis / 3600000).toString().padStart(2, '0');
  const m = Math.floor((millis % 3600000) / 60000).toString().padStart(2, '0');
  const s = Math.floor((millis % 60000) / 1000).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function getBreakReasons() {
  try {
    const lastRow = validationSheet.getLastRow();
    if (lastRow < 2) return [];
    return validationSheet.getRange("B2:B" + lastRow).getValues().flat().filter(String);
  } catch (e) {
    Logger.log("getBreakReasons Error: " + e.message);
    return [];
  }
}

function getHomePageData() {
  try {
    const email = Session.getActiveUser().getEmail().toLowerCase();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const breakLogData = breakLogSheet.getDataRange().getValues();
    let currentBreak = null;
    let personalBreakMillis = 0;
    let feedbackBreakMillis = 0;
    const todayBreakLogs = [];
    const personalReasonsLower = PERSONAL_BREAK_REASONS.map(r => r.toLowerCase());

    for (let i = breakLogData.length - 1; i >= 1; i--) {
      const row = breakLogData[i];
      const executiveEmail = (row[2] || '').toString().toLowerCase();
      if (executiveEmail !== email) continue;

      const startTime = new Date(row[0]);
      if (isNaN(startTime.getTime()) || startTime < today) continue;

      const hasEndTime = row[5] ? true : false;
      const breakReason = (row[3] || '').toString();

      todayBreakLogs.push({
        start: formatDateWithAmPm(startTime),
        end: hasEndTime ? formatDateWithAmPm(new Date(row[5])) : 'Live',
        reason: breakReason,
        comment: row[4] || '',
        duration: row[6] || ''
      });

      if (hasEndTime) {
        const endTime = new Date(row[5]);
        if (isNaN(endTime.getTime())) continue;
        const duration = endTime.getTime() - startTime.getTime();
        if (personalReasonsLower.includes(breakReason.toLowerCase())) {
          personalBreakMillis += duration;
        } else {
          feedbackBreakMillis += duration;
        }
      } else if (!currentBreak) {
        currentBreak = {
          uniqueId: row[1],
          reason: breakReason,
          startTime: startTime.getTime()
        };
      }
    }

    return {
      success: true,
      currentBreak,
      todayBreakLogs: todayBreakLogs.reverse(),
      personalBreakTotal: formatDuration(personalBreakMillis),
      feedbackBreakTotal: formatDuration(feedbackBreakMillis)
    };
  } catch (e) {
    Logger.log("getHomePageData Error: " + e.message);
    return { success: false, error: "Failed to load dashboard data." };
  }
}

function startBreak(breakReason, comment) {
  try {
    const email = Session.getActiveUser().getEmail();
    const timestamp = new Date();
    const uniqueId = `BRK-${email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '')}-${timestamp.getTime()}`;
    breakLogSheet.appendRow([timestamp, uniqueId, email, breakReason, comment || "", "", ""]);
    return getHomePageData();
  } catch (e) {
    Logger.log("startBreak Error: " + e.message);
    return { success: false, error: e.message };
  }
}

function endBreak(uniqueId) {
  try {
    const endTime = new Date();
    const uniqueIds = breakLogSheet.getRange("B2:B" + breakLogSheet.getLastRow()).getValues().flat();
    const rowIndex = uniqueIds.lastIndexOf(uniqueId);
    if (rowIndex === -1) throw new Error("Break ID not found");

    const row = rowIndex + 2;
    const startTime = new Date(breakLogSheet.getRange(row, 1).getValue());
    breakLogSheet.getRange(row, 6).setValue(endTime);
    breakLogSheet.getRange(row, 7).setValue(formatDuration(endTime.getTime() - startTime.getTime()));
    return getHomePageData();
  } catch (e) {
    Logger.log("endBreak Error: " + e.message);
    return { success: false, error: e.message };
  }
}

function checkSupervisorAccess() {
  try {
    const email = Session.getActiveUser().getEmail().toLowerCase();
    const access = accessSheet.getRange("B2:C" + accessSheet.getLastRow()).getValues();
    const match = access.find(row => row[0]?.toLowerCase() === email && row[1] === "Yes");
    return match ? { success: true, name: match[0].split('@')[0] } : { success: false, message: "Access denied." };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

function getSupervisorDashboardData() {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const data = breakLogSheet.getDataRange().getValues();
    const liveBreaks = [], logs = [], totals = {}, personal = PERSONAL_BREAK_REASONS.map(x => x.toLowerCase());

    data.slice(1).forEach(row => {
      const start = new Date(row[0]);
      if (isNaN(start.getTime()) || start < today) return;

      const email = row[2];
      if (!email) return;

      const user = email.split('@')[0];
      const reason = row[3] || '', end = row[5], duration = row[6] || '', comment = row[4] || '';

      logs.push({ user, start: formatDateWithAmPm(start), end: end ? formatDateWithAmPm(new Date(end)) : 'Live', reason, comment, duration });

      if (!end) {
        liveBreaks.push({ user, reason, startTimeMillis: start.getTime() });
      } else {
        const dur = new Date(end).getTime() - start.getTime();
        if (!totals[email]) totals[email] = { personal: 0, feedback: 0 };
        if (personal.includes(reason.toLowerCase())) {
          totals[email].personal += dur;
        } else {
          totals[email].feedback += dur;
        }
      }
    });

    const formatted = Object.keys(totals).map(email => ({
      user: email.split('@')[0],
      personal: formatDuration(totals[email].personal),
      feedback: formatDuration(totals[email].feedback)
    }));

    return { success: true, liveBreaks, breakTotals: formatted, allTodayLogs: logs.reverse() };
  } catch (e) {
    Logger.log("getSupervisorDashboardData Error: " + e.message);
    return { success: false, error: e.message };
  }
}

function getReport(startDateStr, endDateStr) {
  try {
    const start = new Date(startDateStr), end = new Date(endDateStr);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    const data = breakLogSheet.getDataRange().getValues().slice(1);

    const filtered = data.filter(row => {
      const d = new Date(row[0]);
      return d >= start && d <= end;
    }).map(row => [
      formatDateWithAmPm(new Date(row[0])),
      row[5] ? formatDateWithAmPm(new Date(row[5])) : 'In Progress',
      row[3] || '',
      row[4] || '',
      row[6] || ''
    ]);

    return { success: true, headers: ["Start Time", "End Time", "Reason", "Comment", "Duration"], data: filtered };
  } catch (e) {
    Logger.log("getReport Error: " + e.message);
    return { success: false, error: e.message };
  }
}

function createReportAsSheet(startDate, endDate) {
  try {
    const raw = getReport(startDate, endDate);
    if (!raw.data?.length) return { success: false, error: "No data found." };

    const reportSheet = SpreadsheetApp.create(`Break Report ${startDate} to ${endDate}`).getActiveSheet();
    reportSheet.appendRow(raw.headers);
    reportSheet.getRange(2, 1, raw.data.length, raw.headers.length).setValues(raw.data);
    reportSheet.autoResizeColumns(1, raw.headers.length);

    return { success: true, url: reportSheet.getParent().getUrl() };
  } catch (e) {
    Logger.log("createReportAsSheet Error: " + e.message);
    return { success: false, error: e.message };
  }
}
