-- Mentora : troisième rôle « parent ».
-- Fichier séparé : une nouvelle valeur d'enum ne peut pas être utilisée dans la même transaction.
alter type public.user_role add value if not exists 'parent';
