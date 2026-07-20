const { execFileSync } = require("child_process");

function toAppleScriptString(value) {
  return `"${String(value)
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")}"`;
}

function requestViaChromeSession({
  method = "GET",
  url,
  headers = {},
  body = null,
  urlMatch,
}) {
  if (!url) {
    throw new Error("url is required");
  }

  const browserPayload = `
    (function () {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open(${JSON.stringify(method)}, ${JSON.stringify(url)}, false);
        var headers = ${JSON.stringify(headers)};
        Object.keys(headers).forEach(function (key) {
          xhr.setRequestHeader(key, headers[key]);
        });
        xhr.send(${body === null ? "null" : JSON.stringify(body)});
        return JSON.stringify({
          ok: true,
          status: xhr.status,
          statusText: xhr.statusText,
          responseURL: xhr.responseURL,
          text: xhr.responseText
        });
      } catch (error) {
        return JSON.stringify({
          ok: false,
          error: String(error),
          stack: error && error.stack ? String(error.stack) : null
        });
      }
    })();
  `.trim();

  const appleScript = `
    on run argv
      set urlMatch to item 1 of argv
      set jsPayload to item 2 of argv
      tell application "Google Chrome"
        set targetTab to missing value
        try
          set frontTab to active tab of front window
          if (URL of frontTab) contains urlMatch then set targetTab to frontTab
        end try
        if targetTab is missing value then
          repeat with windowIndex from 1 to count of windows
            set candidateWindow to window windowIndex
            set tabCount to count of tabs of candidateWindow
            repeat with tabIndex from 1 to tabCount
              try
                set candidateTab to tab tabIndex of candidateWindow
                if (URL of candidateTab) contains urlMatch then
                  set targetTab to candidateTab
                  exit repeat
                end if
              end try
            end repeat
            if targetTab is not missing value then exit repeat
          end repeat
        end if
        if targetTab is missing value then error "No Chrome tab matched " & urlMatch
        return execute targetTab javascript jsPayload
      end tell
    end run
  `.trim();

  const stdout = execFileSync(
    "osascript",
    ["-e", appleScript, urlMatch, browserPayload],
    { encoding: "utf8", maxBuffer: 1024 * 1024 * 20 }
  ).trim();

  const parsed = JSON.parse(stdout);
  if (!parsed.ok) {
    const error = new Error(parsed.error || "Chrome session request failed");
    error.body = parsed;
    throw error;
  }

  return parsed;
}

module.exports = {
  requestViaChromeSession,
  toAppleScriptString,
};
