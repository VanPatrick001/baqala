-- Modules activables par utilisateur (NULL = tous les modules du rôle).
-- Appliquée automatiquement par `npm run db:migrate` sur une base créée avant le 11/10/2026.
ALTER TABLE users ADD COLUMN modules JSON NULL COMMENT 'Modules autorisés (NULL = tous ceux du rôle)' AFTER pin_code_hash;
