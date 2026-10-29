import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import type { LeadListFilters } from "../types/leads.types";
import { leadListHref } from "../utils/leadListQuery";

type LeadPaginationProps = {
  filters: LeadListFilters;
  hasNextPage: boolean;
};

// Previous / next only (no total, no COUNT); the active filters are kept in both links.
export function LeadPagination({ filters, hasNextPage }: LeadPaginationProps) {
  const hasPreviousPage = filters.page > 1;
  if (!hasPreviousPage && !hasNextPage) return null;
  return (
    <Pagination aria-label="Paginación">
      <PaginationContent>
        {hasPreviousPage && (
          <PaginationItem>
            <PaginationPrevious
              href={leadListHref(filters, filters.page - 1)}
              text="Anterior"
              aria-label="Ir a la página anterior"
            />
          </PaginationItem>
        )}
        {hasNextPage && (
          <PaginationItem>
            <PaginationNext
              href={leadListHref(filters, filters.page + 1)}
              text="Siguiente"
              aria-label="Ir a la página siguiente"
            />
          </PaginationItem>
        )}
      </PaginationContent>
    </Pagination>
  );
}
