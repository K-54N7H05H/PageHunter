import { default as express } from 'express'
import { default as dotenv } from 'dotenv'
import { default as pg } from 'pg'

import path from "path";

const application = express()
// const VIEWS_DIRECTORY = path.join(__dirname + '/views')

dotenv.config()

const PAGEHUNTER_DATABASE_HOST = process.env.PAGEHUNTER_DATABASE_HOST
const PAGEHUNTER_DATABASE_PORT = Number.parseInt(process.env.PAGEHUNTER_DATABASE_PORT as string)
const PAGEHUNTER_DATABASE_NAME = process.env.PAGEHUNTER_DATABASE_NAME
const PAGEHUNTER_DATABASE_USER = process.env.PAGEHUNTER_DATABASE_USER
const PAGEHUNTER_DATABASE_PASS = process.env.PAGEHUNTER_DATABASE_PASS

console.log(`[page]   LOG  : Postgres database host       : ${PAGEHUNTER_DATABASE_HOST}`)
console.log(`[page]   LOG  : Postgres database port       : ${PAGEHUNTER_DATABASE_PORT}`)
console.log(`[page]   LOG  : Postgres database name       : ${PAGEHUNTER_DATABASE_NAME}`)
console.log(`[page]   LOG  : Postgres database username   : ${PAGEHUNTER_DATABASE_USER}`)
console.log(`[page]   LOG  : Postgres database password   : ${PAGEHUNTER_DATABASE_PASS}`)

let conn = new pg.Client({
    host: PAGEHUNTER_DATABASE_HOST,
    port: PAGEHUNTER_DATABASE_PORT,
    user: PAGEHUNTER_DATABASE_USER,
    database: PAGEHUNTER_DATABASE_NAME,
    password: PAGEHUNTER_DATABASE_PASS,
})


export const route = express.Router()
route.get('/', (request, response): void => {
    response.render('index')
})

const SEARCH_QUERY = 'SELECT title, url, rank FROM (SELECT id AS b_id, ts_rank(body, query) AS rank FROM page_body, websearch_to_tsquery($1) query WHERE query @@ body ORDER BY rank) as page_rank INNER JOIN page p ON p.id = page_rank.b_id ORDER BY rank DESC;'

//  Route for simple search page
route.get('/q', (request, response) => {
    let TIME = Date.now()
    console.log(`GET PARAMS: search=${request.query.search}`)
    conn.query(SEARCH_QUERY, [request.query.search]).then((res) => {
        response.render('result', {
            search: request.query.search,
            result: res.rows,
            req_time: TIME
        })
    }).catch((err) => {
        console.error(`[page]   ERROR: ${err}`)
    })
})

const QUERY_URL = 'SELECT url, rank FROM (SELECT id AS b_id, ts_rank(body, query) AS rank FROM page_body, websearch_to_tsquery($1) query WHERE query @@ body ORDER BY rank) as page_rank INNER JOIN page p ON p.id = page_rank.b_id ORDER BY rank DESC;'


conn.connect((err) => {
    if (err) {
        console.error(`[page] ERROR: Failed to connect to database: ${err}`)
        process.exit(-2)
    }

    application.set('view engine', 'ejs');

    const PORT = Number.parseInt(process.env.PORT as string) || 3000
    application.use(route)
    application.listen(PORT)

    console.info(`[page]   INFO : Listening on port ${PORT}`)
})
