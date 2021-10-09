import { serve, ServerRequest } from 'https://deno.land/std@0.104.0/http/server.ts';
import { readAll } from 'https://deno.land/std@0.104.0/io/util.ts';
import { resolve } from 'https://deno.land/std@0.104.0/path/mod.ts';
import { Database } from './database.ts';
import { computeBundleIconHref, computeBundleIconMarkup, handleBundleIconRequest } from './icons.ts';
import { importReportFile } from './importer.ts';
import { TIMESTAMP } from './model.ts';

const port = 8015;
const server = serve({ port });
const origin = `http://localhost:${port}`;
console.log(`HTTP webserver running.  Access it at: ${origin}/`);

const dbName = 'reports.db';
const FILENAME = '[a-zA-Z0-9_-]+';
const DEBUG = false;

for await (const request of server) {
    console.log(`${request.method} ${request.url}`);
    const url = new URL(`${origin}${request.url}`);
    const get = request.method === 'GET';
    const post = request.method === 'POST';
    try {
        if (get && new RegExp(`^/(${FILENAME})?$`).test(url.pathname)) {
            doWithDatabase(db => {
                const result = handleHtml(db, url);
                if (typeof result === 'string') {
                    request.respond({ status: 200, body: result, headers: new Headers({ 'Content-Type': 'text/html; charset=utf-8' }) });
                } else if (typeof result === 'number') {
                    request.respond({ status: 404, body: 'not found' });
                } else {
                    request.respond({ status: 302, body: '', headers: new Headers({ 'Location': result.redirectHref }) });
                }
            });
        } else if (get && /^\/icon\/[A-Za-z0-9\.-]+$/.test(url.pathname)) {
            const response = await handleBundleIconRequest(url.pathname.split('/').pop()!);
            request.respond(response);
        } else if (post && url.pathname === '/') {
            const response = await handlePost(request);
            request.respond({ status: 200, body: JSON.stringify(response) });
        } else {
            request.respond({ status: 404, body: 'not found' });
        }
    } catch (e) {
        console.error(e);
        const errorObj = {
            error: `${e}`,
            errorDetail: `${e.stack || e}`,
        };
        request.respond({ status: 500, body: JSON.stringify(errorObj) });
    }
}

//

interface ListItem {
    readonly href: string;
    readonly text: string;
    readonly selected: boolean;
    readonly imageHref?: string;
}

//

function doWithDatabase(fn: (db: Database) => void) {
    const db = new Database(dbName);
    try {
        fn(db);
    } finally {
        db.close();
    }
}

function computeFilename(request: ServerRequest) {
    const filename = request.headers.get('x-filename') || '';
    const m = new RegExp(`^(${FILENAME})\\.(nd)?json$`).exec(filename);
    if (!m) throw new Error(`Bad filename: ${filename}`);
    return m[1];
}

async function handlePost(request: ServerRequest): Promise<Record<string, unknown>> {
    if (DEBUG) {
        for (const [name, value] of request.headers.entries()) {
            console.log(`${name}: ${value}`);
        }
    }
    const filename = computeFilename(request);

    const bytes = await readAll(request.body);
    if (DEBUG) console.log(`${bytes.length} bytes`);
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(bytes);
    doWithDatabase(db => {
        importReportFile(text, filename, db);
    });
    return { filename };
}

function renderListHtml(items: ListItem[], lines: string[]) {
    lines.push('<ul>');
    for (const item of items) {
        const anchor = `<a href="${item.href}">${item.text}</a>`;
        lines.push(`<li${item.selected ? ' class="selected"' : ''}>${item.imageHref ? `<div class="flex"><img class="icon" src="${item.imageHref}" />${anchor}</div>` : anchor}</li>`);
    }
    lines.push('</ul>');
}

function computeHref(url: URL, name: string, value?: string): string {
    const u = new URL(url.toString());
    if (value) {
        u.searchParams.set(name, value);
    } else {
        u.searchParams.delete(name);
    }
    return makeHref(u.pathname, u.searchParams);
}

function makeHref(pathname: string, qp: URLSearchParams) {
    let rt = pathname;
    if ([...qp.keys()].length > 0) {
        rt += '?' + qp.toString();
    }
    return rt;
}

function formatTimestamp(timestamp: string): string {
    const m = TIMESTAMP.exec(timestamp);
    return m ? m[2] : timestamp.substring(11);
}

