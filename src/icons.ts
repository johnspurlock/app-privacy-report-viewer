import { Semaphore } from 'https://deno.land/x/semaphore@v1.1.0/mod.ts';

export type IconResponse = {status: number, headers: Headers, body: Uint8Array };

export function computeBundleIconHref(bundleId: string) {
    bundleId = cleanBundleId(bundleId);
    return `/icon/${bundleId}`;
}

export function computeBundleIconMarkup(bundleId: string, lastBundleId?: string): string {
    bundleId = cleanBundleId(bundleId);
    if (typeof bundleId !== 'string' || !/^[A-Za-z0-9\.-]+$/.test(bundleId) || bundleId === lastBundleId) return '';
    return `<img class="icon" src="${computeBundleIconHref(bundleId)}" />`;
}

export async function handleBundleIconRequest(bundleId: string): Promise<IconResponse> {
    bundleId = cleanBundleId(bundleId);
    const cachedResponse = cachedResponses.get(bundleId);
    if (cachedResponse) return cachedResponse;
    const release = await semaphore.acquire();
    try {
        const response = await computeIconResponse(bundleId);
        cachedResponses.set(bundleId, response);
        return response;
    } finally {
        release();
    }
}

//

const NOT_FOUND_ICON_RESPONSE: IconResponse = { status: 200, headers: new Headers({ 'Content-Type': 'image/svg+xml' }), body: new TextEncoder().encode(computeNotFoundSvg()) };

const semaphore = new Semaphore(1); // only make one request at a time to the itunes api

const cachedResponses = new Map<string, IconResponse>();

function cleanBundleId(bundleId: string): string {
    // found: terminusd/com.apple.podcasts for a subset of apple podcast requests
    return (bundleId.startsWith('terminusd/')) ? bundleId.substring('terminusd/'.length) : bundleId;
}

async function computeIconResponse(bundleId: string): Promise<IconResponse> {
    console.log(`  looking up ${bundleId}...`);
    let start = Date.now();
    const fetchResponse = await fetch(`https://itunes.apple.com/lookup?bundleId=${bundleId}`);
    const response = await fetchResponse.json() as ItunesLookupResponse;
    console.log(`  looked up ${bundleId} in ${Date.now() - start}ms`);
    if (response.results.length === 0) return NOT_FOUND_ICON_RESPONSE;
    const { artworkUrl60 } = response.results[0];
    console.log(`  fetching artworkUrl60 for ${bundleId}...`);
    start = Date.now();
    const imageResponse = await fetch(artworkUrl60);
    if (imageResponse.status !== 200) return NOT_FOUND_ICON_RESPONSE;
    const body = new Uint8Array(await imageResponse.arrayBuffer());
    console.log(`  fetched artworkUrl60 (1 of ${response.results.length}) for ${bundleId} in ${Date.now() - start}ms`);
    const { status, headers } = imageResponse;
    return { status, headers, body };
}

function computeNotFoundSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60"><rect width="100%" height="100%" fill="#cccccc" /></svg>`;
}

//

interface ItunesLookupResponse {
    readonly resultCount: number;
    readonly results: readonly ItunesLookupResult[];
}

interface ItunesLookupResult {
    readonly advisories: unknown[];
    readonly appletvScreenshotUrls: readonly string[];
    readonly artistId: number;
    readonly artistName: string;
    readonly artistViewUrl: string;
    readonly artworkUrl100: string;
    readonly artworkUrl512: string;
    readonly artworkUrl60: string;
    readonly averageUserRating: number;
    readonly averageUserRatingForCurrentVersion: number;
    readonly bundleId: string;
    readonly contentAdvisoryRating: string;
    readonly currency: string;
    readonly currentVersionReleaseDate: string;
    readonly description: string;
    readonly features: readonly string[];
    readonly fileSizeBytes: string;
    readonly formattedPrice: string;
    readonly genreIds: readonly string[];
    readonly genres: readonly string[];
    readonly ipadScreenshotUrls: readonly string[];
    readonly isGameCenterEnabled: boolean;
    readonly isVppDeviceBasedLicensingEnabled: boolean;
    readonly kind: string;
    readonly languageCodesISO2A: readonly string[];
    readonly minimumOsVersion: string;
    readonly price: number;
    readonly primaryGenreId: number;
    readonly primaryGenreName: string;
    readonly releaseDate: string;
    readonly releaseNotes: string;
    readonly screenshotUrls: readonly string[];
    readonly sellerName: string;
    readonly supportedDevices: readonly string[];
    readonly trackCensoredName: string;
    readonly trackContentRating: string;
    readonly trackId: number;
    readonly trackName: string;
    readonly trackViewUrl: string;
    readonly userRatingCount: number;
    readonly userRatingCountForCurrentVersion: number;
    readonly version: string;
    readonly wrapperType: string;
}
