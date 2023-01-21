// import { Request, RequestInit, Response } from 'node-fetch'
//import fetch from 'node-fetch'
import { resolve, URL } from 'url'
import { load, CheerioAPI } from 'cheerio'
import { queue } from 'async'
export type PageVisitorResult = void | boolean | PageVisitor | Promise<boolean | PageVisitor>;
const debug = require("debug")("spider");
export interface Page {
    url: URL
    text: string
    $: CheerioAPI
}

export interface CallbackOptions {
    callback: (response: Response) => void
}
export type FetchOptions = RequestInit & CallbackOptions

export async function fetchPage(url: string | Request, init?: Partial<FetchOptions>): Promise<Page> {
    try {
        let response = await fetch(url, init);
        if (init && init.callback) {
            init.callback(response);
        }
        let contentType = response.headers.get("content-type") || "application/octet-stream";
        let index = contentType.indexOf(";");
        if (index != -1) {
            contentType = contentType.substring(0, index);
        }
        if ("text/html" !== contentType) {
            throw new Error(`Content-Type is not text/html (=${contentType})`);
        }
        let text = await response.text();
        let $ = load(text);
        return {
            url: new URL(response.url),
            $,
            text,
        } as Page;
    } catch (err) {
        console.log(`[hunter]   error: ${err}`)
        return {
            url: new URL(''),
            text: '',
            $: load('')
        }
    }
}

export class Session {
    public async fetch(url: string | Request, init?: Partial<FetchOptions>): Promise<Page> {
        let initObj = Object.assign({}, {
            headers: {},
            callback: (r: Response) => this.callback(r)
        }, init)

        let cookie: string | undefined = undefined;
        this.cookies.forEach((v, k) => {
            if (cookie) {
                cookie += "; " + encodeURIComponent(k) + "=" + encodeURIComponent(v);
            } else {
                cookie = encodeURIComponent(k) + "=" + encodeURIComponent(v);
            }
        });

        if (cookie) {
            (initObj.headers as any)["cookie"] = cookie;
        }

        return fetchPage(url, initObj)
    }

    private callback(response: Response): void {
        let setCookie: string | undefined = response.headers.get("set-cookie") as any;
        if (setCookie) {
            for (let ch of setCookie.split(",")) {
                let i = ch.indexOf(";");
                ch = ch.substring(0, i);
                let pair = ch.split("=");
                this.cookies.set(decodeURIComponent(pair[0].trim()), decodeURIComponent(pair[1]));
            }
        }
    }

    public cookies: Map<string, string> = new Map
}

class WrappedPageVisitor {
    public beforeLoad: (url: URL) => Promise<WrappedPageVisitor | null>;
    public visit: (page: Page) => Promise<WrappedPageVisitor | null>;
    public leave: (page: Page) => Promise<void>;

    constructor(visitor: Partial<PageVisitor>) {
        const defaultVisitor: WrappedPageVisitor = this;
        function wrapPageVisitorResult<T>
            (unwrapped: (param: T) => PageVisitorResult):
            (param: T) => Promise<WrappedPageVisitor | null> {
            return (param) => {
                let result: PageVisitorResult;
                try {
                    result = unwrapped(param);
                } catch (err) {
                    return Promise.reject(err);
                }
                if (false === result) {
                    return Promise.resolve(null);
                }
                if (result && (result as any)["then"]) {
                    return (result as Promise<any>).then(r => typeof r === "object" ? r : defaultVisitor);
                }
                return Promise.resolve(typeof result === "object" ? new WrappedPageVisitor(result as PageVisitor) : defaultVisitor);
            };
        }

        let vis: PageVisitor = Object.assign({}, {
            beforeLoad() { },
            leave() { },
            visit() { }
        } as PageVisitor, visitor);
        this.beforeLoad = wrapPageVisitorResult<URL>(vis.beforeLoad);
        this.visit = wrapPageVisitorResult<Page>(vis.visit);
        this.leave = async (page) => {
            let result = vis.leave(page);
            if (result) {
                await result
            }
        };
    }
}

