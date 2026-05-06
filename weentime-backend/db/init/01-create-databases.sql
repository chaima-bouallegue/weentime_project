-- Create service databases used by Spring datasource URLs.
SELECT 'CREATE DATABASE organisation'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'organisation'
)\gexec

SELECT 'CREATE DATABASE organisation_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'organisation_db'
)\gexec

SELECT 'CREATE DATABASE rh_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'rh_db'
)\gexec

SELECT 'CREATE DATABASE presence_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'presence_db'
)\gexec

SELECT 'CREATE DATABASE communication_db'
WHERE NOT EXISTS (
    SELECT FROM pg_database WHERE datname = 'communication_db'
)\gexec
