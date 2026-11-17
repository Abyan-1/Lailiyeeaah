module.exports = async (req, res) => {
  const report = {};
  try {
    try {
      require("../lib/util");
      report.util = "OK";
    } catch (e) {
      report.util_err = { message: e.message, stack: e.stack };
    }

    try {
      require("../lib/notif");
      report.notif = "OK";
    } catch (e) {
      report.notif_err = { message: e.message, stack: e.stack };
    }

    try {
      require("../lib/push");
      report.push = "OK";
    } catch (e) {
      report.push_err = { message: e.message, stack: e.stack };
    }

    try {
      require("../lib/chat");
      report.chat = "OK";
    } catch (e) {
      report.chat_err = { message: e.message, stack: e.stack };
    }

    try {
      require("web-push");
      report.webpush = "OK";
    } catch (e) {
      report.webpush_err = { message: e.message, stack: e.stack };
    }

    return res.status(200).json(report);
  } catch (fatal) {
    return res.status(500).json({ fatal: fatal.message, stack: fatal.stack });
  }
};