export interface PageVisitor {
    beforeLoad(url: URL): PageVisitorResult;
    visit(page: Page): PageVisitorResult;
    leave(page: Page): void | Promise<void>;
}

export type DownloadFunction = (url: URL) => Promise<Page>;

function fetchDownloadFunction(session: boolean, opts?: Partial<FetchOptions>): DownloadFunction {
    if (session) {
        let session: Session = new Session();
        return (url: URL) => session.fetch(url.toString(), opts);
    }
    return (url: URL) => fetchPage(url.toString(), opts);
}

function asyncDownloadQueue(rawDownloadFunction: DownloadFunction, concurrency?: number): DownloadFunction {
    interface FetchTask {
        url: URL;
        onComplete: (page: Page) => void;
        onError: (error: Error) => void;
    }
    let q = queue<FetchTask>((task, cb) => {
        rawDownloadFunction(task.url)
            .then(page => {
                cb();
                task.onComplete(page);
            }).catch(err => {
                cb();
                task.onError(err);
            });
    }, concurrency || 1);
    return (url: URL) => new Promise((res, rej) => q.push({
        url,
        onComplete: res,
        onError: rej,
    }));
}

export interface SpiderExtendedOptions extends FetchOptions {
    parallelConnections: number;
    downloadFunction: DownloadFunction;
    maxUrlSize: number;
    session: boolean;
}

export type SpiderOptions = DownloadFunction | Partial<SpiderExtendedOptions>;

export class Spider {
    private done: Set<string> = new Set();
    private maxUrlSize: number;
    private download: DownloadFunction;

    constructor(opts?: SpiderOptions) {
        if (typeof opts === "function") {
            this.download = opts;
            this.maxUrlSize = 128;
        } else {
            opts = opts || {};
            this.download = opts.downloadFunction
                || asyncDownloadQueue(fetchDownloadFunction(!!opts.session, opts), opts.parallelConnections);
            this.maxUrlSize = opts.maxUrlSize || 128;
        }
    }

    public static makeCleanUrl(url: URL | string): URL {
        let parsedUrl: URL = typeof url === "string" ? new URL(url) : url;
        parsedUrl.hash = "";
        parsedUrl.pathname = parsedUrl.pathname.endsWith("/")
            ? parsedUrl.pathname.substring(0, parsedUrl.pathname.length - 1)
            : parsedUrl.pathname;
        return parsedUrl;
    }

    public static makeUrlUnique(url: URL): string {
        return url.toString().substring(url.protocol.length).trim();
    }

    public static findLinks(page: Page): Set<string> {
        let set: Set<string> = new Set();
        page.$("a").each((_, a) => {
            let link = a.attribs.href;
            if (link) {
                set.add(resolve(page.url.toString(), link));
            }
        });
        return set;
    }

    private async processUrl(url: URL, visitor: WrappedPageVisitor) {
        let withoutProtocol = Spider.makeUrlUnique(url);
        if (this.done.has(withoutProtocol)) {
            return;
        }
        this.done.add(withoutProtocol);
        let visitorResult = await visitor.beforeLoad(url);
        if (!visitorResult) {
            return;
        }
        debug("Fetching", url.toString())
        let page: Page = await this.download(url);
        debug("Visiting", url.toString())
        let childVisitor = await visitor.visit(page);
        if (childVisitor) {
            let children: Promise<void>[] = [];
            for (let link of Spider.findLinks(page).values()) {
                let childUrl = Spider.makeCleanUrl(link);
                if (childUrl.toString().length > this.maxUrlSize) {
                    continue;
                }
                if (childUrl.protocol != "http:" && childUrl.protocol != "https:") {
                    continue;
                }
                children.push(this.processUrl(childUrl, childVisitor).catch(err => {
                    console.log(`Error ${childUrl.toString()} ${err.toString()}`)
                }));
            }
            await Promise.all(children);
        }
        debug("Leaving", url.toString())
        await visitor.leave(page);
    }

    public async visit(url: URL | string, visitor: Partial<PageVisitor>) {
        this.done.clear();
        await this.processUrl(Spider.makeCleanUrl(url), new WrappedPageVisitor(visitor));
    }
}
