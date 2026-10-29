import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { UserListItem } from "../types/userDirectory.types";
import { formatAssignmentLabel, USER_ROLE_FILTER_LABELS } from "../utils/staffDisplay";

type UserTableProps = {
  users: UserListItem[];
  truncated: boolean;
  filtered: boolean;
};

const COLUMNS = ["Usuario", "Roles", "Reservas activas"];

// Read-only list: role changes live in the user detail page.
export function UserTable({ users, truncated, filtered }: UserTableProps) {
  if (users.length === 0) {
    return (
      <p className="text-muted-foreground">
        {filtered ? "Ningún usuario coincide con la búsqueda." : "Aún no hay usuarios."}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            {COLUMNS.map((title) => <TableHead key={title}>{title}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.userId}>
              <TableCell>
                <Link
                  href={`/crm/admin/usuarios/${encodeURIComponent(user.userId)}`}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {user.name ?? user.email}
                </Link>
                {user.name ? <p className="text-sm text-muted-foreground">{user.email}</p> : null}
              </TableCell>
              <TableCell>
                {user.roles.length === 0 && !user.isRunner ? (
                  <span className="text-muted-foreground">Sin rol activo</span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {user.roles.map((role) => (
                      <Badge key={role} variant="secondary">{formatAssignmentLabel(role, user.sponsorName)}</Badge>
                    ))}
                    {user.isRunner ? <Badge variant="outline">{USER_ROLE_FILTER_LABELS.runner}</Badge> : null}
                  </div>
                )}
              </TableCell>
              <TableCell>{user.activeBookings}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {truncated ? (
        <p className="text-sm text-muted-foreground">
          Se muestran los primeros 200 resultados. Afina la búsqueda o filtra por rol.
        </p>
      ) : null}
    </div>
  );
}
