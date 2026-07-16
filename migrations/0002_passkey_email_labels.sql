UPDATE "passkey"
SET "name" = (
  SELECT "email"
  FROM "user"
  WHERE "user"."id" = "passkey"."userId"
)
WHERE ("name" IS NULL OR trim("name") = '' OR "name" IN ('Primary passkey', 'Standard passkey'))
  AND EXISTS (
    SELECT 1
    FROM "user"
    WHERE "user"."id" = "passkey"."userId"
  );
