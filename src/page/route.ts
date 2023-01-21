import { Router } from "express";
import { default as pg } from "pg";
export const route = Router()

let conn = new pg.Client({
    host: process.env.PAGEHUNTER_DATABASE_HOST,
    port: Number.parseInt(process.env.PAGEHUNTER_DATABASE_PORT as string),
    user: process.env.PAGEHUNTER_DATABASE_USER,
    database: process.env.PAGEHUNTER_DATABASE_NAME,
    password: process.env.PAGEHUNTER_DATABASE_PASS,
})

conn.connect((err) => {
    console.log(`[page] ERROR: Failed`)
})

//  Route for index page
route.get('/', (request, response): void => {
    response.render('index')
})

interface SearchResult {
    url: string
    title: string
    rank: number
}

//  Route for simple search page
route.get('/q', (request, response) => {
    console.log(`GET PARAMS: ${JSON.stringify(request.query)}`)
    response.render('result', {
        search: 'Hello',
        result: [{ url: 'https://www.google.com' }]
    })
})

const QUERY_URL = 'SELECT url, rank FROM (SELECT id AS b_id, ts_rank(body, query) AS rank FROM page_body, websearch_to_tsquery($1) query WHERE query @@ body ORDER BY rank) as page_rank INNER JOIN page p ON p.id = page_rank.b_id ORDER BY rank DESC;'
