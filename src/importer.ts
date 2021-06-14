import { Database } from './database.ts';
import { isAccessRecord, isDomainRecord } from './model.ts';

export function importReportFile(text: string, filename: string, db: Database) {
    const lines = text.split('\n');
    console.log(`importReportFile: ${lines.length} lines`);
   
    db.clearAccess(filename);

    let foundEndOfSection = false;
    let nextLine = 1;
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === '') continue;

        if (foundEndOfSection && line === '{') {
            importDomainRecords(lines.slice(i).join('\n'), db, filename);
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
                // {"version":2,"recordType":"access","exportTimestamp":"2021-06-11T13:46:18.386-05:00","_marker":"<metadata>"}
                if (obj.recordType !== 'access') throw new Error(`Bad metadata marker line, expected recordType=access: ${line}`);
            } else {
                console.log(`Unhandled marker line: ${line}`);
            }
        } else if (typeof obj.version === 'number') {
            if (obj.version !== 3) throw new Error(`Bad line, expected version=3: ${line}`);
            if (!isAccessRecord(obj)) throw new Error(`Bad line, expected access record: ${line}`);
            const timestamp = convertZonedTimestampToUtc(obj.timestamp);
            const record = { ...obj, timestamp };
            db.insertAccess(filename, nextLine++, record);
            
        } else {
            throw new Error(`Bad line, expected version: ${line}`);
        }
    }
}

//

function importDomainRecords(json: string, db: Database, filename: string) {
    const obj = JSON.parse(json);
    if (typeof obj !== 'object') throw new Error(`processDomainRecords: expected object, found ${typeof obj}`);
    db.clearDomain(filename);
    for (const bundleId of Object.keys(obj)) {
        const records = obj[bundleId];
        if (!Array.isArray(records)) throw new Error(`processDomainRecords: expected records array, found ${typeof records}`);
        for (const record of records) {
            if (!isDomainRecord(record)) throw new Error(`processDomainRecords: Bad record: ${JSON.stringify(record)}`);
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
