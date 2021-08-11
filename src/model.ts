export type AccessRecord = AccessRecordBeta1 | AccessRecordBeta2 | AccessRecordBeta3;

interface AccessRecordCommon {
    readonly accessor: { readonly identifier: string, readonly identifierType: string }; // e.g. { com.getdropbox.Dropbox, bundleID }
    readonly tccService?: string; // e.g. kTCCServicePhotos
    readonly identifier: string; // 710BDDF6-D3DB-4B90-AD4E-D6EADC575D3E
    readonly kind: string; // e.g. event
}

export interface AccessRecordBeta1 extends AccessRecordCommon {
    readonly stream: string; // e.g. com.apple.privacy.accounting.stream.tcc
    readonly version: number; // e.g. 3;
    readonly timestamp: string; // e.g. 2021-06-08T18:48:49.573-05:00
}

export interface AccessRecordBeta2 extends AccessRecordCommon {
    readonly category: string; // e.g. photos, contacts
    readonly timestamp: string; // e.g. 2021-06-08T18:48:49.573-05:00
}

export interface AccessRecordBeta3 extends AccessRecordCommon {
    readonly timeStamp: string; // e.g. 2021-07-07T05:52:14.106-05:00
    readonly type: string; // e.g. access
    readonly category: string; // e.g. photos, contacts
    readonly outOfProcess?: boolean;
}

// deno-lint-ignore no-explicit-any
export function isAccessRecordBeta1(obj: any): obj is AccessRecordBeta1 {
    return typeof obj === 'object'
        && typeof obj.stream === 'string'
        && typeof obj.accessor === 'object' 
        && typeof obj.accessor.identifier === 'string'
        && typeof obj.accessor.identifierType === 'string'
        && (obj.tccService === undefined || typeof obj.tccService === 'string')
        && typeof obj.identifier === 'string'
        && typeof obj.kind === 'string'
        && typeof obj.timestamp === 'string'
        && typeof obj.version === 'number'
        && Object.keys(obj).every(v => ['stream', 'accessor', 'tccService', 'identifier', 'kind', 'timestamp', 'version'].includes(v))
}

// deno-lint-ignore no-explicit-any
export function isAccessRecordBeta2(obj: any): obj is AccessRecordBeta2 {
    return typeof obj === 'object'
        && typeof obj.accessor === 'object' 
        && typeof obj.accessor.identifier === 'string'
        && typeof obj.accessor.identifierType === 'string'
        && (obj.tccService === undefined || typeof obj.tccService === 'string')
        && typeof obj.identifier === 'string'
        && typeof obj.kind === 'string'
        && typeof obj.timestamp === 'string'
        && typeof obj.category === 'string'
        && Object.keys(obj).every(v => ['stream', 'accessor', 'tccService', 'identifier', 'kind', 'timestamp', 'category'].includes(v))
}

// deno-lint-ignore no-explicit-any
export function isAccessRecordBeta3(obj: any): obj is AccessRecordBeta3 {
    return typeof obj === 'object'
        && typeof obj.accessor === 'object' 
        && typeof obj.accessor.identifier === 'string'
        && typeof obj.accessor.identifierType === 'string'
        && typeof obj.timeStamp === 'string'
        && typeof obj.kind === 'string'
        && typeof obj.type === 'string'
        && typeof obj.category === 'string'
        && typeof obj.identifier === 'string'
        && Object.keys(obj).every(v => ['accessor', 'timeStamp', 'kind', 'type', 'category', 'identifier', 'outOfProcess'].includes(v))
}

export function checkAccessRecord(record: AccessRecord): string /* timestamp */ {
    if (isAccessRecordBeta1(record) && !record.stream.startsWith('com.apple.privacy.accounting.stream.')) throw new Error(`Bad stream: ${record.stream}`);
    if (isAccessRecordBeta3(record)) return checkTimestamp('timeStamp', record.timeStamp);
    return checkTimestamp('timestamp', record.timestamp);
}

