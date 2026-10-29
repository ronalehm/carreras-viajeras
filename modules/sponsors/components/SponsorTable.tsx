import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { Sponsor } from "../types/sponsors.types";

export function SponsorTable({ sponsors }: { sponsors: Sponsor[] }) {
  if (sponsors.length === 0) {
    return (
      <p className="text-muted-foreground">
        Aún no hay patrocinadores. Crea el primero con «Nuevo patrocinador».
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {["Patrocinador", "Sitio web", "Acciones"].map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sponsors.map((sponsor) => (
          <TableRow key={sponsor.id}>
            <TableCell>
              <p className="font-medium">{sponsor.name}</p>
              <p className="text-sm text-muted-foreground">{sponsor.slug}</p>
            </TableCell>
            <TableCell>
              {sponsor.websiteUrl ? (
                <a
                  href={sponsor.websiteUrl} target="_blank" rel="noopener noreferrer"
                  className="break-all text-primary underline-offset-4 hover:underline"
                >
                  {sponsor.websiteUrl}
                </a>
              ) : "—"}
            </TableCell>
            <TableCell>
              <Link
                href={`/crm/admin/patrocinadores/${sponsor.id}`}
                className={buttonVariants({ variant: "outline", size: "sm" })}
              >
                Editar
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
