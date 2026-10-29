import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { userRoleFilterSchema } from "../schemas/userDirectory.schema";
import type { UserRoleFilter } from "../types/userDirectory.types";
import { USER_ROLE_FILTER_LABELS } from "../utils/staffDisplay";

type UserFiltersProps = {
  q?: string;
  role?: UserRoleFilter;
};

// Plain GET form: the filters live in the URL (?q=, ?rol=) and need no JavaScript.
export function UserFilters({ q, role }: UserFiltersProps) {
  return (
    <form method="get" action="/crm/admin/usuarios" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="user-filter-q">Buscar por nombre o correo</Label>
        <Input id="user-filter-q" name="q" maxLength={100} defaultValue={q} className="w-64" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="user-filter-role">Rol</Label>
        <NativeSelect id="user-filter-role" name="rol" defaultValue={role ?? ""}>
          <NativeSelectOption value="">Todos</NativeSelectOption>
          {userRoleFilterSchema.options.map((option) => (
            <NativeSelectOption key={option} value={option}>{USER_ROLE_FILTER_LABELS[option]}</NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit">Buscar</Button>
      <Link href="/crm/admin/usuarios" className={buttonVariants({ variant: "ghost" })}>Limpiar</Link>
    </form>
  );
}
