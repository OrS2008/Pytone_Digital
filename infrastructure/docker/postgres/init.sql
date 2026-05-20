-- Bootstrap shared databases for local dev. Each service owns its own
-- database; in production each runs against its own cluster and the
-- connection strings differ accordingly.

CREATE DATABASE auth;
CREATE DATABASE users;
CREATE DATABASE playlist;
CREATE DATABASE epg;
CREATE DATABASE dvr;
CREATE DATABASE recording;
CREATE DATABASE analytics;
CREATE DATABASE sync;
