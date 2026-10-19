-- Organização principal (Matriz, raiz da hierarquia) e sua congregação Sede, ambas ACTIVE.
-- IDs UUIDv7 fixos para que todos os ambientes referenciem os mesmos registros.
INSERT INTO "organization"."organizations" (
	"id", "legal_name", "trade_name", "cnpj",
	"street", "number", "complement", "district", "city", "state", "postal_code",
	"phone", "email", "status"
) VALUES (
	'01a14f8e-8ea4-7f34-ad19-0e85d0e1237c',
	'IGREJA EVANGELICA VIVA E EFICAZ', 'IGREJA EVANGELICA VIVA E EFICAZ', '14158325000101',
	'Av. Roseira', '1684', NULL, 'Parque Residencial dos Girassóis', 'Campo Grande', 'MS', '79091848',
	'67992550858', 'comvivati@gmail.com', 'ACTIVE'
) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "organization"."congregations" (
	"id", "organization_id", "code", "name", "cnpj",
	"street", "number", "complement", "district", "city", "state", "postal_code",
	"phone", "email", "headquarters", "status"
) VALUES (
	'01a14f8e-8ea5-7368-af3f-f594815a5aba', '01a14f8e-8ea4-7f34-ad19-0e85d0e1237c',
	'SEDE', 'IGREJA EVANGELICA VIVA E EFICAZ', '14158325000101',
	'Av. Roseira', '1684', NULL, 'Parque Residencial dos Girassóis', 'Campo Grande', 'MS', '79091848',
	'67992550858', 'comvivati@gmail.com', true, 'ACTIVE'
) ON CONFLICT ("id") DO NOTHING;
