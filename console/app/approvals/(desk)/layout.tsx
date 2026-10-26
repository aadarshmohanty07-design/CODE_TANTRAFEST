import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/approvals/SignOutButton";
import { currentApprovalAccount } from "@/lib/approvals/session";
import { accountCount } from "@/lib/approvals/service";
import { getDefaultStore } from "@/lib/approvals/store";

export const dynamic = "force-dynamic";

export default async function DeskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await currentApprovalAccount();
  if (!session) {
    const count = await accountCount(getDefaultStore());
    redirect(count === 0 ? "/approvals/setup" : "/approvals/login");
  }

  return (
    <>
      <div className="approval-deskbar">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="doc-folio">Signed in as</span>
          <span className="text-[12px] text-body">{session.account.name}</span>
        </div>
        <nav className="approval-deskbar-nav" aria-label="Approvals">
          <Link href="/approvals">Requests</Link>
          <Link href="/approvals/policy">Requirements</Link>
          <SignOutButton />
        </nav>
      </div>
      {children}
    </>
  );
}