function handleHtml(db: Database, url: URL): string | { redirectHref: string } | number {
    const tokens = url.pathname.split('/').filter(v => v !== '');
    const filename = tokens.length > 0 ? tokens[0] : undefined;
    const date = url.searchParams.get('date') || undefined;
    const type = url.searchParams.get('type') || undefined;
    const bundleId = url.searchParams.get('bundleId') || undefined;

    const filenames = db.getFilenames();
    if (!filename && filenames.length > 0) {
        return { redirectHref: makeHref(`/${filenames[0]}`, url.searchParams) };
    }
    if (filename && !filenames.includes(filename)) return 404;

    const lines: string[] = [];
    lines.push(`<header>Drop an app-privacy-report.json anywhere on the page to import</header>`);
    lines.push('<main>');
    lines.push('<div>');
    renderListHtml(filenames.map(v => ({ selected: filename === v, href: makeHref(`/${v}`, url.searchParams), text: v})), lines);
    if (filename) {
        const dates = db.getDates(filename);
        const dateList = dates.map(v => ({ selected: date === v, href: computeHref(url, 'date', v), text: v}));
        dateList.unshift({ selected: date === undefined, href: computeHref(url, 'date'), text: '(all utc days)'});
        renderListHtml(dateList, lines);

        const types = db.getTypes(filename);
        const typeList = types.map(v => ({ selected: type === v, href: computeHref(url, 'type', v), text: v}));
        typeList.unshift({ selected: type === undefined, href: computeHref(url, 'type'), text: '(all types)'});
        renderListHtml(typeList, lines);

        const bundleIds = db.getBundleIds(filename);
        const bundleIdList: ListItem[] = bundleIds.map(v => ({ selected: bundleId === v, href: computeHref(url, 'bundleId', v), text: v, imageHref: computeBundleIconHref(v) }));
        bundleIdList.unshift({ selected: bundleId === undefined, href: computeHref(url, 'bundleId'), text: '(all bundleIds)' });
        renderListHtml(bundleIdList, lines);
    }
    lines.push('</div>');
    lines.push('<div id="rhs">');
    if (filename) {
        lines.push('<div id="utchint"><em>All dates and times in utc</em></div>');
        const commonSummariesByDate = db.getCommonSummariesByDate(filename, { date, type, bundleId });

        lines.push('<table>');
        for (const date of [...commonSummariesByDate.keys()].sort().reverse()) {
            lines.push(`<tr><td colspan="6"><h3><a href="${computeHref(url, 'date', date)}">${date}</a></h3></td></tr>`);

            const showDomains = type === undefined || !type.startsWith('access');
            const commonSummariesForDate = commonSummariesByDate.get(date)!;
            let lastBundleId: string | undefined;
            for (let i = 0; i < commonSummariesForDate.length; i++) {
                const { accessSummary, domainSummary } = commonSummariesForDate[i];
                if (accessSummary) {
                    const { stream, bundleId, timestampStart, timestampEnd } = accessSummary;
                    const type = 'access/' + stream;
                    let typeLink = `<a href="${computeHref(url, 'type', type)}">${type}</a>`;
                    const bundleIconMarkup = computeBundleIconMarkup(bundleId, lastBundleId);
                    const bundleIdLink = `<a href="${computeHref(url, 'bundleId', bundleId)}">${bundleId}</a>`;
                    const time = formatTimestamp(timestampStart);
                    const timeEnd = timestampEnd ? formatTimestamp(timestampEnd) : '';
                    let count = 1;
                    while (timeEnd === '' && i < (commonSummariesForDate.length - 1)) {
                        // coalesce access duplicates for same time second
                        // there can be multiple address book accesses in the same second, for example
                        const { accessSummary: nextAccessSummary } = commonSummariesForDate[i + 1];
                        if (nextAccessSummary && nextAccessSummary.stream === stream && nextAccessSummary.bundleId === bundleId && formatTimestamp(nextAccessSummary.timestampStart) === time) {
                            count++;
                            i++;
                        } else {
                            break;
                        }
                    }
                    if (count > 1) typeLink += ` x${count}`;
                    lines.push(`<tr><td>${time}</td><td>${timeEnd}</td><td>${bundleIconMarkup}</td><td>${bundleIdLink}</td><td></td><td>${typeLink}</td></tr>`);
                    lastBundleId = bundleId;
                }
                if (domainSummary && showDomains) {
                    const { bundleId, domain, timestamp, hits } = domainSummary;
                    const bundleIconMarkup = computeBundleIconMarkup(bundleId, lastBundleId);
                    const bundleIdLink = `<a href="${computeHref(url, 'bundleId', bundleId)}">${bundleId}</a>`;
                    const domainLocal = domain.endsWith('.local');
                    const domainHtml = domainLocal ? domain : `<a class="domain" href="https://host.io/${domain}" target="_blank" rel="noreferrer noopener nofollow">${domain}</a>`;
                    lines.push(`<tr><td>${formatTimestamp(timestamp)}</td><td></td><td>${bundleIconMarkup}</td><td>${bundleIdLink}</td><td>${hits}</td><td>${domainHtml}</td></tr>`);
                    lastBundleId = bundleId;
                }
            }
        }
        lines.push('</table>');
    }
    lines.push('</div>');
    lines.push('</main>');
    if (filenames.length > 0) lines.push(`<footer>Underlying sqlite db: ${resolve(dbName)}</footer>`);

    return `
<html>
  <head>
    <title>app-privacy-report-viewer</title>
    <script>
        function onDrop(event) {
            event.preventDefault();
            console.log('onDrop', event);

            const header = document.getElementsByTagName('header')[0];
            header.textContent = 'Importing...';
            try {
                const files = [];
                if (event.dataTransfer.items) {
                    for (let item of event.dataTransfer.items) {
                        if (item.kind === 'file') {
                            files.push(item.getAsFile());
                        } else {
                            console.log('Bad item.kind: expected file, found ' + item.kind, item);
                        }
                    }
                } else {
                    for (let file of event.dataTransfer.files) {
                        files.push(file);
                    }
                }
                if (files.length === 0) {
                    header.textContent = 'Nothing to import';
                    return;
                }
                Promise.all(files.map(importFile)).then(results => {
                    const errors = results.filter(v => v.error);
                    if (errors.length > 0) {
                        header.textContent = errors.map(v => v.error).join(', ');
                    }
                    const lastFilename = results.filter(v => v.filename).map(v => v.filename).pop();
                    if (lastFilename) {
                        document.location = '/' + lastFilename;
                    }
                });
            } catch (e) {
                header.textContent = e;
            }
        }

        function onDragOver(event) {
           event.preventDefault();
        }

        function importFile(file) {
            let status = 0;
            return fetch('/', { method: 'POST', body: file, headers: { 'x-filename': file.name } }).then(v => { status = v.status; return v.json(); }).then(v => {
                if (status !== 200)  {
                    return { error: v.error, errorDetail: v.errorDetail };
                }
                return v;
            }).catch(e => {
                return { error: e.toString(), errorDetail: e.stack };
            });
        }
    </script>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, avenir next, avenir, helvetica neue, helvetica, Ubuntu, roboto, noto, segoe ui, arial, sans-serif;
            background-color: #ffffff;

            color: #000000
            text-rendering: optimizeLegibility;
            -webkit-font-smoothing: antialiased;
            margin: 0;
            padding: 0;
            font-size: smaller;
            height: 100%;
        }

        a, a:visited {
            text-decoration: none;
            color: blue;
        }

        a:hover {
            text-decoration: underline;
            color: blue;
        }

        header, footer {
            padding: 1rem;
            background-color: #eeeeee;
        }

        main {
            display: flex;
        }

        li.selected {
            background-color: #eeeeee;
        }

        li {
            padding: 0.25em 0.25em;
        }

        #rhs {
            margin: 0 1rem;
        }

        #utchint {
            margin: 1em 1em 0 1em;
        }

        table {
            font-size: smaller;
            border-spacing: 1rem 0.25rem;
        }

        table a, table a:visited {
            color: #000000;
        }

        table a:hover {
            text-decoration: underline;
            color: blue;
        }

        a.domain:hover:after {
            position: relative;
            content: " lookup ↗︎";
            color: #888888;
        }

        h3 {
            margin: 1rem 0;
        }
        
        img.icon {
            width: 15px;
            height: 15px;
        }

        li img.icon {
            padding-right: 0.25em;
        }    

        .flex {
            display: flex;
            align-items: center;
        }

    </style>
  </head>
  <body id="drop_zone" ondrop="onDrop(event);" ondragover="onDragOver(event);">
    ${lines.join('\n')}
  <body>  
</html>
`
}
