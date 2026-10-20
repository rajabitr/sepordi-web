import "server-only";

import type { ImportJobView, ImportRowView } from "@/components/panel/products/catalog";
import { getCatalogImportJob, listCatalogImportJobRows } from "@/server/bizin/client";

/** The first page of failed products is what a seller can act on; the full list is the CSV export in Bizin. */
const FAILED_ROWS_LIMIT = 200;

export interface JobSnapshot {
  job: ImportJobView;
  failedRows: ImportRowView[];
  moreFailed: boolean;
}

export async function loadJobSnapshot(ext: string, jobId: string, job?: ImportJobView): Promise<JobSnapshot> {
  const current = job ?? (await getCatalogImportJob(ext, jobId));
  if (current.counts.failed === 0 && !(current.result && current.result.failed > 0)) {
    return { job: current, failedRows: [], moreFailed: false };
  }
  const page = await listCatalogImportJobRows(ext, jobId, { action: "fail", limit: FAILED_ROWS_LIMIT });
  return { job: current, failedRows: page.rows, moreFailed: page.next_cursor !== null };
}
