import { notFound, redirect } from "next/navigation";

import { ApplicationShell } from "@/components/application-shell";
import { generateAuditOperationId } from "@/modules/audit/audit";
import { AuthenticationGuardError } from "@/modules/authentication/guards";
import { getApplicationErrorRedirect } from "@/modules/authentication/page-access";
import { requireAdministrator } from "@/modules/users/authorization";
import { listOrganisationStaff } from "@/modules/users/staff-management";

import { StaffManagement } from "./staff-management-client";

export const dynamic = "force-dynamic";

export default async function StaffPage() {
  let administrator;

  try {
    administrator = await requireAdministrator();
  } catch (error) {
    if (error instanceof AuthenticationGuardError) {
      const destination = getApplicationErrorRedirect(error.code);
      if (destination) {
        redirect(destination);
      }
      if (error.code === "FORBIDDEN") {
        notFound();
      }
    }
    throw error;
  }

  const staff = await listOrganisationStaff();

  return (
    <ApplicationShell currentPath="/personal" user={administrator}>
      <div className="page-content">
        <p className="eyebrow">{administrator.organisationName}</p>
        <h1>Personal</h1>
        <p className="introductory-text">
          Skapa och hantera medarbetarnas åtkomst till Kaul.
        </p>
        <StaffManagement
          createOperationId={generateAuditOperationId()}
          staff={staff.map((member) => ({
            ...member,
            operationId: generateAuditOperationId(),
          }))}
        />
      </div>
    </ApplicationShell>
  );
}
