@echo off
"C:\Program Files\Docker\Docker\resources\bin\docker.exe" exec -i irongate-postgres psql -U postgres -d irongate < database.sql