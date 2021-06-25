import { DB } from 'https://deno.land/x/sqlite@v2.4.2/mod.ts';
import { AccessRecord, checkAccessRecord, checkDomainRecord, DomainRecord, isAccessRecordBeta1, isAccessRecordBeta2, isDomainRecordBeta1 } from './model.ts';

const VERSION = 2;

export class Database {
    private readonly _db: DB;

    constructor(path: string) {
        this._db = new DB(path);

        this._db.query(`create table if not exists access${VERSION}(
            filename text not null,
            line integer not null,
            stream text null,
            accessorIdentifier text not null,
            accessorIdentifierType text not null,
            tccService text,
            identifier text not null,
            kind text not null,
            timestamp text not null,
            version integer null,
            category text null,
            primary key (filename, line)) without rowid`);

        this._db.query(`create table if not exists domain${VERSION}(
            filename text not null,
            bundleId text not null,
            domain text not null,
            context text not null,
            initiatedType string not null,
            effectiveUserId number null,
            domainType number not null,
            timeStamp text not null,
            hasAppBundleName text null,
            hits integer not null,
            domainOwner string not null,
            firstTimeStamp string not null,
            primary key (filename, bundleId, domain, context, initiatedType)) without rowid`);
    }

    getFilenames(): string[] {
        const filenames = [...this._db.query(`select distinct filename from access${VERSION} union select distinct filename from domain${VERSION} order by filename desc`)].map(([filename]) => filename);
        return filenames;
    }

    getDates(filename: string) {
        const date = [...this._db.query(`select distinct substr(timestamp, 1, 10) date from access${VERSION} where filename = ? union select distinct substr(timestamp, 1, 10) date from domain${VERSION} where filename = ? order by date desc`, [filename, filename])].map(([date]) => date);
        return date;
    }

    getBundleIds(filename: string) {
        const bundleId = [...this._db.query(`select distinct accessorIdentifier bundleId from access${VERSION} where filename = ? union select bundleId from domain${VERSION} where filename = ? order by bundleId`, [filename, filename])].map(([bundleId]) => bundleId);
        return bundleId;
    }

    getTypes(filename: string): string[] {
        const streams = [...this._db.query(`select distinct stream, tccService, category from access${VERSION} where filename = ? order by stream, tccService, category`, [filename])].map(([stream, tccService, category]) => computeStream(stream, tccService, category));
        const rt = streams.map(v => `access/${v}`);
        rt.unshift('access');
        rt.push('domains');
        return rt;
    }

    clearAccess(filename: string) {
        this._db.query(`delete from access${VERSION} where filename = ?`, [ filename ]);
    }

    insertAccess(filename: string, line: number, record: AccessRecord) {
        checkAccessRecord(record);
        const version = isAccessRecordBeta1(record) ? record.version : undefined;
        const stream = isAccessRecordBeta1(record) ? record.stream : undefined;
        const category = isAccessRecordBeta2(record) ? record.category : undefined;

        this._db.query(`insert into access${VERSION}(filename, line, stream, accessorIdentifier, accessorIdentifierType, tccService, identifier, kind, timestamp, version, category) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [filename, line, stream, record.accessor.identifier, record.accessor.identifierType, record.tccService, record.identifier, record.kind, record.timestamp, version, category]);
        if (this._db.changes !== 1) throw new Error(`Failed to insert access record`);
    }

    clearDomain(filename: string) {
        this._db.query(`delete from domain${VERSION} where filename = ?`, [ filename ]);
    }

    insertDomain(filename: string, bundleId: string, record: DomainRecord) {
        checkDomainRecord(record);
        const effectiveUserId = isDomainRecordBeta1(record) ? record.effectiveUserId : undefined;
        const hasAppBundleName = isDomainRecordBeta1(record) ? record['hasApp.bundleName'] : undefined;
        this._db.query(`insert into domain${VERSION}(filename, bundleId, domain, effectiveUserId, domainType, timeStamp, hasAppBundleName, context, hits, domainOwner, initiatedType, firstTimeStamp) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [filename, bundleId, record.domain, effectiveUserId, record.domainType, record.timeStamp, hasAppBundleName, record.context, record.hits, record.domainOwner, record.initiatedType, record.firstTimeStamp]);
        if (this._db.changes !== 1) throw new Error(`Failed to insert domain record`);
    }

