
export interface AccessRecord {
    readonly stream: string; // e.g. com.apple.privacy.accounting.stream.tcc
    readonly accessor: { readonly identifier: string, readonly identifierType: string }; // e.g. { com.getdropbox.Dropbox, bundleID }
    readonly tccService?: string; // e.g. kTCCServicePhotos
    readonly identifier: string; // 710BDDF6-D3DB-4B90-AD4E-D6EADC575D3E
    readonly kind: string; // e.g. event
    readonly timestamp: string; // e.g. 2021-06-08T18:48:49.573-05:00
    readonly version: number; // e.g. 3;
}

// deno-lint-ignore no-explicit-any
export function isAccessRecord(obj: any): obj is AccessRecord {
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

export function checkAccessRecord(record: AccessRecord) {
    if (!record.stream.startsWith('com.apple.privacy.accounting.stream.')) throw new Error(`Bad stream: ${record.stream}`);
}

export interface DomainRecord {
    readonly domain: string;
    readonly effectiveUserId: number;
    readonly domainType: number;
    readonly timeStamp: string;
    readonly "hasApp.bundleName": string;
    readonly context: string;
    readonly hits: number;
    readonly domainOwner: string;
    readonly initiatedType: string;
    readonly firstTimeStamp: string;
}

// deno-lint-ignore no-explicit-any
export function isDomainRecord(obj: any): obj is DomainRecord {
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
