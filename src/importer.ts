import { Database } from './database.ts';
import { AccessRecord, DomainRecordBeta2, DomainRecordBeta3, isAccessRecordBeta1, isAccessRecordBeta2, isAccessRecordBeta3, isDomainRecordBeta1, isDomainRecordBeta2, isDomainRecordBeta3 } from './model.ts';

export function importReportFile(text: string, filename: string, db: Database) {
    const lines = text.split('\n');
    console.log(`importReportFile: ${lines.length} lines`);
   
    db.clearAccess(filename);

    let recordType = '';
    let recordTypeVersion = 0;
    let foundEndOfSection = false;
    let nextLine = 1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') continue;

        if (foundEndOfSection && line === '{') {
            importDomainRecordsBeta1(lines.slice(i).join('\n'), db, filename);
            break;
        }
        // deno-lint-ignore no-explicit-any
        let obj: any;
        try {
            obj = JSON.parse(line);
        } catch {
            throw new Error(`Bad line, expected json: ${line}`);
        }
        if (typeof obj._marker === 'string') {
            const marker = obj._marker;
            // {"_marker": "<end-of-section>"}
            if (marker === '<end-of-section>') {
                foundEndOfSection = true;
            } else if (marker === '<metadata>') {
                // beta1: {"version":2,"recordType":"access","exportTimestamp":"2021-06-11T13:46:18.386-05:00","_marker":"<metadata>"}
                // beta2: {"version":3,"recordType":"access","exportTimestamp":"2021-06-25T09:51:51.222-05:00","_marker":"<metadata>"}
                // beta2: {"recordType":"networkActivity","_marker":"<metadata>","exportTimestamp":"2021-06-25T09:51:51.767-05:00","version":1}
                if (obj.recordType !== 'access' && obj.recordType !== 'networkActivity') throw new Error(`Bad metadata marker line, expected recordType=access or networkActivity: ${line}`);
                if (typeof obj.version !== 'number') throw new Error(`Bad metadata marker line, expected version: ${line}`);
                recordType = obj.recordType;
                recordTypeVersion = obj.version;
                console.log(`${recordType} version ${recordTypeVersion}`);
            } else {
                console.log(`Unhandled marker line: ${line}`);
            }
        } else if (typeof obj.type === 'string') {
            recordTypeVersion = 4;
            if (obj.type === 'access') {
                const parsed = parseAccessRecord(obj, recordTypeVersion, line);
                if (!isAccessRecordBeta3(parsed)) throw new Error(`Expected beta 3 access record`);
                const timestamp = convertZonedTimestampToUtc(parsed.timeStamp);
                const record = { ...parsed, timestamp };
                const outOfProcess = record.outOfProcess !== undefined ? record.outOfProcess.toString() : undefined;
                db.insertAccess(filename, nextLine++, record, record.category, outOfProcess);
            } else if (obj.type === 'networkActivity') {
                const parsed = parseDomainRecordBeta3(obj, line);
                const timeStamp = convertZonedTimestampToUtc(parsed.timeStamp);
                const firstTimeStamp = convertZonedTimestampToUtc(parsed.firstTimeStamp);
                const record = { ...parsed, timeStamp, firstTimeStamp };
                db.insertDomain(filename, record.bundleID, record);
            } else {
                throw new Error(`Unexpected type: ${obj.type}`);
            }
        } else if (typeof obj.version === 'number' || typeof obj.category === 'string'|| typeof obj.bundleID === 'string') {
            if (recordType === 'access') {
                const parsed = parseAccessRecord(obj, recordTypeVersion, line);
                if (!isAccessRecordBeta1(parsed) && !isAccessRecordBeta2(parsed)) throw new Error(`Expected beta 1 or 2 access record`);
                const timestamp = convertZonedTimestampToUtc(parsed.timestamp);
                const record = { ...parsed, timestamp };
                const category = isAccessRecordBeta2(parsed) ? parsed.category : undefined;
                db.insertAccess(filename, nextLine++, record, category, undefined);
            } else if (recordType === 'networkActivity') {
                const parsed = parseDomainRecordBeta2(obj, line);
                const timeStamp = convertZonedTimestampToUtc(parsed.timeStamp);
                const firstTimeStamp = convertZonedTimestampToUtc(parsed.firstTimeStamp);
                const record = { ...parsed, timeStamp, firstTimeStamp };
                db.insertDomain(filename, record.bundleID, record);
            }
        } else {
            throw new Error(`Bad line, expected access record: ${line}`);
        }
    }
}

//

// deno-lint-ignore no-explicit-any
function parseAccessRecord(obj: any, version: number, line: string): AccessRecord {
    if (version === 2) {
        // beta 1
        if (obj.version !== 3) throw new Error(`Bad line, expected version=3: ${line}`);
        if (!isAccessRecordBeta1(obj)) throw new Error(`Bad line, expected beta 1 access record: ${line}`);
        return obj;
    } else if (version === 3) {
        // beta 2
        if (!isAccessRecordBeta2(obj)) throw new Error(`Bad line, expected beta 2 access record: ${line}`);
        return obj;
    } else if (version === 4) {
        // beta 3
        if (!isAccessRecordBeta3(obj)) throw new Error(`Bad line, expected beta 3 access record: ${line}`);
        return obj;
    } else {
        throw new Error(`parseAccessRecord: Unsupported file version: ${version}`); 
    }
}

// deno-lint-ignore no-explicit-any
function parseDomainRecordBeta2(obj: any, line: string): DomainRecordBeta2 {
    // {"domain":"mask.icloud.com","firstTimeStamp":"2021-06-18T05:55:10.417-05:00","domainType":2,"timeStamp":"2021-06-23T04:02:13.891-05:00","context":"","initiatedType":"AppInitiated","hits":7,"domainOwner":"","bundleID":"com.sonos.SonosController"}
    if (!isDomainRecordBeta2(obj)) throw new Error(`Bad line, expected beta 2 domain record: ${line}`);
    return obj;
}

// deno-lint-ignore no-explicit-any
function parseDomainRecordBeta3(obj: any, line: string): DomainRecordBeta3 {
    if (!isDomainRecordBeta3(obj)) throw new Error(`Bad line, expected beta 3 domain record: ${line}`);
    return obj;
}

function importDomainRecordsBeta1(json: string, db: Database, filename: string) {
    const obj = JSON.parse(json);
    if (typeof obj !== 'object') throw new Error(`importDomainRecordsBeta1: expected object, found ${typeof obj}`);
    db.clearDomain(filename);
    for (const bundleId of Object.keys(obj)) {
        const records = obj[bundleId];
        if (!Array.isArray(records)) throw new Error(`importDomainRecordsBeta1: expected records array, found ${typeof records}`);
        for (const record of records) {
            if (!isDomainRecordBeta1(record)) throw new Error(`importDomainRecordsBeta1: Bad record: ${JSON.stringify(record)}`);
            db.insertDomain(filename, bundleId, record);
        }
    }
}

function convertZonedTimestampToUtc(zonedTimestamp: string): string {
    // 2021-06-08T18:48:49.573-05:00
    const d = new Date(zonedTimestamp);
    const rt = d.toISOString();
    return rt;
}