//

export type DomainRecord = DomainRecordBeta1 | DomainRecordBeta2 | DomainRecordBeta3;

interface DomainRecordCommon {
    readonly domain: string;
    readonly domainType: number;
    readonly timeStamp: string;
    readonly context: string;
    readonly hits: number;
    readonly domainOwner: string;
    readonly initiatedType: string;
    readonly firstTimeStamp: string;
}

export interface DomainRecordBeta1 extends DomainRecordCommon {
    readonly "hasApp.bundleName": string;
    readonly effectiveUserId: number;
}

export interface DomainRecordBeta2 extends DomainRecordCommon {
    readonly bundleID: string;
}

export interface DomainRecordBeta3 extends DomainRecordCommon {
    readonly bundleID: string;
    readonly type: string;
}

// deno-lint-ignore no-explicit-any
export function isDomainRecordBeta1(obj: any): obj is DomainRecordBeta1 {
    return typeof obj === 'object'
        && typeof obj.domain === 'string'
        && typeof obj.effectiveUserId === 'number'
        && typeof obj.domainType === 'number'
        && typeof obj.timeStamp === 'string'
        && typeof obj["hasApp.bundleName"] === 'string'
        && typeof obj.context === 'string'
        && typeof obj.hits === 'number'
        && typeof obj.domainOwner === 'string'
        && typeof obj.initiatedType === 'string'
        && typeof obj.firstTimeStamp === 'string'
        && Object.keys(obj).every(v => ['domain', 'effectiveUserId', 'domainType', 'timeStamp', 'hasApp.bundleName', 'context', 'hits', 'domainOwner', 'initiatedType', 'firstTimeStamp'].includes(v))
}

// deno-lint-ignore no-explicit-any
export function isDomainRecordBeta2(obj: any): obj is DomainRecordBeta2 {
    return typeof obj === 'object'
        && typeof obj.domain === 'string'
        && typeof obj.domainType === 'number'
        && typeof obj.timeStamp === 'string'
        && typeof obj.bundleID === 'string'
        && typeof obj.context === 'string'
        && typeof obj.hits === 'number'
        && typeof obj.domainOwner === 'string'
        && typeof obj.initiatedType === 'string'
        && typeof obj.firstTimeStamp === 'string'
        && Object.keys(obj).every(v => ['domain', 'domainType', 'timeStamp', 'bundleID', 'context', 'hits', 'domainOwner', 'initiatedType', 'firstTimeStamp'].includes(v))
}

// deno-lint-ignore no-explicit-any
export function isDomainRecordBeta3(obj: any): obj is DomainRecordBeta3 {
    return typeof obj === 'object'
        && typeof obj.domain === 'string'
        && typeof obj.firstTimeStamp === 'string'
        && typeof obj.context === 'string'
        && typeof obj.timeStamp === 'string'
        && typeof obj.domainType === 'number'
        && typeof obj.initiatedType === 'string'
        && typeof obj.hits === 'number'
        && typeof obj.type === 'string'
        && typeof obj.domainOwner === 'string'
        && typeof obj.bundleID === 'string'
        && Object.keys(obj).every(v => ['domain', 'domainType', 'timeStamp', 'bundleID', 'context', 'hits', 'domainOwner', 'initiatedType', 'firstTimeStamp', 'type'].includes(v))
}

export function checkDomainRecord(record: DomainRecord) {
    checkTimestamp('timeStamp', record.timeStamp);
    checkTimestamp('firstTimeStamp', record.firstTimeStamp);
}

//

export const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(\.\d{1,3})?Z$/;

//

function checkTimestamp(name: string, value: string): string {
    // 2021-06-11T05:18:04Z
    // 2021-06-08T23:48:49.573Z
    if (!TIMESTAMP.test(value)) throw new Error(`Bad ${name}: ${value}`);
    return value;
}
