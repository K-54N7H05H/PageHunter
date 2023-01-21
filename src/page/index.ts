import { default as express } from 'express'
import { default as dotenv } from 'dotenv'
import { default as pg } from 'pg'

import path from "path";

const application = express()
// const VIEWS_DIRECTORY = path.join(__dirname + '/views')

dotenv.config()

let conn = new pg.Client({
    host: process.env.PAGEHUNTER_DATABASE_HOST,
    port: Number.parseInt(process.env.PAGEHUNTER_DATABASE_PORT as string),
    user: process.env.PAGEHUNTER_DATABASE_USER,
    database: process.env.PAGEHUNTER_DATABASE_NAME,
    password: process.env.PAGEHUNTER_DATABASE_PASS,
})


export const route = express.Router()
//  Route for index page
route.get('/', (request, response): void => {
    response.render('index')
})

const SEARCH_QUERY = 'SELECT title, url, rank FROM (SELECT id AS b_id, ts_rank(body, query) AS rank FROM page_body, websearch_to_tsquery($1) query WHERE query @@ body ORDER BY rank) as page_rank INNER JOIN page p ON p.id = page_rank.b_id ORDER BY rank DESC;'

//  Route for simple search page
route.get('/q', (request, response) => {
    let TIME = Date.now()
    console.log(`GET PARAMS: ${JSON.stringify(request.query)}`)
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
    // application.set('views', VIEWS_DIRECTORY)

    application.use(route)
    application.listen(3000)
})