    getAccessSummariesByDate(filename: string, opts: { date?: string, type?: string, bundleId?: string } = {}): Map<string, AccessSummary[]> {
        const rows = this._db.query(`select stream, tccService, accessorIdentifier, timestamp, identifier, kind, category from access${VERSION} where filename = ?`, [ filename ]);

        const summariesByIdentifier = new Map<string, AccessSummary>();
        for (const [stream, tccService, accessorIdentifier, timestamp, identifier, kind, category] of rows) {
            let timestampStart = kind === 'intervalEnd' ? undefined : timestamp;
            let timestampEnd = kind === 'intervalEnd' ? timestamp : undefined;
            let date = timestampStart ? timestampStart.substring(0, 10) : undefined;
            const existing = summariesByIdentifier.get(identifier);
            if (!existing) {
                // ensure timestampStart & date have initial defined values (in case we don't get an intervalStart), this is better than nothing
                timestampStart = timestamp; 
                date = timestampStart.substring(0, 10);
                summariesByIdentifier.set(identifier, { date, stream: computeStream(stream, tccService, category), bundleId: accessorIdentifier, timestampStart, timestampEnd });
            } else {
                timestampStart = timestampStart || existing.timestampStart;
                timestampEnd = timestampEnd || existing.timestampStart;
                date = date || existing.date;
                summariesByIdentifier.set(identifier, { ...existing, timestampStart, timestampEnd, date });
            }
        }

        const summariesByDate = new Map<string, AccessSummary[]>();
        for (const summary of summariesByIdentifier.values()) {
            const date = summary.date;
            if (opts.date && opts.date !== date) continue;
            if (opts.type && !streamMatchesType(summary.stream, opts.type)) continue;
            if (opts.bundleId && opts.bundleId !== summary.bundleId) continue;
            if (!summariesByDate.has(date)) {
                summariesByDate.set(date, []);
            }
            summariesByDate.get(date)!.push(summary);
        }

        sortByTimestampDescending(summariesByDate, v => v.timestampStart);

        return summariesByDate;
    }

    getDomainSummariesByDate(filename: string, opts: { date?: string, bundleId?: string } = {}): Map<string, DomainSummary[]> {
        const rows = this._db.query(`select timestamp, bundleId, domain, hits from domain${VERSION} where filename = ?`, [ filename ]);

        const summariesByDate = new Map<string, DomainSummary[]>();
        for (const [timestamp, bundleId, domain, hits] of rows) {
            const date = timestamp.substring(0, 10);
            if (opts.date && opts.date !== date) continue;
            if (opts.bundleId && opts.bundleId !== bundleId) continue;
            if (!summariesByDate.has(date)) {
                summariesByDate.set(date, []);
            }
            summariesByDate.get(date)!.push({ date, bundleId, timestamp, domain, hits });
        }

        sortByTimestampDescending(summariesByDate, v => v.timestamp);

        return summariesByDate;
    }

    getCommonSummariesByDate(filename: string, opts: { date?: string, type?: string, bundleId?: string } = {}): Map<string, CommonSummary[]> {
        const accessSummariesByDate = this.getAccessSummariesByDate(filename, opts);
        const domainSummariesByDate = this.getDomainSummariesByDate(filename, opts);
        const commonSummariesByDate = new Map<string, CommonSummary[]>();
        for (const date of accessSummariesByDate.keys()) {
            for (const accessSummary of accessSummariesByDate.get(date)!) {
                const timestamp = accessSummary.timestampStart;
                if (!commonSummariesByDate.has(date)) {
                    commonSummariesByDate.set(date, []);
                }
                commonSummariesByDate.get(date)!.push({ timestamp, accessSummary });
            }
        }
        for (const date of domainSummariesByDate.keys()) {
            for (const domainSummary of domainSummariesByDate.get(date)!) {
                const timestamp = domainSummary.timestamp;
                if (!commonSummariesByDate.has(date)) {
                    commonSummariesByDate.set(date, []);
                }
                commonSummariesByDate.get(date)!.push({ timestamp, domainSummary });
            }
        }

        sortByTimestampDescending(commonSummariesByDate, v => v.timestamp);

        return commonSummariesByDate;
    }

    close() {
        this._db.close();
    }
    
}

//

export interface AccessSummary {
    readonly date: string;
    readonly stream: string;
    readonly bundleId: string;
    readonly timestampStart: string;
    readonly timestampEnd?: string;
}

export interface DomainSummary {
    readonly date: string;
    readonly bundleId: string;
    readonly timestamp: string;
    readonly domain: string;
    readonly hits: number;
}

export interface CommonSummary {
    timestamp: string;
    accessSummary?: AccessSummary;
    domainSummary?: DomainSummary;
}

//

function computeStream(stream: string, tccService: string | undefined, category: string | undefined): string {
    if (category) return category;
    let rt = stream;
    if (rt.startsWith('com.apple.privacy.accounting.stream.')) rt = rt.substring('com.apple.privacy.accounting.stream.'.length);
    if (tccService) {
        rt += '/' + tccService;
    }
    return rt;
}

function streamMatchesType(stream: string, type: string): boolean {
    return type === 'access' || type === `access/${stream}`;
}

function sortByTimestampDescending<T>(valuesByDate: Map<string, T[]>, timestampFn: (item: T) => string) {
    for (const summaries of valuesByDate.values()) {
        summaries.sort((lhs, rhs) => -timestampFn(lhs).localeCompare(timestampFn(rhs)));
    }
}
