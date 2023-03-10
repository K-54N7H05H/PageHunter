import { Spider, Page } from './spider'
import { queue } from 'async'
import { default as dotenv } from 'dotenv'
import * as pg from 'pg'
import { CheerioAPI, Document, Element, Cheerio, AnyNode, load } from 'cheerio'

let spider = new Spider({
    session: true
})

dotenv.config()

const PAGEHUNTER_DATABASE_HOST = process.env.PAGEHUNTER_DATABASE_HOST
const PAGEHUNTER_DATABASE_PORT = Number.parseInt(process.env.PAGEHUNTER_DATABASE_PORT as string)
const PAGEHUNTER_DATABASE_NAME = process.env.PAGEHUNTER_DATABASE_NAME
const PAGEHUNTER_DATABASE_USER = process.env.PAGEHUNTER_DATABASE_USER
const PAGEHUNTER_DATABASE_PASS = process.env.PAGEHUNTER_DATABASE_PASS

const MAX_CRAWL = Number.parseInt(process.env.PAGEHUNTER_MAXCRAWL as string) || 0
const CRAWLSEED = process.env.PAGEHUNTER_CRAWLSEED as string || 'https://example.com'

console.log(`[hunter]   LOG  : Postgres database host       : ${PAGEHUNTER_DATABASE_HOST}`)
console.log(`[hunter]   LOG  : Postgres database port       : ${PAGEHUNTER_DATABASE_PORT}`)
console.log(`[hunter]   LOG  : Postgres database name       : ${PAGEHUNTER_DATABASE_NAME}`)
console.log(`[hunter]   LOG  : Postgres database username   : ${PAGEHUNTER_DATABASE_USER}`)
console.log(`[hunter]   LOG  : Postgres database password   : ${PAGEHUNTER_DATABASE_PASS}`)

let conn = new pg.Client({
    host: PAGEHUNTER_DATABASE_HOST,
    port: PAGEHUNTER_DATABASE_PORT,
    user: PAGEHUNTER_DATABASE_USER,
    database: PAGEHUNTER_DATABASE_NAME,
    password: PAGEHUNTER_DATABASE_PASS,
})

console.log(`[hunter]   Crawling maximum of (${MAX_CRAWL} pages from ${CRAWLSEED})`)

const PAGE_INSERT_QUERY = 'INSERT INTO page(url, title, visited) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT(url) DO UPDATE SET title=$2, visited=CURRENT_TIMESTAMP RETURNING ID'
const PAGE_BODY_INSERT_QUERY = 'INSERT INTO page_body VALUES($1, to_tsvector($2)) ON CONFLICT(id) DO UPDATE SET body=to_tsvector($2) RETURNING ID'

/******************************************************************************************************** */
const htmlInlineElements = new Set(
    `a,abbr,acronym,audio,b,bdi,bdo,big,br,button,canvas,cite,code,data,
    datalist,del,dfn,em,embed,i,iframe,img,input,ins,kbd,label,map,mark,
    meter,noscript,object,output,picture,progress,q,ruby,s,samp,script,
    select,slot,small,span,strong,sub,sup,svg,template,textarea,time,
    tt,u,var,video,wbr`
        .split(",")
        .map((s) => s.trim())
)

function walk(root: AnyNode, enter: (element: AnyNode) => void, leave: (element: AnyNode) => void): void {
    enter(root)
    if (root.type === "tag")
        for (const child of root.children)
            walk(child, enter, leave)
    leave(root)
}

function render_webpage(node: CheerioAPI | Document | string | Element | Cheerio<Element>): string {
    let root: Document | Element | null = null
    if (typeof node === "string") {
        root = load(node)("body")[0]
    } else if (typeof node === "object" && "0" in node) {
        root = node[0]
    } else if (typeof node === "object" && "children" in node && "type" in node) {
        root = node
    }

    if (!root)
        throw new Error("Node should be a string, cheerio loaded element or a cheerio node")

    let text: string = ""

    walk(root, (element: AnyNode): void => {
        if (element.type === "text")
            text += element.data
    }, (element: AnyNode): void => {
        if (element.type === "tag" && !htmlInlineElements.has(element.tagName))
            text += '\n'
    })

    return text.trim().split(/\n+/g).map((line) => line.trim()).filter(Boolean).join()
}
/********************************* */

const DATABASE_SETUP = `
CREATE TABLE IF NOT EXISTS page (
    id BIGSERIAL PRIMARY KEY NOT NULL,
    url text UNIQUE NOT NULL,
    title text NOT NULL,
    visited timestamp without time zone NOT NULL
);

CREATE TABLE IF NOT EXISTS page_body (
    id BIGINT PRIMARY KEY NOT NULL,
    body tsvector,
    CONSTRAINT fk_page_body_id FOREIGN KEY(id) REFERENCES page(id)
    );
    `

let CURR_CRAWL = 0
conn.connect((err) => {
    if (err) {
        console.error(`[hunter]   ERROR: Failed to connect to database: ${err}`)
        process.exit(-2)
    }

    console.log(`[hunter]   INFO : Opened database connection`)

    conn.query(DATABASE_SETUP).then(() => {
        console.log(`[hunter]   LOG  : Tables created / exists`)
        let CRAWL = MAX_CRAWL
        spider.visit(CRAWLSEED, {
            beforeLoad(url: URL) { return --CRAWL >= 0 },
            visit(page: Page) {
                const PAGE_URL: string = page.url.toString()
                const PAGE_TITLE: string = page.$("title").text()

                conn.query(PAGE_INSERT_QUERY, [PAGE_URL, PAGE_TITLE]).then((res) => {
                    const PAGE_ID = res.rows[0].id
                    const BODY = render_webpage(page.$("html > body"))
                        .trim()

                    conn.query(PAGE_BODY_INSERT_QUERY, [PAGE_ID, BODY]).catch((err) => {
                        console.error(`[hunter]   ERROR: ${err}`)
                    }).finally(() => {
                        CURR_CRAWL += 1
                        console.info(`[hunter]   INFO : (${CURR_CRAWL}) Indexed ${PAGE_TITLE} (${PAGE_URL})`)
                        if (CURR_CRAWL >= MAX_CRAWL) {
                            console.info(`[hunter]   INFO : Crawled & inserted ${CURR_CRAWL} pages`)
                            console.info(`[hunter]   INFO : Closing connection`)
                            conn.end()
                        }
                    })
                }).catch((err) => {
                    console.error(`[hunter]   ERROR: ${err}`)
                    CURR_CRAWL += 1
                })
            }
        }).catch(() => {
            CURR_CRAWL += 1
            console.error(`[hunter]   ERROR: Error occured`)
        }).finally(() => {
            console.info(`[hunter]   INFO : Crawled ${CURR_CRAWL} pages`)
        })
    }).catch((err) => {
        console.error(`[hunter]   ERROR: ${err}`)
    })

})

