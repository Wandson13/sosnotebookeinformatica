UPDATE members SET name = trim(json_extract(profile, '$.fullName')) WHERE length(trim(coalesce(json_extract(profile, '$.fullName'), ''))) > 0;
