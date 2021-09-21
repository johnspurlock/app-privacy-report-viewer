# app-privacy-report-viewer
Local viewer for App Privacy Reports in iOS 15

iOS 15 beta introduces a new feature in Privacy Settings called [Record App Activity](https://developer.apple.com/documentation/ios-ipados-release-notes/ios-ipados-15-release-notes#Privacy).

When enabled, you can save Save App Activity to dump the data to a newline-delimited json file of the form `App_Privacy_Report_v4_<time>.ndjson`

e.g.
```json
{
  "stream": "com.apple.privacy.accounting.stream.tcc",
  "accessor": { "identifier": "com.google.ProjectFi", "identifierType": "bundleID" },
  "tccService": "kTCCServiceAddressBook",
  "identifier": "BE766661-F44C-46F8-A3E5-258FAE68D603",
  "kind": "event",
  "timestamp": "2021-06-09T14:19:48.270-05:00",
  "version": 3
}
```

This tool is a simple app to import these files and display them in a web interface running on your local computer.

To get started:
 - Ensure `deno` is installed (it's [easy to install](https://deno.land/#installation))
 - Run ``deno run --allow-net --allow-env --allow-read=.,`which deno` --allow-write=. https://raw.githubusercontent.com/johnspurlock/app-privacy-report-viewer/v0.6/src/app.ts``
 - Open the locally-running web app at http://localhost:8015
 - Drag and drop your `App_Privacy_Report_v4_<time>.ndjson` file into the web app

---

Once imported, you can filter by filename, date, type of access, and bundleId (app).

For example, filter to all activity from the Apple Podcasts app: http://localhost:8015/?bundleId=com.apple.podcasts

![Screenshot of webapp](https://github.com/johnspurlock/app-privacy-report-viewer/raw/master/screenshot.png)

---

The data never leaves your machine, it's stored locally in a sqlite db called `reports.db` in your run directory, so you can open it for custom queries with any standard sqlite client like [DB Browser for SQLite](https://sqlitebrowser.org/).

All processing is done on your local machine (should be able to run it offline after first launch), and the code is available here on github for full transparency.
