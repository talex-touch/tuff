BEGIN TRANSACTION;

UPDATE auth_users
SET locale = 'zh'
WHERE locale IS NOT NULL
  AND TRIM(locale) != ''
  AND LOWER(locale) LIKE 'zh%';

UPDATE auth_users
SET locale = 'en'
WHERE locale IS NOT NULL
  AND TRIM(locale) != ''
  AND LOWER(locale) LIKE 'en%';

UPDATE auth_users
SET locale = NULL
WHERE locale IS NOT NULL
  AND TRIM(locale) != ''
  AND LOWER(locale) NOT LIKE 'zh%'
  AND LOWER(locale) NOT LIKE 'en%';

COMMIT;
