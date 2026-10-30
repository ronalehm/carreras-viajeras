import { ConfirmActionButton } from "@/components/shared/ConfirmActionButton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { approveRoleRequestAction, rejectRoleRequestAction } from "../actions/roleRequest.actions";
import type { PendingRoleRequest } from "../types/roleRequest.types";
import { formatStaffDateTime, STAFF_ROLE_LABELS } from "../utils/staffDisplay";

type RoleRequestsTableProps = {
  requests: PendingRoleRequest[];
};

// Rendered only for actors who may manage admin; the actions check it again.
export function RoleRequestsTable({ requests }: RoleRequestsTableProps) {
  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay solicitudes pendientes.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Correo</TableHead>
          <TableHead>Rol solicitado</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Acciones</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell>{request.email}</TableCell>
            <TableCell>{STAFF_ROLE_LABELS.admin}</TableCell>
            <TableCell>{formatStaffDateTime(request.createdAt)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                <ConfirmActionButton
                  action={approveRoleRequestAction}
                  fields={{ requestId: request.id }}
                  label="Aprobar"
                  title="¿Aprobar la solicitud?"
                  description={`${request.email} recibirá el rol Admin y entrará en el CRM.`}
                  confirmLabel="Aprobar"
                  variant="outline"
                />
                <ConfirmActionButton
                  action={rejectRoleRequestAction}
                  fields={{ requestId: request.id }}
                  label="Rechazar"
                  title="¿Rechazar la solicitud?"
                  description={`${request.email} no recibirá el rol y podrá volver a solicitarlo.`}
                  confirmLabel="Rechazar"
                  variant="destructive"
                />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
