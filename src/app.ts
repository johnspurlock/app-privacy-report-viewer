import { serve, ServerRequest } from 'https://deno.land/std@0.98.0/http/server.ts';
import { readAll } from 'https://deno.land/std@0.98.0/io/util.ts';
import { Database } from './database.ts';
import { importReportFile } from './importer.ts';

const port = 8015;
const server = serve({ port });
const origin = `http://localhost:${port}`;
console.log(`HTTP webserver running.  Access it at: ${origin}/`);

const dbName = 'reports.db';
const FILENAME = '[a-zA-Z0-9-]+';

for await (const request of server) {
    console.log(`${request.method} ${request.url}`);
    const url = new URL(`${origin}${request.url}`);
    const get = request.method === 'GET';
    const post = request.method === 'POST';
    try {
        if (get && new RegExp(`^/(${FILENAME})?$`).test(url.pathname)) {
            doWithDatabase(db => {
                const body = handleHtml(db, url);
                request.respond({ status: 200, body });
            });
        } else if (post && url.pathname === '/') {
            const response = await handlePost(request);
            request.respond({ status: 200, body: JSON.stringify(response) });
        } else {
            request.respond({ status: 404, body: 'not found' });
        }
    } catch (e) {
        console.error(e);
        request.respond({ status: 500, body: `${e.stack || e}` });
    }
}

//

interface ListItem {
    readonly href: string;
    readonly text: string;
    readonly selected: boolean;
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
    const m = new RegExp(`^(${FILENAME})\\.json$`).exec(filename);
    if (!m) throw new Error(`Bad filename: ${filename}`);
    return m[1];
}

async function handlePost(request: ServerRequest): Promise<Record<string, unknown>> {
    for (const [name, value] of request.headers.entries()) {
        console.log(`${name}: ${value}`);
    }
    const filename = computeFilename(request);

    const bytes = await readAll(request.body);
    console.log(`${bytes.length} bytes`);
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
        lines.push(`<li${item.selected ? ' class="selected"' : ''}><a href="${item.href}">${item.text}</a></li>`);
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
    let rt = u.pathname;
    if ([...u.searchParams.keys()].length > 0) {
        rt += '?' + u.searchParams.toString();
    }
    return rt;
}

function handleHtml(db: Database, url: URL): string {
    const tokens = url.pathname.split('/').filter(v => v !== '');
    const filename = tokens.length > 0 ? tokens[0] : undefined;
    const date = url.searchParams.get('date') || undefined;
    const stream = url.searchParams.get('stream') || undefined;
    const bundleId = url.searchParams.get('bundleId') || undefined;

    const filenames = db.getFilenames();
    const lines: string[] = [];

    lines.push('<div>');
    renderListHtml(filenames.map(v => ({ selected: filename === v, href: `/${v}`, text: v})), lines);

    if (filename) {
        const dates = db.getDates(filename);
        const dateList = dates.map(v => ({ selected: date === v, href: computeHref(url, 'date', v), text: v}));
        dateList.unshift({ selected: date === undefined, href: computeHref(url, 'date'), text: 'all'});
        renderListHtml(dateList, lines);

        const streams = db.getStreams(filename);
        const streamList = streams.map(v => ({ selected: stream === v, href: computeHref(url, 'stream', v), text: v}));
        streamList.unshift({ selected: stream === undefined, href: computeHref(url, 'stream'), text: 'all'});
        renderListHtml(streamList, lines);

        const bundleIds = db.getBundleIds(filename);
        const bundleList = bundleIds.map(v => ({ selected: bundleId === v, href: computeHref(url, 'bundleId', v), text: v}));
        bundleList.unshift({ selected: bundleId === undefined, href: computeHref(url, 'bundleId'), text: 'all'});
        renderListHtml(bundleList, lines);
    }
    lines.push('</div>');
    lines.push('<div id="rhs">');
    if (filename) {
        const accessSummaries = db.getAccessSummariesByDate(filename, { date, stream, bundleId });
        lines.push('<table>');
        for (const date of [...accessSummaries.keys()].sort().reverse()) {
            lines.push(`<tr><td colspan="4"><h3>${date}</h3></td></tr>`);
            for (const summary of accessSummaries.get(date)!) {
                lines.push(`<tr><td>${summary.timestampStart.substring(11)}</td><td>${summary.timestampEnd?.substring(11) || ''}</td><td>${summary.stream}</td><td>${summary.bundleId}</td></tr>`);
            }
            
        }
        lines.push('</table>');
    }
    lines.push('</div>');

    return `
<html>
  <head>
    <title>app-privacy-report-viewer</title>
    <script>
        function onDrop(event) {
            event.preventDefault();
            console.log('onDrop', event);

            if (event.dataTransfer.items) {
                for (let item of event.dataTransfer.items) {
                    if (item.kind === 'file') {
                        processFile(item.getAsFile());
                    } else {
                        console.log('Bad item.kind: expected file, found ' + item.kind, item);
                    }
                }
            } else {
                for (let file of event.dataTransfer.files) {
                    processFile(file);
                }
            }
      }

      function onDragOver(event) {
        event.preventDefault();
      }

      function processFile(file) {
        fetch('/', { method: 'POST', body: file, headers: { 'x-filename': file.name } }).then(v => v.json()).then(v => {
            document.location = '/' + v.filename;
        }).catch(e => console.error('fetch failed'));
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
           
        }

        body, table {
            font-size: smaller;
        }

        h3 {
            margin: 1rem 0;
        }

        #rhs {
            margin: 0 1rem;
        }

        header {
            padding: 1rem;
            background-color: #eeeeee;
        }

        main {
            display: flex;
        }
        
        li.selected {
            background-color: #eeeeee;
        }
    </style>
  </head>
  <body id="drop_zone" ondrop="onDrop(event);" ondragover="onDragOver(event);">
    <header>Drop an app-privacy-report.json anywhere on the page to import</header>
    <main>
    ${lines.join('\n')}
    </main>
  <body>  
</html>
`
}
