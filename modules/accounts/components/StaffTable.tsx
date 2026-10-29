import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { StaffRole } from "@/lib/auth/permissions";
import { grantStaffRoleAction, revokeStaffRoleAction } from "../actions/staff.actions";
import type { StaffMember } from "../types/staff.types";
import { formatStaffDateTime, STAFF_ROLE_LABELS } from "../utils/staffDisplay";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";

type StaffTableProps = {
  staff: StaffMember[];
  // Roles the actor may grant or revoke, computed on the server; the actions still validate each one.
  manageableRoles: readonly StaffRole[];
};

function earliestGrant(roles: StaffMember["roles"]): Date {
  return new Date(Math.min(...roles.map(({ grantedAt }) => grantedAt.getTime())));
}

export function StaffTable({ staff, manageableRoles }: StaffTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Correo</TableHead>
          <TableHead>Roles</TableHead>
          <TableHead>Alta</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {staff.map((member) => {
          const activeRoles = member.roles.map(({ role }) => role);
          const grantableRoles = manageableRoles.filter((role) => !activeRoles.includes(role));
          const revocableRoles = activeRoles.filter((role) => manageableRoles.includes(role));

          return (
            <TableRow key={member.userId}>
              <TableCell>{member.email}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {activeRoles.map((role) => (
                    <Badge key={role} variant="secondary">
                      {STAFF_ROLE_LABELS[role]}
                    </Badge>
                  ))}
                </div>
              </TableCell>
              <TableCell>{formatStaffDateTime(earliestGrant(member.roles))}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-2">
                  {grantableRoles.map((role) => {
                    const label = STAFF_ROLE_LABELS[role];
                    return (
                      <ConfirmActionButton
                        key={`grant-${role}`}
                        action={grantStaffRoleAction}
                        fields={{ userId: member.userId, role }}
                        label={`Asignar ${label}`}
                        title={`¿Asignar el rol ${label}?`}
                        description={`${member.email} tendrá el rol ${label} desde su próxima petición.`}
                        confirmLabel="Asignar"
                        variant="outline"
                      />
                    );
                  })}
                  {revocableRoles.map((role) => {
                    const label = STAFF_ROLE_LABELS[role];
                    return (
                      <ConfirmActionButton
                        key={`revoke-${role}`}
                        action={revokeStaffRoleAction}
                        fields={{ userId: member.userId, role }}
                        label={`Revocar ${label}`}
                        title={`¿Revocar el rol ${label}?`}
                        description={`${member.email} dejará de tener el rol ${label} en su próxima petición.`}
                        confirmLabel="Revocar"
                        variant="destructive"
                      />
                    );
                  })}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
