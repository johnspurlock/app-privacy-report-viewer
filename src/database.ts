import { DB } from 'https://deno.land/x/sqlite@v2.4.2/mod.ts';
import { AccessRecord, DomainRecord } from './model.ts';

export class Database {
    private readonly _db: DB;

    constructor(path: string) {
        this._db = new DB(path);

        this._db.query(`create table if not exists access(
            filename text not null,
            line integer not null,
            stream text not null,
            accessorIdentifier text not null,
            accessorIdentifierType text not null,
            tccService text,
            identifier text not null,
            kind text not null,
            timestamp text not null,
            version integer not null,
            primary key (filename, line)) without rowid`);

        this._db.query(`create table if not exists domain(
            filename text not null,
            bundleId text not null,
            domain text not null,
            context text not null,
            initiatedType string not null,
            effectiveUserId number not null,
            domainType number not null,
            timeStamp text not null,
            hasAppBundleName text not null,
            hits integer not null,
            domainOwner string not null,
            firstTimeStamp string not null,
            primary key (filename, bundleId, domain, context, initiatedType)) without rowid`);
    }

    getFilenames(): string[] {
        const filenames = [...this._db.query(`select distinct filename from access union select distinct filename from domain`)].map(([filename]) => filename);
        return filenames;
    }

    getDates(filename: string) {
        const date = [...this._db.query(`select distinct substr(timestamp, 1, 10) date from access where filename = ? union select distinct substr(timestamp, 1, 10) date from domain where filename = ? order by date desc`, [filename, filename])].map(([date]) => date);
        return date;
    }

    getBundleIds(filename: string) {
        const bundleId = [...this._db.query(`select distinct accessorIdentifier bundleId from access where filename = ? union select bundleId from domain where filename = ? order by bundleId`, [filename, filename])].map(([bundleId]) => bundleId);
        return bundleId;
    }

    getStreams(filename: string): string[] {
        const streams = [...this._db.query(`select distinct stream, tccService from access where filename = ? order by stream, tccService`, [filename])].map(([stream, tccService]) => computeStream(stream, tccService));
        return streams;
    }

    clearAccess(filename: string) {
        this._db.query('delete from access where filename = ?', [ filename ]);
    }

    insertAccess(filename: string, line: number, record: AccessRecord) {
        this._db.query('insert into access(filename, line, stream, accessorIdentifier, accessorIdentifierType, tccService, identifier, kind, timestamp, version) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [filename, line, record.stream, record.accessor.identifier, record.accessor.identifierType, record.tccService, record.identifier, record.kind, record.timestamp, record.version]);
        if (this._db.changes !== 1) throw new Error(`Failed to insert access record`);
    }

    clearDomain(filename: string) {
        this._db.query('delete from domain where filename = ?', [ filename ]);
    }

    insertDomain(filename: string, bundleId: string, record: DomainRecord) {
        this._db.query('insert into domain(filename, bundleId, domain, effectiveUserId, domainType, timeStamp, hasAppBundleName, context, hits, domainOwner, initiatedType, firstTimeStamp) values(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', 
                    [filename, bundleId, record.domain, record.effectiveUserId, record.domainType, record.timeStamp, record['hasApp.bundleName'], record.context, record.hits, record.domainOwner, record.initiatedType, record.firstTimeStamp]);
        if (this._db.changes !== 1) throw new Error(`Failed to insert domain record`);
    }

    getAccessSummariesByDate(filename: string, opts: { date?: string, stream?: string, bundleId?: string } = {}): Map<string, AccessSummary[]> {
        const rows = this._db.query('select stream, tccService, accessorIdentifier, timestamp, identifier, kind from access where filename = ?', [ filename ]);

        const summariesByIdentifier = new Map<string, AccessSummary>();
        for (const [stream, tccService, accessorIdentifier, timestamp, identifier, kind] of rows) {
            let timestampStart = kind === 'intervalEnd' ? undefined : timestamp;
            let timestampEnd = kind === 'intervalEnd' ? timestamp : undefined;
            let date = timestampStart ? timestampStart.substring(0, 10) : undefined;
            const existing = summariesByIdentifier.get(identifier);
            if (!existing) {
                summariesByIdentifier.set(identifier, { date, stream: computeStream(stream, tccService), bundleId: accessorIdentifier, timestampStart, timestampEnd });
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
            if (opts.stream && opts.stream !== summary.stream) continue;
            if (opts.bundleId && opts.bundleId !== summary.bundleId) continue;
            if (!summariesByDate.has(date)) {
                summariesByDate.set(date, []);
            }
            summariesByDate.get(date)!.push(summary);
        }

        for (const summaries of summariesByDate.values()) {
            summaries.sort((lhs, rhs) => -lhs.timestampStart.localeCompare(rhs.timestampStart));
        }

        return summariesByDate;
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

//

function computeStream(stream: string, tccService: string | undefined) {
    let rt = stream;
    if (rt.startsWith('com.apple.privacy.accounting.stream.')) rt = rt.substring('com.apple.privacy.accounting.stream.'.length);
    if (tccService) {
        rt += '/' + tccService;
    }
    return rt;
}
