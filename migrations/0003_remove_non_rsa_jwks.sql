DELETE FROM "jwks"
WHERE json_extract("publicKey", '$.kty') IS NOT 'RSA';
