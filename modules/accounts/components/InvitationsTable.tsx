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
import { revokeInvitationAction } from "../actions/staff.actions";
import type { PendingInvitation } from "../types/staff.types";
import { formatStaffDateTime, STAFF_ROLE_LABELS } from "../utils/staffDisplay";
import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";

type InvitationsTableProps = {
  invitations: PendingInvitation[];
  // Roles whose invitations the actor may revoke, computed on the server; the action still filters.
  manageableRoles: readonly StaffRole[];
};

export function InvitationsTable({ invitations, manageableRoles }: InvitationsTableProps) {
  if (invitations.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin invitaciones pendientes</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Correo</TableHead>
          <TableHead>Rol</TableHead>
          <TableHead>Caduca</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {invitations.map((invitation) => (
          <TableRow key={invitation.id}>
            <TableCell>{invitation.email}</TableCell>
            <TableCell>{STAFF_ROLE_LABELS[invitation.role]}</TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                {formatStaffDateTime(invitation.expiresAt)}
                {invitation.expired && <Badge variant="destructive">Caducada</Badge>}
              </div>
            </TableCell>
            <TableCell>
              {manageableRoles.includes(invitation.role) && (
                <ConfirmActionButton
                  action={revokeInvitationAction}
                  fields={{ invitationId: invitation.id }}
                  label="Revocar"
                  title="¿Revocar la invitación?"
                  description={`${invitation.email} ya no podrá aceptar esta invitación.`}
                  confirmLabel="Revocar"
                  variant="destructive"
                />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
