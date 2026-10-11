-- baqala — crée le compte MySQL utilisé par l'application (à exécuter en root, une seule fois)
CREATE USER IF NOT EXISTS 'baqala'@'localhost' IDENTIFIED BY 'baqala_pwd';
CREATE USER IF NOT EXISTS 'baqala'@'%' IDENTIFIED BY 'baqala_pwd';
GRANT ALL PRIVILEGES ON baqala.* TO 'baqala'@'localhost';
GRANT ALL PRIVILEGES ON baqala.* TO 'baqala'@'%';
FLUSH PRIVILEGES;
