--
-- PostgreSQL database dump
--

-- Dumped from database version 14.6
-- Dumped by pg_dump version 14.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: page; Type: TABLE; Schema: public; Owner: k-54n7h05h
--

CREATE TABLE public.page (
    id bigint NOT NULL,
    url text NOT NULL,
    visited timestamp without time zone NOT NULL,
    title text
);


ALTER TABLE public.page OWNER TO "k-54n7h05h";

--
-- Name: page_body; Type: TABLE; Schema: public; Owner: k-54n7h05h
--

CREATE TABLE public.page_body (
    id bigint NOT NULL,
    body tsvector
);


ALTER TABLE public.page_body OWNER TO "k-54n7h05h";

--
-- Name: page_id_seq; Type: SEQUENCE; Schema: public; Owner: k-54n7h05h
--

CREATE SEQUENCE public.page_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER TABLE public.page_id_seq OWNER TO "k-54n7h05h";

--
-- Name: page_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: k-54n7h05h
--

ALTER SEQUENCE public.page_id_seq OWNED BY public.page.id;


--
-- Name: page id; Type: DEFAULT; Schema: public; Owner: k-54n7h05h
--

ALTER TABLE ONLY public.page ALTER COLUMN id SET DEFAULT nextval('public.page_id_seq'::regclass);


--
-- Name: page_id_seq; Type: SEQUENCE SET; Schema: public; Owner: k-54n7h05h
--

SELECT pg_catalog.setval('public.page_id_seq', 1837, true);


--
-- Name: page_body page_body_pkey; Type: CONSTRAINT; Schema: public; Owner: k-54n7h05h
--

ALTER TABLE ONLY public.page_body
    ADD CONSTRAINT page_body_pkey PRIMARY KEY (id);


--
-- Name: page page_pkey; Type: CONSTRAINT; Schema: public; Owner: k-54n7h05h
--

ALTER TABLE ONLY public.page
    ADD CONSTRAINT page_pkey PRIMARY KEY (id);


--
-- Name: page page_url_key; Type: CONSTRAINT; Schema: public; Owner: k-54n7h05h
--

ALTER TABLE ONLY public.page
    ADD CONSTRAINT page_url_key UNIQUE (url);


--
-- Name: page_body fk_page_body_id; Type: FK CONSTRAINT; Schema: public; Owner: k-54n7h05h
--

ALTER TABLE ONLY public.page_body
    ADD CONSTRAINT fk_page_body_id FOREIGN KEY (id) REFERENCES public.page(id);


--
-- PostgreSQL database dump complete
--

