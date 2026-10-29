# Auditoría SQL local

Motor: PGlite0.5.13 (PostgreSQL WASM real).

Resultado: 138/138 comprobaciones correctas; 0 fallidas; cero omitidas.

Se verificaron los bytes de SQL y snapshots0000–0009 y las entradas históricas del journal contra origin/main. Las migraciones0000–0009 se aplicaron en orden con autocommit por statement-breakpoint.0010 se ejecutó completa dentro de una transacción BEGIN/COMMIT después de crear datos preexistentes.

Los casos prueban perfiles, documentos, emergencia, consentimiento, teléfono, marcas, roles/marca, invitaciones, claves foráneas, revisión/destacados de viajes y preservación de organizador. Los rechazos comprueban SQLSTATE y la restricción esperada.

Limitación: valida SQL y restricciones con PostgreSQL local embebido; no acredita permisos, red, disponibilidad ni migraciones aplicadas en Neon. No se cambió SQL ni se ejecutó operación remota.

1. PASS — Journal entries0000–0009 match origin/main exactly
2. PASS — Historical bytes unchanged: drizzle/0000_tough_thor.sql
3. PASS — Historical bytes unchanged: drizzle/meta/0000_snapshot.json
4. PASS — Historical bytes unchanged: drizzle/0001_young_korvac.sql
5. PASS — Historical bytes unchanged: drizzle/meta/0001_snapshot.json
6. PASS — Historical bytes unchanged: drizzle/0002_tough_warpath.sql
7. PASS — Historical bytes unchanged: drizzle/meta/0002_snapshot.json
8. PASS — Historical bytes unchanged: drizzle/0003_talented_skin.sql
9. PASS — Historical bytes unchanged: drizzle/meta/0003_snapshot.json
10. PASS — Historical bytes unchanged: drizzle/0004_sloppy_bushwacker.sql
11. PASS — Historical bytes unchanged: drizzle/meta/0004_snapshot.json
12. PASS — Historical bytes unchanged: drizzle/0005_supreme_pepper_potts.sql
13. PASS — Historical bytes unchanged: drizzle/meta/0005_snapshot.json
14. PASS — Historical bytes unchanged: drizzle/0006_flashy_bastion.sql
15. PASS — Historical bytes unchanged: drizzle/meta/0006_snapshot.json
16. PASS — Historical bytes unchanged: drizzle/0007_awesome_dust.sql
17. PASS — Historical bytes unchanged: drizzle/meta/0007_snapshot.json
18. PASS — Historical bytes unchanged: drizzle/0008_moaning_roulette.sql
19. PASS — Historical bytes unchanged: drizzle/meta/0008_snapshot.json
20. PASS — Historical bytes unchanged: drizzle/0009_chilly_patriot.sql
21. PASS — Historical bytes unchanged: drizzle/meta/0009_snapshot.json
22. PASS — Apply 0000_tough_thor with committed statement breakpoints
23. PASS — Apply 0001_young_korvac with committed statement breakpoints
24. PASS — Apply 0002_tough_warpath with committed statement breakpoints
25. PASS — Apply 0003_talented_skin with committed statement breakpoints
26. PASS — Apply 0004_sloppy_bushwacker with committed statement breakpoints
27. PASS — Apply 0005_supreme_pepper_potts with committed statement breakpoints
28. PASS — Apply 0006_flashy_bastion with committed statement breakpoints
29. PASS — Apply 0007_awesome_dust with committed statement breakpoints
30. PASS — Apply 0008_moaning_roulette with committed statement breakpoints
31. PASS — Apply 0009_chilly_patriot with committed statement breakpoints
32. PASS — Apply entire0010 migration in ONE transaction, including ADD VALUE sponsor
33. PASS — Preexisting organizer trip and audit fields survive0010 exactly
34. PASS — Preexisting roles survive0010 without sponsor assignment
35. PASS — Preexisting trip gets only safe sponsor defaults
36. PASS — Organizer index and FK remain installed
37. PASS — staff_role retains all existing labels and appends sponsor
38. PASS — Runner minimal profile accepts a Clerk user without staff profile
39. PASS — Runner complete profile, document, emergency, consent and enums accepted
40. PASS — Runner rejects uppercase email
41. PASS — Runner rejects email longer than254
42. PASS — Runner rejects one-character name
43. PASS — Runner rejects121-character name
44. PASS — Runner rejects local phone without international prefix
45. PASS — Runner rejects international phone starting zero
46. PASS — Runner rejects too-short international phone
47. PASS — Runner rejects too-long international phone
48. PASS — Runner rejects one-character country
49. PASS — Runner rejects81-character country
50. PASS — Runner rejects one-character city
51. PASS — Runner rejects81-character city
52. PASS — Runner rejects birth date before1900
53. PASS — Document type without document number rejected
54. PASS — Document number without document type rejected
55. PASS — Document expiry without document rejected
56. PASS — Document lowercase number rejected
57. PASS — Document punctuation rejected
58. PASS — Document three-character number rejected
59. PASS — Document21-character number rejected
60. PASS — Document lower-bound number length4 accepted
61. PASS — Document upper-bound number length20 accepted
62. PASS — Emergency name without phone rejected
63. PASS — Emergency phone without name rejected
64. PASS — Emergency invalid phone rejected
65. PASS — Emergency one-character name rejected
66. PASS — Emergency121-character name rejected
67. PASS — Consent empty version rejected
68. PASS — Consent41-character version rejected
69. PASS — Consent null version rejected
70. PASS — Consent null timestamp rejected
71. PASS — Consent40-character version accepted
72. PASS — Medical notes501 characters rejected
73. PASS — Medical notes500 characters accepted
74. PASS — Personal best61 characters rejected
75. PASS — Club81 characters rejected
76. PASS — Sponsor brand valid minimal row accepted
77. PASS — Sponsor brand HTTPS assets and valid description accepted
78. PASS — Sponsor slug duplicate rejected
79. PASS — Sponsor slug uppercase rejected
80. PASS — Sponsor slug too short rejected
81. PASS — Sponsor slug81 characters rejected
82. PASS — Sponsor leading hyphen slug rejected
83. PASS — Sponsor consecutive hyphens slug rejected
84. PASS — Sponsor one-character name rejected
85. PASS — Sponsor81-character name rejected
86. PASS — Sponsor non-HTTPS logo rejected
87. PASS — Sponsor non-HTTPS website rejected
88. PASS — Sponsor2049-character logo rejected
89. PASS — Sponsor2049-character website rejected
90. PASS — Sponsor nine-character description rejected
91. PASS — Sponsor501-character description rejected
92. PASS — Sponsor unknown creator FK rejected
93. PASS — Existing commercial role with no brand accepted
94. PASS — Non-sponsor commercial role with brand rejected
95. PASS — Existing admin role with no brand accepted
96. PASS — Non-sponsor admin role with brand rejected
97. PASS — Existing super_admin role with no brand accepted
98. PASS — Non-sponsor super_admin role with brand rejected
99. PASS — Existing organizer role with no brand accepted
100. PASS — Non-sponsor organizer role with brand rejected
101. PASS — Sponsor assignment without brand rejected
102. PASS — Sponsor assignment with valid brand accepted
103. PASS — Sponsor assignment unknown brand FK rejected
104. PASS — Sponsor assignment unknown user FK rejected
105. PASS — Existing commercial invitation without brand accepted
106. PASS — Non-sponsor commercial invitation with brand rejected
107. PASS — Existing admin invitation without brand accepted
108. PASS — Non-sponsor admin invitation with brand rejected
109. PASS — Existing super_admin invitation without brand accepted
110. PASS — Non-sponsor super_admin invitation with brand rejected
111. PASS — Existing organizer invitation without brand accepted
112. PASS — Non-sponsor organizer invitation with brand rejected
113. PASS — Sponsor invitation without brand rejected
114. PASS — Sponsor invitation with valid brand accepted
115. PASS — Sponsor invitation unknown brand FK rejected
116. PASS — Team draft accepts unchanged organizer with no sponsor
117. PASS — Sponsor draft accepts brand and preserves organizer
118. PASS — Sponsor draft in_review without note accepted
119. PASS — Sponsor draft changes_requested with note accepted
120. PASS — Published sponsor trip can be featured without review
121. PASS — Published team trip can be featured without review
122. PASS — Draft trip cannot be featured
123. PASS — Archived trip cannot be featured
124. PASS — Review status without sponsor rejected
125. PASS — Review status on published sponsor rejected
126. PASS — Review status on archived sponsor rejected
127. PASS — changes_requested without note rejected
128. PASS — NULL review_status with note rejected (three-valued logic regression)
129. PASS — in_review with note rejected
130. PASS — Review note length2 rejected
131. PASS — Review note length501 rejected
132. PASS — Review note lower bound3 accepted
133. PASS — Review note upper bound500 accepted
134. PASS — Trip unknown sponsor FK rejected
135. PASS — Trip unknown organizer FK still rejected
136. PASS — Referenced sponsor cannot be deleted (PostgreSQL RESTRICT SQLSTATE23001)
137. PASS — Existing organizer role still joins only its own trip
138. PASS — 0010 new CHECK, PK, FK and NOT NULL constraints are validated in PostgreSQL catalogs

## Conteos y diagnóstico del motor

282 aserciones explícitas de JavaScript dentro de 138 comprobaciones; 138 correctas, 0 fallidas y ninguna omitida.

Motor exacto: PostgreSQL 18.6 (PGlite 0.5.13) on wasm32-unknown-emscripten, compiled by emcc (Emscripten gcc/clang-like replacement + linker emulating GNU ld) 6.0.5 (1db513782be24469589d7cb8a1f1834e9a33f271), 32-bit. El catálogo incluye14 restricciones NOT NULL de PostgreSQL18 además de25 CHECK,2 PK y1 FK seleccionadas por sus nombres nuevos:42 restricciones validadas en ese conjunto. Las tres FK nuevas hacia sponsors se ejercitaron además con inserciones inválidas. ON DELETE RESTRICT devuelve SQLSTATE23001 en este motor; los rechazos por referencia al insertar devuelven23503. Las expectativas del arnés se ajustaron a estos comportamientos observados y se ejecutó de nuevo toda la auditoría; no se cambió SQL.
