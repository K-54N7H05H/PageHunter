import { load, CheerioAPI } from 'cheerio'
import { URL } from 'url'

export class Crawler {
}

export interface Page {
    url: URL
    $: CheerioAPI
}
