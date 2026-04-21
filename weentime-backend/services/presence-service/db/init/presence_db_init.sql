
SELECT 'CREATE DATABASE presence_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'presence_db')\gexec
à
ALTER DATABASE presence_db OWNER TO weentime;
GRANT ALL PRIVILEGES ON DATABASE presence_db TO weentime;
